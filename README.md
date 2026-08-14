# dsh-balance

DeepSeek API 余额显示插件(dsh bundle):在 dsh web 的对话输入框下方**常驻显示账户剩余金额**,每 60 秒自动刷新,并为模型提供 `check_balance` 工具。

中文 | [English](./README.en.md)

## 特性

- 🖥️ **Web 常驻读数** — 输入框下方与统计信息同一排显示 `DeepSeek 余额:¥xx.xx`,悬停显示赠送/充值明细
- 🤖 **模型工具** — 注册 `check_balance`,直接对 agent 说"查下余额"即可
- 🔐 **零密钥泄露** — API key 只存在于宿主进程(经 dsh `credentials` 服务解析 `DEEPSEEK_API_KEY`),浏览器只拉取宿主缓存的 JSON 摘要
- 📦 **一条命令安装** — 声明 `dsh.bundle`,安装后自动加入 profile 层并挂载自身 patch,**无需手改任何配置文件**
- ⚡ **常驻缓存** — 宿主每 60 秒查询一次官方余额接口,客户端同源拉取,不依赖模型调用

## 效果

对话输入框下方(与上下文统计同一排)显示一行小字:

```
DeepSeek 余额:¥14.39
```

- 悬停显示明细:`赠送 0.00 / 充值 14.39`
- 查询失败时显示错误原因,60 秒后自动重试

## 环境要求

- dsh(deepseek-harness)web 部署,Node.js ≥ 18(宿主使用内置 `fetch`)
- DeepSeek API key 已配置,且 `credentials` 服务可解析 `DEEPSEEK_API_KEY`(通常位于 `$DSH_HOME/.credentials.yaml`)

## 安装

### 从 GitHub 安装(推荐)

```bash
dsh plugin --profile web add git+https://github.com/Yogioo/dsh-balance.git
```

安装器自动把 `dsh-balance` 追加到 `dsh.profile.bundles`(因为包声明了 `dsh.bundle`),自带 patch 完成挂载。**重启 `dsh web` 后生效**,刷新页面即可看到读数。

### 从 tarball 安装

```bash
dsh plugin --profile web add ./dsh-balance-0.1.0.tgz
```

### 本地开发安装

```bash
dsh plugin --profile web add file:C:/projects/dsh-balance
```

### 验证

```bash
dsh --profile web --dump-config    # 组合树中应出现 # == dsh-balance 行
curl http://127.0.0.1:3080/balance # 返回余额 JSON
```

## 配置(可选)

默认无需配置。如需覆盖,在 profile 的 `cordis.patch.yml` 中按行 id 覆盖(整行替换 config):

```yaml
- id: dsh-balance
  config:
    baseUrl: https://api.deepseek.com   # 供应商 API 根地址
    apiKeyEnv: DEEPSEEK_API_KEY         # 凭据引用名(credentials 服务解析)
    refreshMs: 60000                    # 自动刷新间隔(毫秒)
    routePath: /balance                 # webServer 路由路径
```

## 架构

```
┌─────────────────────────────── 宿主进程 (Node) ───────────────────────────────┐
│  dsh-balance (lib/index.js)                                                   │
│    credentials.resolve('DEEPSEEK_API_KEY') → fetch(/user/balance) → 缓存 state │
│    ├─ ctx.interval(60s) 自动刷新                                               │
│    ├─ webServer route GET /balance → JSON(state)   ← 浏览器同源拉取            │
│    └─ tools.register(check_balance)                 ← 模型可调用               │
└──────────────────────────────────────────────────────────────────────────────┘
                                        ▲
                        同源 fetch('/balance')(每 60s)
                                        │
┌─────────────────────────────── 浏览器页面 ─────────────────────────────────────┐
│  dsh-balance (lib/client.js)                                                   │
│    conversation.composer.dock 槽位 → 常驻读数小部件                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

关键设计:

- **两个半区是同一份 npm 包的两个入口**:`main` → `lib/index.js`(宿主),`exports["./client"]` → `lib/client.js`(浏览器),`dsh.client.platform: "web"` 声明客户端入口,由 dsh 的 client-modules 扫描进 Web 启动图
- **客户端不接触密钥**:所有密钥操作在宿主进程内完成,浏览器只消费宿主缓存的公开摘要

## 项目结构

```
dsh-balance/
├── package.json        # dsh.bundle.patch + dsh.client(web) 声明
├── cordis.patch.yml    # bundle 自带的挂载 patch(插入 dsh-balance 行)
├── lib/
│   ├── index.js        # Host 半区:查询/缓存余额 + /balance 路由 + check_balance 工具
│   └── client.js       # Client 半区:输入框下方常驻读数小部件(编译后的 bundle 格式)
├── README.md
├── README.en.md
└── LICENSE
```

## 开发说明

- 修改宿主逻辑后直接生效于下次启动;修改 `lib/client.js` 后需重启 `dsh web`(client 模块图在启动时扫描,包元数据带缓存)
- 重新打包分享产物:

```bash
npm pack   # 生成 dsh-balance-<version>.tgz(已加入 .gitignore,不进版本库)
```

- 行 id 冲突说明:bundle 的 patch 与用户 patch 按"同一行 id 后者覆盖"合并,用户侧永远可以覆盖本包默认配置

## 卸载

```bash
dsh plugin --profile web remove dsh-balance
```

## License

MIT © Yogioo
