// dsh-balance Client 半区 — 编译好的 client bundle 格式。
// 在 conversation.composer.dock(输入框下方常驻读数位)渲染余额小部件,
// 每 60 秒通过同源 fetch('/balance') 拉取宿主缓存的最新余额。
window.__ModuleLoader__.load({
  id: 'dsh-balance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var react = require('react')

    var CSS = '' +
      '.bal-readout{font-size:12px;line-height:1.4;opacity:.75;padding:0 12px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.bal-readout.bal-err{opacity:.9;}'

    function BalanceWidget() {
      var dataState = react.useState(null)
      var data = dataState[0]
      var setData = dataState[1]

      react.useEffect(function () {
        var alive = true
        function load() {
          fetch('/balance')
            .then(function (r) { return r.json() })
            .then(function (d) { if (alive) setData(d) })
            .catch(function () { if (alive) setData({ status: 'error', error: '网络请求失败' }) })
        }
        load()
        var timer = setInterval(load, 60000)
        return function () { alive = false; clearInterval(timer) }
      }, [])

      if (data === null || data.status === 'loading') {
        return react.createElement('div', { className: 'bal-readout' }, '余额:加载中…')
      }
      if (data.status === 'error') {
        return react.createElement('div', { className: 'bal-readout bal-err' },
          '余额获取失败:' + String(data.error || '未知错误'))
      }
      var symbol = data.currency === 'CNY' ? '¥' : data.currency + ' '
      var breakdown = (data.granted !== undefined || data.toppedUp !== undefined)
        ? '赠送 ' + (data.granted || '0') + ' / 充值 ' + (data.toppedUp || '0')
        : undefined
      return react.createElement('div', { className: 'bal-readout', title: breakdown },
        'DeepSeek 余额:' + symbol + data.total)
    }

    var inject = ['slots']

    function apply(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) return

      ctx.effect(function () {
        var tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-balance'
        tag.dataset.pluginCss = 'dsh-balance/readout'
        tag.textContent = CSS
        document.head.appendChild(tag)
        return function () { tag.remove() }
      })

      slots.inject('conversation.composer.dock', function () {
        return slots.register(
          { name: 'conversation.composer.dock', id: 'balance-readout', order: 1 },
          function () { return react.createElement(BalanceWidget) },
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
