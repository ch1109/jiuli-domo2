import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import files from "@/demo-generated/mock/source-files.json";

function getMimeType(extension: string): string {
  const ext = extension.toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function findFileRecursively(dir: string, filename: string): Promise<string | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await findFileRecursively(fullPath, filename);
        if (found) return found;
      } else if (entry.isFile() && entry.name === filename) {
        return fullPath;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const file = files.find((file) => file.id === id);
  if (!file) return new Response("材料不存在", { status: 404 });

  let resolvedPath: string | null = null;
  const directPath = path.join(process.cwd(), file.path);
  if (existsSync(directPath)) {
    resolvedPath = directPath;
  } else {
    // 尝试在 sampleId 目录下查找该文件
    const filename = path.basename(file.path);
    if (file.sampleId) {
      const sampleDir = path.join(process.cwd(), "真实整单样本", file.sampleId);
      if (existsSync(sampleDir)) {
        resolvedPath = await findFileRecursively(sampleDir, filename);
      }
    }
    if (!resolvedPath) {
      const baseSamplesDir = path.join(process.cwd(), "真实整单样本");
      resolvedPath = await findFileRecursively(baseSamplesDir, filename);
    }
  }

  if (!resolvedPath) {
    return new Response("原文件不可用", { status: 404 });
  }

  try {
    const data = await readFile(resolvedPath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": getMimeType(file.extension || path.extname(resolvedPath)),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("原文件不可用", { status: 404 });
  }
}
