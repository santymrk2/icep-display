import { clearedCookie, cookieValue, destroySession } from "@/lib/auth";

export async function POST(req: Request) {
  const token = cookieValue(req.headers.get("cookie"));
  if (token) await destroySession(token);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "set-cookie": clearedCookie() },
  });
}
