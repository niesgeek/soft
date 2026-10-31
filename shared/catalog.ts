export type StorageKind = "kv" | "file" | "seed";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort: number;
  enabled: boolean;
};

export type Software = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  icon: string;
  downloadUrl: string;
  homepage: string;
  sort: number;
  enabled: boolean;
};

export type Catalog = {
  categories: Category[];
  software: Software[];
  updatedAt: string;
};

export type PublicCategory = Omit<Category, "enabled">;
export type PublicSoftware = Omit<Software, "enabled">;

export type PublicCatalog = {
  categories: PublicCategory[];
  software: PublicSoftware[];
  updatedAt: string;
};

export type ValidateResult =
  | { ok: true; catalog: Catalog }
  | { ok: false; errors: string[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCAL_ICON = /^\/[A-Za-z0-9._~/-]+$/;

const LIMITS = {
  categories: 40,
  software: 400,
  name: 48,
  slug: 64,
  categoryDescription: 80,
  softwareDescription: 120,
  url: 500,
  sort: 100_000,
};

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug);
  return slug;
}

export function validateCatalog(input: unknown): ValidateResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["目录必须是 JSON 对象"] };
  }

  const categories = readArray(input.categories, "categories", errors);
  const software = readArray(input.software, "software", errors);
  if (!categories || !software) return { ok: false, errors };

  if (categories.length < 1 || categories.length > LIMITS.categories) {
    errors.push(`分类数量需在 1 到 ${LIMITS.categories} 之间`);
  }
  if (software.length < 1 || software.length > LIMITS.software) {
    errors.push(`软件数量需在 1 到 ${LIMITS.software} 之间`);
  }

  const categoryIds = new Set<string>();
  const categorySlugs = new Set<string>();
  const nextCategories: Category[] = [];
  categories.forEach((item, index) => {
    const category = readCategory(item, index, errors);
    if (!category) return;
    if (categoryIds.has(category.id)) errors.push(`分类 id 重复：${category.id}`);
    if (categorySlugs.has(category.slug)) errors.push(`分类 slug 重复：${category.slug}`);
    categoryIds.add(category.id);
    categorySlugs.add(category.slug);
    nextCategories.push(category);
  });

  const softwareIds = new Set<string>();
  const softwareSlugs = new Set<string>();
  const nextSoftware: Software[] = [];
  software.forEach((item, index) => {
    const entry = readSoftware(item, index, errors);
    if (!entry) return;
    if (softwareIds.has(entry.id)) errors.push(`软件 id 重复：${entry.id}`);
    if (softwareSlugs.has(entry.slug)) errors.push(`软件 slug 重复：${entry.slug}`);
    if (!categoryIds.has(entry.categoryId)) {
      errors.push(`软件「${entry.name || entry.id}」的分类不存在`);
    }
    softwareIds.add(entry.id);
    softwareSlugs.add(entry.slug);
    nextSoftware.push(entry);
  });

  const updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : "";
  if (updatedAt && Number.isNaN(Date.parse(updatedAt))) {
    errors.push("updatedAt 不是有效时间");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    catalog: {
      categories: nextCategories,
      software: nextSoftware,
      updatedAt: updatedAt || new Date(0).toISOString(),
    },
  };
}

export function toPublicCatalog(catalog: Catalog): PublicCatalog {
  const categories = catalog.categories
    .filter((category) => category.enabled)
    .sort(bySortThenName)
    .map(({ enabled: _enabled, ...category }) => category);
  const visible = new Set(categories.map((category) => category.id));
  const software = catalog.software
    .filter((item) => item.enabled && visible.has(item.categoryId))
    .sort(bySortThenName)
    .map(({ enabled: _enabled, ...item }) => item);
  return { categories, software, updatedAt: catalog.updatedAt };
}

export function isDirectDownload(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(exe|msi|zip|7z|msix|appx)$/.test(path);
  } catch {
    return false;
  }
}

function readCategory(input: unknown, index: number, errors: string[]): Category | null {
  const label = `分类 #${index + 1}`;
  if (!isRecord(input)) {
    errors.push(`${label} 必须是对象`);
    return null;
  }
  const id = readSlug(input.id, `${label} 的 id`, errors);
  const slug = readSlug(input.slug, `${label} 的 slug`, errors);
  const name = readText(input.name, `${label} 的名称`, 1, LIMITS.name, errors);
  const description = readText(
    input.description,
    `${label} 的简介`,
    0,
    LIMITS.categoryDescription,
    errors,
  );
  const sort = readSort(input.sort, label, errors);
  const enabled = readBool(input.enabled, `${label} 的启用状态`, errors);
  if (!id || !slug || name === null || description === null || sort === null || enabled === null) {
    return null;
  }
  return { id, slug, name, description, sort, enabled };
}

function readSoftware(input: unknown, index: number, errors: string[]): Software | null {
  const label = `软件 #${index + 1}`;
  if (!isRecord(input)) {
    errors.push(`${label} 必须是对象`);
    return null;
  }
  const id = readSlug(input.id, `${label} 的 id`, errors);
  const slug = readSlug(input.slug, `${label} 的 slug`, errors);
  const name = readText(input.name, `${label} 的名称`, 1, LIMITS.name, errors);
  const description = readText(
    input.description,
    `${label} 的简介`,
    0,
    LIMITS.softwareDescription,
    errors,
  );
  const categoryId = readSlug(input.categoryId, `${label} 的分类`, errors);
  const icon = readIcon(input.icon, `${label} 的图标`, errors);
  const downloadUrl = readHttps(input.downloadUrl, `${label} 的下载地址`, errors);
  const homepage = readOptionalHttps(input.homepage, `${label} 的官网`, errors);
  const sort = readSort(input.sort, label, errors);
  const enabled = readBool(input.enabled, `${label} 的启用状态`, errors);
  if (
    !id ||
    !slug ||
    name === null ||
    description === null ||
    !categoryId ||
    !icon ||
    !downloadUrl ||
    homepage === null ||
    sort === null ||
    enabled === null
  ) {
    return null;
  }
  return {
    id,
    slug,
    name,
    description,
    categoryId,
    icon,
    downloadUrl,
    homepage,
    sort,
    enabled,
  };
}

function readArray(value: unknown, key: string, errors: string[]): unknown[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${key} 必须是数组`);
    return null;
  }
  return value;
}

function readSlug(value: unknown, label: string, errors: string[]): string | null {
  if (typeof value !== "string" || !SLUG.test(value) || value.length > LIMITS.slug) {
    errors.push(`${label} 需为小写字母、数字和连字符`);
    return null;
  }
  return value;
}

function readText(
  value: unknown,
  label: string,
  min: number,
  max: number,
  errors: string[],
): string | null {
  if (typeof value !== "string") {
    errors.push(`${label} 必须是字符串`);
    return null;
  }
  const text = value.trim();
  if (text.length < min || text.length > max) {
    errors.push(`${label} 长度需在 ${min} 到 ${max} 之间`);
    return null;
  }
  return text;
}

function readSort(value: unknown, label: string, errors: string[]): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || Math.abs(value) > LIMITS.sort) {
    errors.push(`${label} 的排序必须是整数`);
    return null;
  }
  return value;
}

function readBool(value: unknown, label: string, errors: string[]): boolean | null {
  if (typeof value !== "boolean") {
    errors.push(`${label} 必须是布尔值`);
    return null;
  }
  return value;
}

function readHttps(value: unknown, label: string, errors: string[]): string | null {
  if (typeof value !== "string" || value.length > LIMITS.url || !isHttpsUrl(value)) {
    errors.push(`${label} 必须是 https 链接`);
    return null;
  }
  return value;
}

function readOptionalHttps(value: unknown, label: string, errors: string[]): string | null {
  if (value === undefined || value === null || value === "") return "";
  return readHttps(value, label, errors);
}

function readIcon(value: unknown, label: string, errors: string[]): string | null {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > LIMITS.url || value.includes("..")) {
    errors.push(`${label} 无效`);
    return null;
  }
  if (LOCAL_ICON.test(value) || isHttpsUrl(value)) return value;
  errors.push(`${label} 必须是站内路径或 https 链接`);
  return null;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}

function bySortThenName<T extends { sort: number; name: string }>(a: T, b: T): number {
  return a.sort - b.sort || a.name.localeCompare(b.name, "zh-CN");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
