import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * dsh-balance — DeepSeek API 余额显示(Host 半区)。
 *
 * 职责:
 *   1. 定时查询 DeepSeek 官方余额接口 https://api.deepseek.com/user/balance,
 *      结果缓存在内存中(每 refreshMs 毫秒自动刷新一次)。
 *   2. 注册一个 webServer 路由(默认 GET /balance)供浏览器端小部件拉取,
 *      同源请求,不经过模型,无 CORS 问题。
 *   3. 注册模型工具 check_balance,让 agent 也能直接回答"余额还剩多少"。
 *
 * Config:
 *   baseUrl   — 供应商 API 根地址(默认 https://api.deepseek.com)
 *   apiKeyEnv — 凭据引用名,经 credentials 服务解析(默认 DEEPSEEK_API_KEY)
 *   refreshMs — 自动刷新间隔毫秒(默认 60000)
 *   routePath — webServer 路由路径(默认 /balance)
 */

const name = 'dsh-balance'
// timer/webServer/credentials 都必须是硬依赖:本行会等待三者全部 ACTIVE 后再 apply。
// ctx.get() 是 strict 模式——提供方 fiber 未到 ACTIVE 就返回 undefined;
// 若不 inject credentials,启动竞态下可能在其就绪前 apply,导致凭据被永久缓存为 undefined。
const inject = ['timer', 'webServer', 'credentials']

const Config = z.object({
  baseUrl: z.string().default('https://api.deepseek.com'),
  apiKeyEnv: z.string().default('DEEPSEEK_API_KEY'),
  refreshMs: z.number().default(60000),
  routePath: z.string().default('/balance'),
})

function apply(ctx, config = {}) {
  const baseUrl = String(config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
  const apiKeyEnv = config.apiKeyEnv || 'DEEPSEEK_API_KEY'
  const refreshMs = Number(config.refreshMs) || 60000
  const routePath = config.routePath || '/balance'

  let state = { status: 'loading', updatedAt: 0 }
  let fetching = false

  async function fetchBalance() {
    if (fetching) return state
    fetching = true
    let timer
    try {
      // 每次调用重新读取(而非 apply 时捕获一次),配合 inject 双保险
      const credentials = ctx.get('credentials')
      if (credentials === undefined) throw new Error('credentials 服务不可用')
      const cred = await credentials.resolve(apiKeyEnv)
      if (cred === undefined) throw new Error(`未配置 ${apiKeyEnv} 凭据`)
      const controller = new AbortController()
      timer = setTimeout(() => controller.abort(), 20000)
      try {
        const response = await fetch(`${baseUrl}/user/balance`, {
          headers: { Authorization: `Bearer ${cred.value}` },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const parsed = await response.json()
        const info = Array.isArray(parsed.balance_infos) && parsed.balance_infos.length > 0
          ? parsed.balance_infos[0]
          : undefined
        state = {
          status: 'ok',
          currency: info && info.currency ? String(info.currency) : 'CNY',
          total: info && info.total_balance !== undefined ? String(info.total_balance) : '0',
          granted: info && info.granted_balance !== undefined ? String(info.granted_balance) : undefined,
          toppedUp: info && info.topped_up_balance !== undefined ? String(info.topped_up_balance) : undefined,
          isAvailable: parsed.is_available !== undefined ? !!parsed.is_available : true,
          updatedAt: Date.now(),
        }
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      state = {
        status: 'error',
        error: String(error && error.message ? error.message : error),
        updatedAt: Date.now(),
      }
    } finally {
      fetching = false
    }
    return state
  }

  ctx.interval(() => {
    fetchBalance()
  }, refreshMs)
  fetchBalance()

  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    webServer.register({
      kind: 'exact',
      path: routePath,
      handler: async (req, res) => {
        if (req.url && req.url.includes('refresh=1')) await fetchBalance()
        const body = JSON.stringify(state)
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(body)
      },
    })
  }

  const tools = ctx.get('tools')
  if (tools !== undefined) {
    tools.register(defineTool({
      name: 'check_balance',
      description: '查询当前 DeepSeek API 账户的剩余金额。返回货币、总余额、赠送余额、充值余额、账户可用状态与更新时间;余额由 dsh-balance 插件每 60 秒自动刷新并缓存,调用前会先拉一次最新值。',
      parameters: {},
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute() {
        await fetchBalance()
        return state
      },
    }))
  }
}

export { Config, apply, inject, name }
