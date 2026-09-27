import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function testOpenDota({ db, role, test, admin, viewer }) {
  const before = (await db.query("select public.league_snapshot() as value")).rows[0].value;
  await db.exec(await readFile(new URL("../supabase/migrations/202609230001_opendota_import.sql", import.meta.url), "utf8"));
  const players = before.players;
  await test("OpenDota migration preserves every historical row and adds only nullable account IDs", async () => {
    const after = (await db.query("select public.league_snapshot() as value")).rows[0].value;
    for (const player of after.players) { assert.equal(player.dota_account_id, null); delete player.dota_account_id; }
    assert.deepEqual(after, before);
  });
  await test("admin can assign, edit and clear a Dota Account ID", async () => {
    for (const account of [123456789, 123456788, null, 123456789]) {
      const result = await role(admin, tx => tx.query("update public.players set dota_account_id=$1 where id=$2 returning dota_account_id", [account, players[0].id]));
      assert.equal(result.rows[0].dota_account_id, account);
    }
  });
  await test("duplicate account mapping is rejected by PostgreSQL", async () => {
    await assert.rejects(role(admin, tx => tx.query("update public.players set dota_account_id=123456789 where id=$1", [players[1].id])), e => e.code === "23505");
  });
  await test("invalid and anonymous account IDs cannot be persisted", async () => {
    for (const account of [0, -1, 4294967295, 76561198000000000])
      await assert.rejects(role(admin, tx => tx.query("update public.players set dota_account_id=$1 where id=$2", [account, players[1].id])), e => e.code === "23514");
  });
  for (const who of ["anon", viewer]) {
    await test(who + " cannot assign or change Dota account mappings", async () => {
      if (who === "anon") await assert.rejects(role(who, tx => tx.query("update public.players set dota_account_id=999 where id=$1", [players[0].id])), e => e.code === "42501");
      else assert.equal((await role(who, tx => tx.query("update public.players set dota_account_id=999 where id=$1 returning id", [players[0].id]))).rows.length, 0);
      assert.equal((await db.query("select dota_account_id from public.players where id=$1", [players[0].id])).rows[0].dota_account_id, 123456789);
    });
  }
  await test("Dota Match ID already has database uniqueness including concurrent stale-client protection", async () => {
    const definition = await db.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.matches'::regclass and contype='u'");
    assert.ok(definition.rows.some(r => r.definition === "UNIQUE (dota_match_id)"));
    await assert.rejects(db.transaction(async tx => {
      await tx.query("insert into public.matches(winner_team,dota_match_id) values ('radiant','888888888888')");
      await tx.query("insert into public.matches(winner_team,dota_match_id) values ('dire','888888888888')");
    }), e => e.code === "23505");
  });
}
