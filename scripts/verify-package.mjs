import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyPackage } from "../server/evidence.mjs";
export { verifyPackage };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2])
      throw new Error("Usage: npm run verify -- /path/to/evidence.json");
    console.log(
      JSON.stringify(
        verifyPackage(JSON.parse(readFileSync(process.argv[2], "utf8"))),
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
