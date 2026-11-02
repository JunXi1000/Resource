# 对外资源站改造 —— 详细设计（P0 / P1）

> 配套文档：`docs/public-portal-plan.md`（总体方案与路线图）
> 本文覆盖：数据表 DDL、接口契约、配额算法、审核状态机、前端路由重构、实施顺序。

## 0. 已定前置决策

| 项 | 决策 |
|---|---|
| 游客能力 | 可浏览栏目、可浏览目录、**可直接下载**，无需登录 |
| 注册策略 | 自助注册 → 邮箱验证 → **管理员审批** → 才能上传 |
| 默认配额 | 20 GB / 人（`21474836480` 字节），可按用户调整 |
| 协作能力 | 保留现有邀请、成员、通知功能，不额外投入改造 |

---

## 1. 账号状态模型

### 1.1 为什么新增 `users.status` 而不是复用 `guest` 角色

现有角色层级是 `guest(1) < user(2) < admin(3)`，看起来 `guest` 可以当"待审批"用。但有两个硬伤：

1. **语义冲突**：`guest` 表达的是"平台权限层级较低"，不是"账号还没通过审批"。后台用户列表里两者会混在一起，运维分不清谁是待审、谁是历史遗留的低权账号。
2. **无法表达封禁**：对外站必然要处理违规用户，`suspended` 这种生命周期状态用角色表达不了（降成 guest 仍能登录下载）。

所以拆成两个正交维度：`role` 管权限层级，`status` 管账号生命周期。

### 1.2 状态定义

```go
type UserStatus string

const (
    UserStatusPending   UserStatus = "pending"   // 已注册，邮箱已验证，等待管理员审批
    UserStatusActive    UserStatus = "active"    // 正常
    UserStatusSuspended UserStatus = "suspended" // 封禁
)
```

### 1.3 中间件行为矩阵

| 请求类别 | pending | active | suspended |
|---|---|---|---|
| `POST /auth/login` | 允许（返回待审批态） | 允许 | 403 `USER_SUSPENDED` |
| `GET /auth/me` | 允许 | 允许 | 允许（用于前端展示封禁页） |
| `POST /auth/logout` | 允许 | 允许 | 允许 |
| 业务读（列表/下载） | 403 `USER_PENDING_APPROVAL` | 允许 | 403 `USER_SUSPENDED` |
| 业务写（上传/删除/分享） | 403 `USER_PENDING_APPROVAL` | 允许 | 403 `USER_SUSPENDED` |
| 匿名 `/api/v1/public/*` | 不受影响 | 不受影响 | 不受影响 |

> 实现位置：`internal/middlewares/authenticator.go` 之后再加一层 `RequireActiveAccount`，对 `/auth/*` 和 `/public/*` 放行。**不要写进现有 authenticator**，否则登录本身会被拦死，用户永远看不到"等待审批"提示。

---

## 2. 数据表 DDL

### 2.1 users（扩展）

```sql
-- postgres
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN approved_by UUID NULL;
ALTER TABLE users ADD COLUMN approved_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN quota_bytes BIGINT NOT NULL DEFAULT 21474836480;
ALTER TABLE users ADD COLUMN used_bytes BIGINT NOT NULL DEFAULT 0;
CREATE INDEX idx_users_status ON users(status);

-- sqlite
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL;
ALTER TABLE users ADD COLUMN approved_by TEXT NULL;
ALTER TABLE users ADD COLUMN approved_at DATETIME NULL;
ALTER TABLE users ADD COLUMN quota_bytes INTEGER NOT NULL DEFAULT 21474836480;
ALTER TABLE users ADD COLUMN used_bytes INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_users_status ON users(status);
```

> **坑**：`status` 默认值必须是 `active`。否则上线迁移一跑，所有存量用户（包括你自己那个 admin）全变成待审批，直接锁死在门外。

### 2.2 buckets（扩展）

```sql
-- postgres
ALTER TABLE buckets ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE buckets ADD COLUMN slug VARCHAR(120) NULL;
ALTER TABLE buckets ADD COLUMN category VARCHAR(50) NULL;
ALTER TABLE buckets ADD COLUMN published_at TIMESTAMP NULL;
CREATE UNIQUE INDEX idx_buckets_slug ON buckets(slug) WHERE slug IS NOT NULL;

-- sqlite
ALTER TABLE buckets ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE buckets ADD COLUMN slug TEXT NULL;
ALTER TABLE buckets ADD COLUMN category TEXT NULL;
ALTER TABLE buckets ADD COLUMN published_at DATETIME NULL;
CREATE UNIQUE INDEX idx_buckets_slug ON buckets(slug) WHERE slug IS NOT NULL;
```

> 用**部分索引**（`WHERE slug IS NOT NULL`）：私有桶的 `slug` 全是 NULL，普通唯一索引在 SQLite 允许多个 NULL、在 Postgres 也允许，但部分索引语义更明确且省空间。

### 2.3 files（扩展）

```sql
-- postgres
ALTER TABLE files ADD COLUMN review_status VARCHAR(20) NOT NULL DEFAULT 'approved';
ALTER TABLE files ADD COLUMN reviewed_by UUID NULL;
ALTER TABLE files ADD COLUMN reviewed_at TIMESTAMP NULL;
ALTER TABLE files ADD COLUMN reject_reason VARCHAR(500) NULL;
CREATE INDEX idx_files_review ON files(review_status, bucket_id);

-- sqlite
ALTER TABLE files ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE files ADD COLUMN reviewed_by TEXT NULL;
ALTER TABLE files ADD COLUMN reviewed_at DATETIME NULL;
ALTER TABLE files ADD COLUMN reject_reason TEXT NULL;
CREATE INDEX idx_files_review ON files(review_status, bucket_id);
```

> 默认 `approved`，保证私有桶历史文件不受影响，审核只对"公开桶新上传"生效。

### 2.4 bucket_tags（新表）

```sql
CREATE TABLE bucket_tags (
    bucket_id UUID NOT NULL,
    tag       VARCHAR(50) NOT NULL,
    PRIMARY KEY (bucket_id, tag)
);
CREATE INDEX idx_bucket_tags_tag ON bucket_tags(tag);
```

### 2.5 upload_reservations（新表）

```sql
CREATE TABLE upload_reservations (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL,
    bucket_id  UUID NOT NULL,
    version_id UUID NOT NULL,
    bytes      BIGINT NOT NULL,
    state      VARCHAR(20) NOT NULL,   -- reserved | settled | released
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX idx_upload_res_version ON upload_reservations(version_id);
CREATE INDEX idx_upload_res_reap ON upload_reservations(state, expires_at);
```

> `version_id` 上必须唯一：同一个上传版本只能有一条预占记录，避免客户端重试导致重复扣减。

### 2.6 迁移文件

```
internal/database/migrations/postgres/00018_add_user_status_quota.sql
internal/database/migrations/postgres/00019_add_public_catalog.sql
internal/database/migrations/postgres/00020_add_file_review.sql
internal/database/migrations/sqlite/00018_add_user_status_quota.sql
internal/database/migrations/sqlite/00019_add_public_catalog.sql
internal/database/migrations/sqlite/00020_add_file_review.sql
```

当前 Goose 版本 17，三份新迁移要按序编号，且**两套数据库都要跑一遍验证**。

---

## 3. 接口契约

### 3.1 全局约定（沿用现有实现）

- 成功：`2xx` + JSON body
- 失败：`helpers.RespondWithError` → `{"status": <int>, "error": ["CODE"]}`（`internal/models/api.go` 的 `Error`）
- 列表：`models.Page[T]` → `{"data": [...], "next_cursor": "..."}`，**游标分页，不是 offset**
- 错误码新增到 `internal/errors/codes_catalog.go`

新增错误码：

| 码 | HTTP | 含义 |
|---|---|---|
| `QUOTA_EXCEEDED` | 413 | 超出个人容量配额 |
| `USER_PENDING_APPROVAL` | 403 | 账号待审批 |
| `USER_SUSPENDED` | 403 | 账号已封禁 |
| `EMAIL_NOT_VERIFIED` | 403 | 邮箱未验证 |
| `EMAIL_ALREADY_REGISTERED` | 409 | 邮箱已注册 |
| `INVALID_VERIFICATION_CODE` | 400 | 验证码错误或过期 |
| `REGISTRATION_DISABLED` | 403 | 站点关闭了注册 |
| `BUCKET_NOT_PUBLIC` | 404 | 栏目不存在或未公开 |
| `SLUG_TAKEN` | 409 | 短链被占用 |
| `REVIEW_INVALID_TRANSITION` | 409 | 审核状态非法流转 |

### 3.2 注册与审批

```http
POST /api/v1/auth/register
Content-Type: application/json

{ "email": "a@b.com", "password": "xxxxxx", "first_name": "三", "last_name": "张" }
```
- 幂等：同邮箱重复提交返回 `409 EMAIL_ALREADY_REGISTERED`，**不泄露该邮箱是否已有账号**→ 改为统一返回 `202` + 发送"你已注册过"邮件。这个取舍要在实现时二选一并注释清楚。
- 成功：`201 {"status": "pending_verification"}`
- 限流：每 IP 10 次/小时（复用 `challenge_ratelimit`）

```http
POST /api/v1/auth/register/verify
{ "email": "a@b.com", "code": "123456" }
→ 200 { "status": "pending_approval" }
```

```http
POST /api/v1/auth/register/resend
{ "email": "a@b.com" }
→ 202
```

```http
GET  /api/v1/admin/users?status=pending&cursor=&limit=
POST /api/v1/admin/users/{id}/approve   { "quota_bytes": 21474836480 }
POST /api/v1/admin/users/{id}/reject    { "reason": "资料不完整" }
POST /api/v1/admin/users/{id}/suspend   { "reason": "违规上传" }
PATCH /api/v1/admin/users/{id}/quota    { "quota_bytes": 53687091200 }
```

### 3.3 公开只读

```http
GET /api/v1/public/buckets?q=&category=&tag=&sort=recent&cursor=&limit=20
→ {
    "data": [{
      "id": "...", "slug": "tools", "name": "工具软件",
      "description": "...", "category": "软件",
      "tags": ["windows", "绿色版"],
      "file_count": 128, "total_size": 5368709120,
      "published_at": "2026-11-02T04:00:00Z"
    }],
    "next_cursor": "eyJ0cyI6..."
  }
```

```http
GET /api/v1/public/buckets/{slug}
GET /api/v1/public/buckets/{slug}/files?folder=&cursor=&limit=
GET /api/v1/public/categories
GET /api/v1/public/files/{fileId}/url?download=true
→ { "url": "http://<storage>/safebucket/...&X-Amz-Signature=...", "name": "x.zip", "size": 10485760, "expires_at": "..." }
```

**公开文件查询的硬约束**（必须写在 SQL 里，不能只在前端过滤）：

```sql
SELECT ... FROM files f
JOIN buckets b ON b.id = f.bucket_id
WHERE f.deleted_at IS NULL
  AND f.status = 'uploaded'
  AND f.review_status = 'approved'
  AND b.is_public = TRUE
  AND b.deleted_at IS NULL
```

### 3.4 配额查询

```http
GET /api/v1/users/me/usage
→ { "quota_bytes": 21474836480, "used_bytes": 3221225472, "reserved_bytes": 104857600, "percent": 15.5 }
```

### 3.5 审核

```http
GET  /api/v1/admin/reviews?status=pending&bucket_id=&cursor=&limit=
POST /api/v1/admin/reviews/{fileId}/approve
POST /api/v1/admin/reviews/{fileId}/reject   { "reason": "..." }
```

---

## 4. 配额算法（本方案唯一有技术难点的地方）

### 4.1 为什么不能"签发前查一次"

`POST /v1/buckets/{id}/files` 只是签发预签名 URL，真正的字节流从浏览器直接进对象存储，服务端全程看不到。如果在签发前只做 `SELECT used_bytes + size <= quota`，用户并发发起 10 个上传就能全部签出去，事后才知道超了——**必然超卖**。

### 4.2 原子预占

在 `internal/fileversions/uploads.go` 的 `Start` 事务内，`sql.ReserveFileVersion` 之前插入预占：

```sql
UPDATE users
   SET used_bytes = used_bytes + :size
 WHERE id = :user_id
   AND (quota_bytes = 0 OR used_bytes + :size <= quota_bytes);
```

`RowsAffected == 0` 即超额，事务回滚并返回 `413 QUOTA_EXCEEDED`。这条 UPDATE 是原子的，不需要悲观锁，并发天然安全。

随后在同一事务写入 `upload_reservations(state='reserved', expires_at = now() + 2h)`。

### 4.3 结算与释放

| 时机 | 处理 |
|---|---|
| 上传完成（`Manager.Complete`） | `used_bytes += (actual_size - reserved_bytes)`，`state='settled'`。多数情况 actual == reserved，差值为 0 |
| 上传失败 / Abort | `used_bytes -= bytes`，`state='released'` |
| 超过 `expires_at` 未完成 | 新增 worker `quota_reaper`（每 10 分钟）批量释放 |
| 文件删除进回收站 | 立即 `used_bytes -= file.size`（回收站保留期内不再占配额，符合用户预期） |
| 清空回收站 / 彻底删除 | 不再重复扣减，靠 `state` 防重 |

### 4.4 重传新版本的配额

文件存在多版本（`file_versions`）。规则：**配额按"当前版本大小"计**。

- 新版本预占 `new_size`
- 完成后释放旧版本 `old_size`
- 净变化 `new_size - old_size`，可能为负（允许 `used_bytes` 减少）

### 4.5 与审核的交互

待审文件是否占配额？**占**。否则用户可以上传海量文件卡在待审队列里白占磁盘。

---

## 5. 审核状态机

```
                    ┌──────────────────────────────┐
公开桶上传 ──────► pending ──approve──► approved ──┐
                    │                              │
                    └──reject──► rejected          │
                                  (reason)         │
                                                   │
私有桶上传 ──────────────────────► approved ◄──────┘

已 approved 的文件重传新版本 ──► 新版本 pending（旧版本仍可下载）
```

关键规则：

1. **审核粒度是文件当前版本**，不是整个文件。重传新版本需要重新审核，但**旧版本保持可下载**——避免"更新一下资源，公开页突然消失"。
2. `rejected` 不删除对象存储里的文件，只是公开查询过滤掉；上传者能在"我的上传"里看到驳回理由。
3. 审核权限：平台 `admin` 全部可审；公开桶的 `owner` 可审自己桶；`contributor` 不能审自己传的东西（否则等于自审自过）。
4. 分享链接签发时校验：`review_status != 'approved'` 直接拒绝，防止待审文件通过分享链接泄露。

---

## 6. 前端设计

### 6.1 必须解决的路由冲突

当前 `web/src/routes/_authenticated/index.tsx` 映射的路径**就是 `/`**。如果直接新增 `routes/index.tsx` 做公开首页，TanStack Router 会因重复路径在构建阶段报错。

处理方式：把登录后首页迁到 `/dashboard`。

```
改：web/src/routes/_authenticated/index.tsx  →  web/src/routes/_authenticated/dashboard.tsx
新：web/src/routes/index.tsx                 （公开首页，路径 /）
```

配套改动：

- 登录成功后的跳转目标从 `/` 改为 `/dashboard`（在 `web/src/components/auth-view` 与 `route-guards.ts` 里搜 `to: "/"`）
- `__root.tsx` 的 `showSidebar` 已有 `session` 判断，游客天然不显示侧边栏，无需改
- 已登录用户访问 `/` 不做强制跳转（公开首页对登录用户也可访问，顶部加"进入控制台"入口即可）

### 6.2 新路由清单

```
web/src/routes/index.tsx                            公开首页：栏目卡片 + 分类筛选 + 搜索框
web/src/routes/b/$slug.tsx                          栏目详情
web/src/routes/b/$slug/f/{-$folderId}.tsx           目录浏览（含面包屑）
web/src/routes/search.tsx                           搜索结果
web/src/routes/pending-approval.tsx                 待审批提示页
web/src/routes/auth/register/index.tsx              注册
web/src/routes/auth/register/verify.tsx             邮箱验证码
web/src/routes/_authenticated/dashboard.tsx          原登录后首页（改名迁入）
web/src/routes/_authenticated/admin/reviews.tsx      审核台
web/src/routes/_authenticated/settings/usage.tsx     我的配额
```

### 6.3 组件

```
web/src/components/public-catalog/PublicHeader.tsx      游客顶部导航（无侧边栏场景）
web/src/components/public-catalog/BucketCard.tsx        栏目卡片
web/src/components/public-catalog/TagFilter.tsx         标签/分类筛选
web/src/components/public-catalog/FileList.tsx          公开文件列表（复用现有 FileRow 样式）
web/src/components/register/RegisterForm.tsx
web/src/components/admin-review/ReviewList.tsx
web/src/components/quota-bar/QuotaBar.tsx
```

### 6.4 数据层

新增 `web/src/queries/public-catalog.ts`，照 `queries/me.ts` 的 `queryOptions` 写法：

```ts
export const publicBucketsQueryOptions = (params: { q?: string; category?: string; cursor?: string }) =>
  queryOptions({
    queryKey: ["public", "buckets", params],
    queryFn: async () => {
      const apiUrl = getApiUrl();
      const search = new URLSearchParams();
      if (params.q) search.set("q", params.q);
      if (params.category) search.set("category", params.category);
      const res = await fetch(`${apiUrl}/public/buckets?${search}`, { credentials: "include" });
      if (!res.ok) throw new Error("FETCH_FAILED");
      return res.json();
    },
  });
```

### 6.5 中文界面

改动四处，缺一不可：

1. `web/src/locales/zh.json` — 新增，`npm run i18n:extract` 抽 key 后补翻译
2. `web/src/lib/i18n.ts` — `resources` 注册 `zh: { translation: zh }`
3. `web/src/lib/date-locale.ts` — import `date-fns/locale` 的 `zhCN` 并加入 `localeMap`
4. `web/src/components/settings-view/components/PreferencesTab.tsx:33` — `languages` 数组加 `{ value: "zh", label: t("settings.language.chinese") }`

> `fallbackLng` 保持 `en`，不要改成 `zh`：否则任何漏译都显示中文兜底，反而掩盖缺失词条。

---

## 7. 新增配置项

```go
type RegistrationConfig struct {
    Enabled        bool  `koanf:"enabled"`
    RequireApproval bool `koanf:"require_approval"`
    DefaultQuota   int64 `koanf:"default_quota_bytes"`
}
type PublicConfig struct {
    Enabled            bool `koanf:"enabled"`
    DownloadPerMinute  int  `koanf:"download_rate_limit_per_minute"`
}
```

对应环境变量（写进 `deployments/local/lite/.env` 与 `.env.example`）：

```
APP__REGISTRATION__ENABLED=true
APP__REGISTRATION__REQUIRE_APPROVAL=true
APP__REGISTRATION__DEFAULT_QUOTA_BYTES=21474836480
APP__PUBLIC__ENABLED=true
APP__PUBLIC__DOWNLOAD_RATE_LIMIT_PER_MINUTE=60
```

> 配置必须在启动时集中校验（项目已有这个风格，见 `internal/configuration/config.go`）：例如 `public.enabled=true` 但没有任何 `is_public` 桶时打 warn，不 fail。

---

## 8. 测试策略

### 8.1 必须覆盖的集成测试

放 `internal/tests/integration/`，现有 bootstrap 会起真实数据库：

| 用例 | 断言 |
|---|---|
| 并发配额 | 配额 10MB，两个 6MB 上传并发 → 恰好一个 201、一个 413，`used_bytes` 不超 10MB |
| 待审文件不可见 | 公开桶上传 → 匿名 `/public/buckets/{slug}/files` 查不到 |
| 驳回后不可下载 | `rejected` 文件调 `/public/files/{id}/url` → 404 |
| 待审用户被拦 | `pending` 用户调上传接口 → 403 `USER_PENDING_APPROVAL` |
| 私有桶隔离 | `is_public=false` 的桶调 `/public/...` → 404 |
| slug 冲突 | 重复创建同名 slug → 409 |
| 分享防泄露 | 待审文件创建分享 → 409 |

### 8.2 编译与构建验证

本机**没有装 Go**，需要二选一：

```bash
# 方案 A：服务器上验证
go build ./... && go test ./internal/...

# 方案 B：用容器编译（本机有 Docker）
docker run --rm -v "E:/OneDrive/Desktop/safebucket/safebucket:/src" -w /src golang:1.27-bookworm go build ./...
```

前端：`cd web && npm ci && npm run build`，另跑 `npm run i18n:lint` 确保 `zh.json` 无缺 key。

---

## 9. 实施顺序（每批可独立验收）

| 批次 | 内容 | 验收 |
|---|---|---|
| **批 1 数据层** | 6 个迁移文件 + `models/user.go`/`bucket.go`/`file.go` 字段 + `internal/sql/` 查询 | 迁移在 postgres + sqlite 都能跑通，`go build` 通过 |
| **批 2 公开只读** | `PublicCatalogService` + `AuthExcludedPatterns` 放行 + 配置项 | `curl /api/v1/public/buckets` 匿名返回数据 |
| **批 3 账号体系** | 注册/验证/审批 + `RequireActiveAccount` 中间件 + 邮件模板 | 真实注册 → 收信 → 验证 → 审批 → 登录上传成功 |
| **批 4 配额与审核** | 预占/结算/回收 worker + 审核接口 + 前端审核台 | 并发测试通过，驳回流程闭环 |
| **批 5 前端与中文** | 路由重构（含 dashboard 改名）+ 公开页面 + `zh.json` | `npm run build` 通过，未登录可完整走完"首页→栏目→下载" |

> 批 5 的路由改名要和批 2 的公开页面一起做，中间态不要发布（会出现 `/` 无人认领的空白页）。

---

## 10. 遗留待确认

1. 注册时邮箱已存在的处理：明确报错（体验好但泄露账号存在性）还是静默返回 202（安全但用户困惑）——建议静默 + 提示"若该邮箱未注册请查收验证信"。
2. 待审文件是否计入配额：本文档按"计入"设计。
3. 公开桶的 `owner` 自审权限：是否允许（本文档允许，管理员兜底）。
4. 游客下载是否需要登录墙（当前设计为完全放开）。

---

## 11. 批 2 实现记录（公开只读）

实际落地时与上文设计有几处偏差，以此节为准。

### 11.1 路由

```
GET /api/v1/public/buckets                 栏目列表（q / category / tag / sort / cursor / limit）
GET /api/v1/public/buckets/{slug}          栏目详情
GET /api/v1/public/buckets/{slug}/files    目录浏览（folder / q / cursor / limit）
GET /api/v1/public/categories              分类聚合
GET /api/v1/public/files/{id}/url          取预签名下载地址
```

### 11.2 与设计的偏差

| 项 | 设计 | 实现 | 原因 |
|---|---|---|---|
| 目录浏览响应 | `{data, next_cursor}` | `{bucket, folder, breadcrumb, folders, files, next_cursor}` | 匿名 UI 需要按层浏览：一次请求同时返回子目录、文件和面包屑，避免每次导航发多个请求 |
| 下载响应 | `{url, name, size, expires_at}` | `{id, name, size, url}` | `storage.IStorage` 只返回 URL 字符串，签名过期时间不对外暴露 |
| 路由白名单 | 新增正则 | `^/api/v1/public(/.*)?$`，且**仅限 GET** | 防止将来误加写接口时整段被放行；`/api/v1/publicity` 这类前缀相似的路径不会被匹配（有测试固定该边界） |
| 开关 | "配置项" | `app.public_catalog_enabled`，默认 `true`，关闭时整组返回 404 | 默认开不影响存量部署：没有 `is_public` 的桶本来就不会出现 |

### 11.3 分页

游标是 base64url 编码的 `{sort key, id}` 二元组（`internal/helpers/cursor.go`），按键集分页，不是 offset。三种排序各自维护游标语义：

- `recent`（默认）：`COALESCE(published_at, created_at)` DESC
- `name`：`LOWER(name)` ASC
- `popular`：文件数 DESC

排序键相同的行靠 `id` 兜底，因此不会出现翻页丢行或重复。`id` 参数缺失或游标损坏一律返回 400，不返回 500。

### 11.4 两个必须记住的实现细节

1. **统计口径 = 可下载口径**。`file_count` / `total_size` 只统计 `uploaded` + `approved` + 未过期的文件。否则栏目页显示 100 个文件、点进去只有 60 个，用户会以为丢数据。
2. **`COALESCE` 表达式不能直接扫进 `time.Time`**。SQLite 对计算列不附带类型，驱动会报 `unsupported Scan ... into type *time.Time`。所以查询分开选 `published_at` 和 `created_at` 两列，在 Go 里合并出排序键。这个问题只有真正在 SQLite 上跑测试才会暴露，两套数据库的测试因此都必须保留。

### 11.5 已知限制

- **匿名下载不写活动日志**。预签名直连存储，服务端看不到字节流；为了不给匿名流量增加写放大，批 2 不记录下载活动。P3 做热门榜时需要新增"按分钟聚合"的计数器，而不是直接插审计日志。
- **未认证限流默认 20 次/分钟**（`app.unauthenticated_requests_per_minute`），公网站点偏低，上线前需要调高。

