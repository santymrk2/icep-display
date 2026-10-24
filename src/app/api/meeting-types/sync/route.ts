import { error, json } from "@/lib/http";
import { meetingTypesView, notionConfigured, syncNotion } from "@/lib/notion";

export async function POST() {
  if (!notionConfigured()) return error("Falta configurar NOTION_TOKEN y NOTION_DATABASE_ID en el .env del servidor");
  await syncNotion();
  return json(await meetingTypesView());
}
