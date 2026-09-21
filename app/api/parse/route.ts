import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const sourceFileId = String(form.get("sourceFileId") ?? "");
  const materialType = String(form.get("materialType") ?? "") || undefined;
  const customerId = String(form.get("customerId") ?? "") || undefined;
  if (!(file instanceof File) || !sourceFileId) return Response.json({ errorCode: "INVALID_REQUEST", errorMessage: "缺少文件或来源文件 ID" }, { status: 400 });
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) return Response.json({ errorCode: "INVALID_FILE_SIZE", errorMessage: "文件大小需大于 0 且不超过 20MB" }, { status: 400 });
  const extension = extname(file.name).toLowerCase();
  if ([".jpg", ".jpeg", ".png"].includes(extension)) return Response.json({ errorCode: "OCR_REQUIRED", errorMessage: "图片材料需要后续 OCR 或人工复核" }, { status: 422 });
  if (![".pdf", ".xlsx", ".xls"].includes(extension)) return Response.json({ errorCode: "UNSUPPORTED_FILE_TYPE", errorMessage: `本地解析器暂不支持 ${extension || "无扩展名文件"}` }, { status: 415 });
  const workdir = await mkdtemp(join(tmpdir(), "jiuli-parse-"));
  const filePath = join(workdir, file.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
  try {
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    const { stdout } = await execFileAsync("python3", ["demo-generated/scripts/parse_adapter.py", filePath, "--source-file-id", sourceFileId, ...(materialType ? ["--material-type", materialType] : []), ...(customerId ? ["--customer-id", customerId] : [])], { maxBuffer: 10 * 1024 * 1024 });
    return Response.json(JSON.parse(stdout));
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    if (processError.stdout) {
      try {
        const payload = JSON.parse(processError.stdout) as { errorCode?: string; errorMessage?: string };
        if (payload.errorCode) return Response.json(payload, { status: 422 });
      } catch { /* Fall through to a stable adapter error. */ }
    }
    const message = processError.stderr?.trim().split("\n").at(-1) || processError.message || "解析器执行失败";
    return Response.json({ errorCode: "ADAPTER_FAILED", errorMessage: message }, { status: 422 });
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
