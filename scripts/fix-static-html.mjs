import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const outputRoot = fileURLToPath(new URL("../dist/client/", import.meta.url));
const defaultViewport = '<meta name="viewport" content="width=device-width, initial-scale=1"/>';
const safeAreaViewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>';

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return htmlFiles(path);
      return entry.isFile() && entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return nested.flat();
}

const files = await htmlFiles(outputRoot);
if (!files.length) throw new Error("No static HTML files were generated.");

for (const file of files) {
  const source = await readFile(file, "utf8");
  if (!source.includes(safeAreaViewport)) {
    throw new Error(`Missing iPhone safe-area viewport metadata in ${file}`);
  }
  const fixed = source.replace(defaultViewport, "");
  await writeFile(file, fixed, "utf8");
}

console.log(`Verified iPhone viewport metadata in ${files.length} static HTML file(s).`);
