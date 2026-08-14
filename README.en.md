# dsh-balance

DeepSeek API balance display plugin (dsh bundle): shows your account balance **persistently under the conversation composer** in the dsh web UI, auto-refreshed every 60 seconds, plus a `check_balance` model tool.

中文 | [English](./README.en.md)

## Features

- 🖥️ **Persistent web readout** — a compact line under the composer (same band as the context stats): `DeepSeek 余额:¥xx.xx`, hover for the granted/topped-up breakdown
- 🤖 **Model tool** — registers `check_balance`, so you can just ask the agent "what's my balance?"
- 🔐 **No key exposure** — the API key lives only in the host process (resolved through the dsh `credentials` service as `DEEPSEEK_API_KEY`); the browser only fetches a cached public JSON summary
- 📦 **One-command install** — declares `dsh.bundle`, so the installer auto-appends it to `dsh.profile.bundles` and its own patch mounts the plugin row; **no manual config editing**
- ⚡ **Host-side caching** — queries the official balance endpoint every 60 s; the client pulls same-origin, independent of model calls

## Requirements

- dsh (deepseek-harness) web deployment, Node.js ≥ 18 (host uses built-in `fetch`)
- A DeepSeek API key resolvable by the `credentials` service as `DEEPSEEK_API_KEY` (usually in `$DSH_HOME/.credentials.yaml`)

## Install

### From GitHub (recommended)

```bash
dsh plugin --profile web add git+https://github.com/Yogioo/dsh-balance.git
```

The installer appends `dsh-balance` to `dsh.profile.bundles` automatically (the package declares `dsh.bundle`), and the bundled patch mounts the plugin. **Restart `dsh web`**, then refresh the page.

### From a tarball

```bash
dsh plugin --profile web add ./dsh-balance-0.1.0.tgz
```

### From a local checkout

```bash
dsh plugin --profile web add file:C:/projects/dsh-balance
```

### Verify

```bash
dsh --profile web --dump-config     # expect a "# == dsh-balance" row
curl http://127.0.0.1:3080/balance  # returns the balance JSON
```

## Configuration (optional)

No config needed by default. To override, target the row id from the profile's `cordis.patch.yml` (the whole `config` is replaced):

```yaml
- id: dsh-balance
  config:
    baseUrl: https://api.deepseek.com   # provider API root
    apiKeyEnv: DEEPSEEK_API_KEY         # credential ref resolved via the credentials service
    refreshMs: 60000                    # auto-refresh interval in ms
    routePath: /balance                 # webServer route path
```

## Architecture

```
┌────────────────────────────── Host process (Node) ────────────────────────────┐
│  dsh-balance (lib/index.js)                                                   │
│    credentials.resolve('DEEPSEEK_API_KEY') → fetch(/user/balance) → cache     │
│    ├─ ctx.interval(60s) auto refresh                                          │
│    ├─ webServer route GET /balance → JSON(state)   ← fetched same-origin      │
│    └─ tools.register(check_balance)                 ← model-callable          │
└──────────────────────────────────────────────────────────────────────────────┘
                                        ▲
                        same-origin fetch('/balance') (every 60 s)
                                        │
┌────────────────────────────── Browser page ───────────────────────────────────┐
│  dsh-balance (lib/client.js)                                                   │
│    conversation.composer.dock slot → persistent readout widget                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

Key design points:

- One npm package, two entry points: `main` → `lib/index.js` (host) and `exports["./client"]` → `lib/client.js` (browser), with `dsh.client.platform: "web"`; the dsh client-modules scan wires it into the web boot graph
- The client never touches the key: all secret handling happens in the host process, and the browser consumes only the cached public summary

## Project layout

```
dsh-balance/
├── package.json        # dsh.bundle.patch + dsh.client (web) declaration
├── cordis.patch.yml    # the bundle's own mount patch (inserts the dsh-balance row)
├── lib/
│   ├── index.js        # Host half: fetch/cache + /balance route + check_balance tool
│   └── client.js       # Client half: persistent composer-dock readout (bundled format)
├── README.md
└── LICENSE
```

## Development notes

- Host changes take effect on the next start; changes to `lib/client.js` also need a `dsh web` restart (client module graph is scanned at boot, package metadata is cached)
- Repack the share artifact:

```bash
npm pack   # produces dsh-balance-<version>.tgz (git-ignored, not committed)
```

- Row-id semantics: bundle patches and the user patch merge per row id with the last write winning — the user side can always override defaults

## Uninstall

```bash
dsh plugin --profile web remove dsh-balance
```

## License

MIT © Yogioo
