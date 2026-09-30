import { createUserSchema } from "@/contracts";
import { createUser, listUsers } from "@/server/auth";
import { api, json, readJson, requirePrincipal } from "@/server/http";
export async function GET(request: Request) {
  return api(async () =>
    json({ users: await listUsers(await requirePrincipal(request)) }),
  );
}
export async function POST(request: Request) {
  return api(async () => {
    const principal = await requirePrincipal(request, { write: true });
    return json(
      {
        user: await createUser(
          principal,
          await readJson(request, createUserSchema),
        ),
      },
      201,
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
