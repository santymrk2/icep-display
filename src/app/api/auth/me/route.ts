import { cookieValue, userFromToken } from "@/lib/auth";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await userFromToken(cookieValue(req.headers.get("cookie")));
  if (!user) return error("No autenticado", 401);
  return json({ id: user.id, username: user.username, role: user.role });
}
