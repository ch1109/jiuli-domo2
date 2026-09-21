import { readFile } from "node:fs/promises";
import path from "node:path";
import files from "@/demo-generated/mock/source-files.json";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const file = files.find((file) => file.id === id);
  if (!file) return new Response("材料不存在", { status: 404 });
  const prefix='真实整单样本/';
  if(!file.path.startsWith(prefix)) return new Response('材料不存在',{status:404});
  try {
    const data = await readFile(path.join(process.cwd(), '真实整单样本', file.path.slice(prefix.length)));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type":
          file.extension === ".pdf"
            ? "application/pdf"
            : "application/octet-stream",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("原文件不可用", { status: 404 });
  }
}
