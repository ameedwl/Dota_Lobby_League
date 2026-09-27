import { handleOpenDotaRequest } from "@/lib/opendota-server";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  return handleOpenDotaRequest(request, (await context.params).matchId);
}
