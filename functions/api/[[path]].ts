import { handleApi, type CatalogStore } from "../../server/handle";

export const onRequest: PagesFunction<Env> = async (context) => {
  const kv = context.env.SOFTWARE_KV;
  const store: CatalogStore = {
    backend: "kv",
    available: typeof kv?.get === "function" && typeof kv?.put === "function",
    async get() {
      if (!kv) return null;
      return (await kv.get("catalog")) ?? null;
    },
    async put(value) {
      if (!kv) throw new Error("SOFTWARE_KV binding is missing");
      await kv.put("catalog", value);
    },
  };
  return handleApi(context.request, {
    store,
    adminPassword: context.env.ADMIN_PASSWORD,
  });
};
