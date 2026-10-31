# 装机必备软件合集

给新装的 Windows 用的软件目录。前台按分类浏览、搜索，并打开官方下载页；后台用密码维护分类和软件。这是 [soft.nie.ge](https://soft.nie.ge/) 的升级版，由 [涅槃博客](https://nie.su) 维护。

技术上是 Vite + React 的静态站，接口放在 Cloudflare Pages Functions 里。目录存在 Workers KV 的一个 JSON 里；KV 为空或还没绑定时，接口回退到仓库里的 `data/software.json`。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
# 把 ADMIN_PASSWORD 改成你自己的本地密码
npm run dev
```

- 前台：<http://localhost:5173/>
- 后台：<http://localhost:5173/admin>
- `npm run dev` 会把后台改动写到 `.data/catalog.json`（已忽略，不要提交）。删掉这个文件就会重新从种子数据开始。
- 浅色 / 深色会记在浏览器的 `localStorage`（`soft-theme`）。第一次打开时跟随系统。

用 Pages 运行时再走一遍（先构建）：

```bash
npm run build
npm run pages:dev
```

`wrangler pages dev` 会读 `.dev.vars` 里的 `ADMIN_PASSWORD`，并用下面配置里的 KV 绑定做本地存储。

## 数据

种子文件是 [`data/software.json`](data/software.json)。分类大致是：系统与运行库、安全与清理、浏览器与扩展、影音娱乐、即时通讯与输入法、办公效率、开发工具、压缩与下载、实用工具、导航与合集。

链接尽量指向各软件官网或官方发布页，不再使用原来的推广安装包。后台可以改名称、slug、简介、分类、图标、下载地址、官网、排序和是否显示，也可以导入 / 导出整份 JSON。

## 部署到 Cloudflare Pages

1. 创建 KV 命名空间，并记下 id：

   ```bash
   npx wrangler kv namespace create SOFTWARE_KV
   ```

2. 把 `wrangler.jsonc` 里 `kv_namespaces[0].id` 的占位值 `00000000000000000000000000000000` 换成上一步的 id。预览环境和生产如果要隔开数据，再加一个 `preview_id`。

3. 在 Cloudflare 控制台打开该 Pages 项目：**Settings → Variables and Secrets**，添加加密变量 `ADMIN_PASSWORD`（生产环境和预览环境都要设）。不要把密码写进仓库。

4. 连接 GitHub 仓库 `niesgeek/soft`。构建设置：

   | 项 | 值 |
   | --- | --- |
   | 构建命令 | `npm run build` |
   | 输出目录 | `dist` |
   | 生产分支 | `main` |

   仓库里的 `functions/` 会作为 Pages Functions 部署。`/api/*` 由函数处理，其余路径是单页应用。

5. 部署完成后打开 `/admin`，用 `ADMIN_PASSWORD` 登录。第一次保存会把目录写入 KV。在那之前，以及 KV 绑定缺失或内容无法解析时，公开接口只读种子数据，写入会返回 503。

本地核对函数是否能打包：

```bash
npx wrangler pages functions build --outdir=/tmp/soft-fns
```

绑定类型有变动时运行 `npm run cf-typegen`，并提交生成的 `worker-configuration.d.ts`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/catalog` | 公开目录，只含已启用的分类和软件 |
| `POST` | `/api/admin/session` | `{ "password" }` → 12 小时令牌 |
| `GET` | `/api/admin/catalog` | 完整目录。响应里的 `storage` 为 `kv`、`file` 或 `seed` |
| `PUT` | `/api/admin/catalog` | 校验并整体保存 |
| `POST` | `/api/admin/import` | 与 PUT 相同，供导入使用 |
| `GET` | `/api/admin/export` | 下载完整 JSON |
| `POST` | `/api/admin/reset` | 用仓库种子覆盖存储 |

管理接口需要 `Authorization: Bearer <token>`。令牌放在 `sessionStorage`，关掉标签页就失效。
