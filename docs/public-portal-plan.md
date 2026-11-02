# Safebucket 改造为对外资源站 —— 改造计划

> 目标：把一个「企业内部协作网盘」改造成「对外资源站」——游客可浏览、搜索、下载；注册用户可上传（有配额）；上传需审核；界面中文。

## 1. 现状基线

### 1.1 已有能力（可直接复用，不要重写）

| 能力 | 代码位置 | 复用方式 |
|---|---|---|
| 桶 / 文件夹 / 文件树 | `internal/services/bucket*.go`、`internal/sql/{bucket,files,folders}.go` | 目录结构直接当栏目内容树 |
| 三级桶内权限 | `internal/models/membership.go`（owner/contributor/viewer） | 公开桶对游客走只读旁路，不改权限模型 |
| 预签名直传直读 | `internal/storage/rustfs.go`、`internal/storage/signing.go` | 上传下载链路完全不动 |
| 分享链接（密码/次数/有效期） | `internal/services/public_share.go`、`internal/models/share.go` | 公开下载复用其匿名签发逻辑 |
| 匿名路径白名单 | `internal/configuration/auth.go`（`AuthExcludedExactPaths` / `AuthExcludedPatterns`） | **新公开接口从这里放行，不改认证中间件** |
| 文件状态机 | `internal/models/file.go`（`FileStatus`） | 审核状态直接扩展枚举 |
| 限流基建 | `internal/services/challenge_ratelimit.go` | 注册、匿名接口防刷直接复用 |
| 邮件模板 | `internal/mails/*.html` + `internal/notifier/smtp.go` | 注册验证邮件沿用同一套 |
| i18n 工具链 | `web/src/lib/i18n.ts` + `npm run i18n:extract/sync` | 中文词条自动抽取，不用手抄 |
| 路由挂载 | `internal/core/bootstrap.go:487-545` | 新服务按同样模式 Mount |

### 1.2 缺口（本次要补的）

1. 无开放注册（无 `/register` 路由，用户只能被邀请创建）
2. 无公开浏览（一切内容都在登录 + 入桶之后）
3. 无分类 / 标签 / 全局搜索
4. 无配额（全仓库无 `quota` 字段）
5. 无审核（上传即生效）
6. 无中文界面

## 2. 架构决策

| 编号 | 决策 | 理由 |
|---|---|---|
| D1 | **公开桶 = 栏目**：在 `buckets` 上加 `is_public` / `slug` / `category`，不新建分类表 | 现有的桶内文件树就是最自然的栏目目录，复用后「分类 → 栏目 → 目录 → 文件」零新增模型 |
| D2 | 新增独立只读服务 `/api/v1/public/*`，在 `AuthExcludedPatterns` 放行 | 匿名访问集中在白名单一处，认证中间件主体不动，风险边界清晰 |
| D3 | 自助注册 + 邮箱验证，复用 `challenge_ratelimit` 防刷 | 邀请制无法承载公开注册；限流与挑战码基建已存在，不重复造 |
| D4 | 配额用「预占 + 结算」：签发预签名 URL 前 `reserve`，上传完成 `settle`，超时 `release` | 直传模式下服务端看不到字节流，只能签发前预占，否则必然超卖 |
| D5 | 审核复用 `FileStatus`：新增 `pending_review` / `approved` / `rejected` | 状态机已贯穿上传→可用→删除，公开查询只需过滤，改动集中在一处 |
| D6 | 新增 `zh.json`，用 `i18next-cli extract/sync` 生成骨架后人工校对 | 不动 i18n 机制，纯数据文件，可并行推进、随时回滚 |

## 3. 数据模型变更

### 3.1 表结构

**buckets（扩展）**
```sql
is_public     BOOLEAN NOT NULL DEFAULT FALSE
slug          VARCHAR(120) UNIQUE          -- 公开访问路径 /b/{slug}
category      VARCHAR(50)                  -- 栏目分类
published_at  TIMESTAMP NULL               -- 首次公开时间
```

**users（扩展）**
```sql
email_verified_at  TIMESTAMP NULL
quota_bytes        BIGINT NOT NULL DEFAULT 0   -- 0 = 不限
used_bytes         BIGINT NOT NULL DEFAULT 0
```

**files（扩展）**
```sql
review_status   VARCHAR(20) NOT NULL DEFAULT 'approved'  -- 仅公开桶有意义
reviewed_by     UUID NULL
reviewed_at     TIMESTAMP NULL
reject_reason   VARCHAR(500) NULL
```

**新增 bucket_tags**
```sql
bucket_id UUID NOT NULL, tag VARCHAR(50) NOT NULL, PRIMARY KEY (bucket_id, tag)
```

**新增 upload_reservations**
```sql
id UUID PK, user_id UUID, bucket_id UUID, bytes BIGINT,
expires_at TIMESTAMP, settled BOOLEAN DEFAULT FALSE
```
> 预占记录单独建表而不是放缓存：配额是钱一样的东西，必须能落库对账、服务重启不丢。

### 3.2 迁移文件（两套数据库都要写，项目就是这么组织的）

```
internal/database/migrations/postgres/00018_add_public_catalog.sql
internal/database/migrations/postgres/00019_add_user_quota.sql
internal/database/migrations/postgres/00020_add_file_review.sql
internal/database/migrations/sqlite/00018_add_public_catalog.sql
internal/database/migrations/sqlite/00019_add_user_quota.sql
internal/database/migrations/sqlite/00020_add_file_review.sql
```

> 注意：SQLite 不支持 `ALTER TABLE ... ADD COLUMN` 带非常量默认值等语法差异，两套 SQL 必须分别验证；迁移用 Goose，当前版本 17。

## 4. 接口清单

### 4.1 新增：匿名只读（`/api/v1/public`，需加入 `AuthExcludedPatterns`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/public/buckets` | 栏目列表，支持 `category` / `tag` / `q` / `sort` / 分页 |
| GET | `/public/buckets/{slug}` | 栏目详情 + 根目录内容 |
| GET | `/public/buckets/{slug}/files` | 目录内容（`folder` 参数） |
| GET | `/public/files/{id}/download` | 返回预签名下载 URL（限流 + 只允许 approved） |
| GET | `/public/categories` | 分类聚合 |
| GET | `/public/trending` | 按下载量聚合的热门榜 |

### 4.2 新增：注册与配额

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 提交邮箱 + 密码，发验证邮件 |
| POST | `/api/v1/auth/register/verify` | 校验验证码，激活账号 |
| POST | `/api/v1/auth/register/resend` | 重发验证码（限流） |
| GET | `/api/v1/users/me/usage` | 返回 quota / used / 百分比 |

### 4.3 新增：审核

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/admin/reviews` | 待审列表（按桶、时间筛选） |
| POST | `/api/v1/admin/reviews/{fileId}/approve` | 通过 |
| POST | `/api/v1/admin/reviews/{fileId}/reject` | 驳回 + 理由 |

### 4.4 修改

- `internal/services/bucket_file.go`：签发上传 URL 前调用 `QuotaService.Reserve`，超限返回 413 + 明确文案
- `internal/services/bucket_file.go`：上传完成回调里 `Settle`；公开桶内的文件落 `pending_review`
- `internal/services/bucket.go`：桶更新接口支持 `is_public` / `slug` / `category` / `tags`
- `internal/services/public_share.go`：分享 `pending_review` 文件时拒绝

## 5. 前端改造

### 5.1 路由（TanStack Router 文件路由，新增文件即生效）

```
web/src/routes/index.tsx                        改：公开首页（从 _authenticated 拆出）
web/src/routes/public/$slug.tsx                 新：栏目详情
web/src/routes/public/$slug/files/{-$folderId}.tsx  新：目录浏览
web/src/routes/public/search.tsx                新：搜索结果
web/src/routes/auth/register/index.tsx          新：注册 + 邮箱验证
web/src/routes/_authenticated/admin/reviews/index.tsx  新：审核台
web/src/routes/_authenticated/usage/index.tsx   新：我的配额用量
```

> 现有 `web/src/routes/_authenticated/index.tsx` 是登录后首页，必须保留；公开首页要新增独立文件并调整 `__root.tsx` 的默认落点，否则未登录用户会被 `requireAuth` 弹回登录页。

### 5.2 组件

```
web/src/components/public-catalog/     栏目卡片、标签筛选、分页
web/src/components/register/           注册表单与验证码
web/src/components/admin-review/       审核列表与批量操作
web/src/components/quota-bar/          配额进度条
```

### 5.3 国际化

- 新增 `web/src/locales/zh.json`，在 `web/src/lib/i18n.ts` 的 `resources` 注册 `zh`
- 流程：`npm run i18n:extract` 抽 key → 补 `zh.json` → `npm run i18n:lint` 校验无漏译
- 现有词条约 1100 条，属于机械工作量，可以边开发边补

## 6. 分阶段路线图

### P0 —— 能上线（最小可用）
- 中文界面（`zh.json` + 语言切换）
- 公开只读：`is_public` 桶 + `/public/*` 读接口 + 公开首页 + 栏目页
- 游客下载走预签名，无需登录
- **验收**：未登录浏览器打开首页 → 看到栏目 → 点进目录 → 下载成功；全站中文

### P1 —— 账号体系
- 自助注册 + 邮箱验证 + 登录态打通
- 配额字段 + 用量展示 + 签发前拦截
- **验收**：新邮箱注册 → 收验证信 → 激活 → 上传一个小文件成功；上传超配额返回明确错误且不产生垃圾对象

### P2 —— 审核闭环
- `FileStatus` 扩展 + 上传落待审 + 管理员审核台 + 驳回理由回显
- 公开视图只过滤 `approved`
- **验收**：注册用户上传 → 公开页看不到 → 管理员通过 → 公开页出现；驳回后上传者能看到理由

### P3 —— 检索与运营
- 分类聚合、标签筛选、关键词搜索（先 `LIKE` / SQLite FTS5，够用再上 pg_trgm）
- 下载量统计与热门榜、管理端仪表盘补指标
- **验收**：搜索命中文件名与栏目名；热门榜数据与活动日志一致

## 7. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 直传配额超卖 | 用户超额占用磁盘 | 预占记录落库 + 过期回收 worker + 结算对账 |
| 匿名接口被刷 | 接口被打挂 / 带宽被打爆 | 复用 `UnauthenticatedRequestsPerMinute`，下载接口单独限流 |
| SQLite 并发写瓶颈 | 公开后并发上升导致锁等待 | 上线前切 PostgreSQL（`deployments/local/full` 已有现成编排） |
| 审核与分享冲突 | 待审文件被分享链接泄露 | 签发分享时校验 `review_status` |
| 双数据库迁移不同步 | 只测了一种 DB，另一种启动失败 | 迁移两套都写，用现有 integration 测试跑双库 |
| 公开首页改了默认落点 | 老用户登录后被踢 | `__root.tsx` 只改默认重定向，`_authenticated` 守卫保持原样 |

## 8. 本次不做（明确划出边界）

- 多租户 SaaS、计费订阅
- 视频转码、在线预览（后续可接独立的预览服务）
- 全文检索集群（Elasticsearch 之类，LIKE/FTS5 不够时再上）
- 移动端 App

## 9. 待确认

1. 公开内容是否允许「游客直接下载」，还是必须登录/注册？（当前按游客可下载设计）
2. 注册是否需要管理员审批（注册后默认 `user` 角色即可，还是要先 `guest` 待批）？
3. 配额默认值定多少（例如 5GB / 20GB / 不限）？
4. 是否保留现有的桶内协作能力（成员邀请、上传通知），还是对外站场景直接简化掉？
