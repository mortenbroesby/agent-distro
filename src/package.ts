import fs from "node:fs";

/** Package version read at runtime so CLI and diagnostic output stay in sync. */
export const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
