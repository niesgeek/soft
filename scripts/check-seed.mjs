import { readFileSync } from "node:fs";

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const data = JSON.parse(readFileSync(new URL("../data/software.json", import.meta.url), "utf8"));
const errors = [];

if (!Array.isArray(data.categories) || !Array.isArray(data.software)) {
  errors.push("categories 和 software 必须是数组");
}
const categories = data.categories ?? [];
const software = data.software ?? [];
if (categories.length < 1) errors.push("至少要有一个分类");
if (software.length < 40 || software.length > 80) {
  errors.push(`软件数量应为 40–80，当前 ${software.length}`);
}

const categoryIds = new Set();
for (const category of categories) {
  if (!slug.test(category.id) || !slug.test(category.slug)) errors.push(`分类 slug 无效：${category.name}`);
  if (categoryIds.has(category.id)) errors.push(`分类 id 重复：${category.id}`);
  categoryIds.add(category.id);
  if (typeof category.enabled !== "boolean") errors.push(`分类 ${category.id} 缺少 enabled`);
}

const softwareIds = new Set();
for (const item of software) {
  if (!slug.test(item.id) || !slug.test(item.slug)) errors.push(`软件 slug 无效：${item.name}`);
  if (softwareIds.has(item.slug)) errors.push(`软件 slug 重复：${item.slug}`);
  softwareIds.add(item.slug);
  if (!categoryIds.has(item.categoryId)) errors.push(`软件 ${item.name} 的分类不存在`);
  if (!isHttps(item.downloadUrl)) errors.push(`下载地址不是 https：${item.name}`);
  if (item.homepage && !isHttps(item.homepage)) errors.push(`官网不是 https：${item.name}`);
  if (!(typeof item.icon === "string" && (item.icon.startsWith("/") || isHttps(item.icon)))) {
    errors.push(`图标无效：${item.name}`);
  }
  if (!item.name || !item.description) errors.push(`名称或简介为空：${item.slug}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`seed ok: ${categories.length} categories, ${software.length} software`);

function isHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
