import { loadEnv } from "./load-env.js";
import { listExportCategories } from "../src/impex.js";

loadEnv();

const raw = await listExportCategories();
// Shape varies — print type + length only if array-like
if (Array.isArray(raw)) {
  console.log(`categories: ${raw.length}`);
  for (const item of raw.slice(0, 30)) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = o.name ?? o.category ?? o.code ?? o.id;
      console.log("-", name ?? JSON.stringify(item).slice(0, 80));
    } else {
      console.log("-", item);
    }
  }
} else {
  console.log("Unexpected shape; inspect keys:", Object.keys(raw as object));
  console.log(JSON.stringify(raw, null, 2).slice(0, 1500));
}
