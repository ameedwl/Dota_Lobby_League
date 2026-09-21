-- Apply manually after the existing league migrations. No match/player data is changed.
begin;

create table public.match_screenshots (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.matches(id) on delete cascade,
 storage_path text not null unique,
 sort_order integer not null check (sort_order between 1 and 3),
 created_at timestamptz not null default now(),
 -- Three unique numbered slots enforce the cap even for concurrent/direct writes.
 unique(match_id,sort_order),
 check (storage_path ~ ('^matches/' || match_id::text || '/' || id::text || '\.(jpg|png|webp)$'))
);

-- Durable work list: the browser deletes bytes via Storage API, never via SQL.
-- No match FK: cleanup must survive deletion of the parent match.
create table public.screenshot_cleanup (
 storage_path text primary key,
 cleanup_after timestamptz not null default now(),
 upload_pending boolean not null default false,
 created_at timestamptz not null default now()
);
create index screenshot_cleanup_ready_idx on public.screenshot_cleanup(cleanup_after,created_at);
alter table public.match_screenshots enable row level security;
alter table public.screenshot_cleanup enable row level security;
revoke all on public.match_screenshots,public.screenshot_cleanup from public,anon,authenticated;
grant select on public.match_screenshots to anon,authenticated;
grant insert,delete on public.match_screenshots to authenticated;
grant select on public.screenshot_cleanup to authenticated;
create policy screenshots_public_read on public.match_screenshots for select to anon,authenticated using (true);
create policy screenshots_admin_insert on public.match_screenshots for insert to authenticated with check ((select private.is_admin()));
create policy screenshots_admin_delete on public.match_screenshots for delete to authenticated using ((select private.is_admin()));
create policy screenshot_cleanup_admin_read on public.screenshot_cleanup for select to authenticated using ((select private.is_admin()));

create function private.screenshot_path_valid(p_path text) returns boolean
language sql immutable set search_path='' as $$
 select p_path ~ '^matches/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$';
$$;
revoke all on function private.screenshot_path_valid(text) from public,anon,authenticated;
grant execute on function private.screenshot_path_valid(text) to authenticated;

create function private.check_screenshot_object() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if exists(select 1 from public.screenshot_cleanup where storage_path=new.storage_path and (not upload_pending or cleanup_after<=now())) then
  raise exception 'This upload is pending cleanup. Upload the file again.' using errcode='23514';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='match-screenshots' and name=new.storage_path) then
  raise exception 'Upload the screenshot to Storage before attaching it.' using errcode='23514';
 end if;
 delete from public.screenshot_cleanup where storage_path=new.storage_path;
 return new;
end; $$;
revoke all on function private.check_screenshot_object() from public,anon,authenticated;
create trigger screenshot_object_required before insert on public.match_screenshots
 for each row execute function private.check_screenshot_object();

create function private.queue_deleted_screenshot() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into public.screenshot_cleanup(storage_path) values(old.storage_path) on conflict do nothing;
 return old;
end; $$;
revoke all on function private.queue_deleted_screenshot() from public,anon,authenticated;
create trigger screenshot_deleted after delete on public.match_screenshots
 for each row execute function private.queue_deleted_screenshot();

-- Register cleanup BEFORE sending bytes. If the browser closes mid-upload, a
-- later admin session removes unattached files after this one-hour grace period.
create function public.prepare_screenshot_upload(p_path text) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if not private.screenshot_path_valid(p_path) then raise exception 'Invalid screenshot path.' using errcode='23514'; end if;
 if not exists(select 1 from public.matches where id::text=split_part(p_path,'/',2)) then
  raise exception 'This match no longer exists.' using errcode='23503';
 end if;
 if exists(select 1 from public.match_screenshots where storage_path=p_path) then
  raise exception 'Screenshot already attached.' using errcode='23505';
 end if;
 insert into public.screenshot_cleanup(storage_path,cleanup_after,upload_pending)
 values(p_path,now()+interval '1 hour',true);
end; $$;
revoke all on function public.prepare_screenshot_upload(text) from public,anon,authenticated;
grant execute on function public.prepare_screenshot_upload(text) to authenticated;

-- Failed/ambiguous uploads may be queued only when no live screenshot references them.
create function public.discard_screenshot_upload(p_path text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if not private.screenshot_path_valid(p_path) then raise exception 'Invalid screenshot path.' using errcode='23514'; end if;
 if exists(select 1 from public.match_screenshots where storage_path=p_path) then return false; end if;
 insert into public.screenshot_cleanup(storage_path) values(p_path) on conflict(storage_path) do update set cleanup_after=now(),upload_pending=false;
 return true;
end; $$;
revoke all on function public.discard_screenshot_upload(text) from public,anon,authenticated;
grant execute on function public.discard_screenshot_upload(text) to authenticated;

create function public.complete_screenshot_cleanup(p_path text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 if not private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if exists(select 1 from public.screenshot_cleanup where storage_path=p_path and cleanup_after>now()) then return false; end if;
 if exists(select 1 from storage.objects where bucket_id='match-screenshots' and name=p_path) then return false; end if;
 delete from public.screenshot_cleanup where storage_path=p_path;
 return true;
end; $$;
revoke all on function public.complete_screenshot_cleanup(text) from public,anon,authenticated;
grant execute on function public.complete_screenshot_cleanup(text) to authenticated;

-- Bucket configuration is created locally in this migration, for manual application.
-- Deliberately no ON CONFLICT: unexpected existing bucket configuration needs review.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('match-screenshots','match-screenshots',true,10485760,array['image/jpeg','image/png','image/webp']);

-- Public URLs serve bytes without a session; SELECT also allows public metadata reads.
create policy match_screenshots_storage_read on storage.objects for select to anon,authenticated
 using (bucket_id='match-screenshots');
create policy match_screenshots_storage_insert on storage.objects for insert to authenticated
 with check (bucket_id='match-screenshots' and (select private.is_admin())
  and private.screenshot_path_valid(name)
  and exists(select 1 from public.matches where id::text=split_part(name,'/',2)));
create policy match_screenshots_storage_update on storage.objects for update to authenticated
 using (bucket_id='match-screenshots' and (select private.is_admin()))
 with check (bucket_id='match-screenshots' and (select private.is_admin())
  and private.screenshot_path_valid(name)
  and exists(select 1 from public.matches where id::text=split_part(name,'/',2)));
-- Delete metadata first. This protects a committed attachment during ambiguous responses.
create policy match_screenshots_storage_delete on storage.objects for delete to authenticated
 using (bucket_id='match-screenshots' and (select private.is_admin())
  and not exists(select 1 from public.match_screenshots where storage_path=name)
  and not exists(select 1 from public.screenshot_cleanup where storage_path=name and cleanup_after>now()));

-- Restrictive guards prevent unrelated permissive Storage policies from accidentally
-- granting writes in this bucket. Other buckets retain their existing policies.
create policy match_screenshots_storage_insert_guard on storage.objects as restrictive for insert to authenticated
 with check (bucket_id<>'match-screenshots' or ((select private.is_admin())
  and private.screenshot_path_valid(name)
  and exists(select 1 from public.matches where id::text=split_part(name,'/',2))));
create policy match_screenshots_storage_update_guard on storage.objects as restrictive for update to authenticated
 using (bucket_id<>'match-screenshots' or ((select private.is_admin())))
 with check (bucket_id<>'match-screenshots' or ((select private.is_admin())
  and private.screenshot_path_valid(name)
  and exists(select 1 from public.matches where id::text=split_part(name,'/',2))));
create policy match_screenshots_storage_delete_guard on storage.objects as restrictive for delete to authenticated
 using (bucket_id<>'match-screenshots' or ((select private.is_admin())
  and not exists(select 1 from public.match_screenshots where storage_path=name)
  and not exists(select 1 from public.screenshot_cleanup where storage_path=name and cleanup_after>now())));

create policy match_screenshots_storage_anon_insert_guard on storage.objects as restrictive for insert to anon
 with check (bucket_id<>'match-screenshots');
create policy match_screenshots_storage_anon_update_guard on storage.objects as restrictive for update to anon
 using (bucket_id<>'match-screenshots') with check (bucket_id<>'match-screenshots');
create policy match_screenshots_storage_anon_delete_guard on storage.objects as restrictive for delete to anon
 using (bucket_id<>'match-screenshots');

notify pgrst, 'reload schema';
commit;
