import raw from "../data/software.json";
import { validateCatalog, type Catalog } from "./catalog";

let cached: Catalog | null = null;

export function getSeedCatalog(): Catalog {
  if (!cached) {
    const result = validateCatalog(raw);
    if (!result.ok) {
      throw new Error(`种子数据无效：${result.errors.join("；")}`);
    }
    cached = result.catalog;
  }
  return structuredClone(cached);
}
