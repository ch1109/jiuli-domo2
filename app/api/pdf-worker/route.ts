import { readFile } from "node:fs/promises";
import path from "node:path";
export async function GET() {
  return new Response(
    new Uint8Array(
      await readFile(
        path.join(
          process.cwd(),
          "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
        ),
      ),
    ),
    { headers: { "Content-Type": "text/javascript" } },
  );
}
