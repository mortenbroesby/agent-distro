import fs from "node:fs";

export const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
