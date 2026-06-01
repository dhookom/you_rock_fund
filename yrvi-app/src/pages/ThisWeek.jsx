import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { RefreshCw, Clock, TrendingUp, AlertCircle, Play } from 'lucide-react'

function useCountdown(isoStr) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!isoStr) return
    const update = () => {
      const diff = new Date(isoStr) - Date.now()
      if (diff <= 0) { setLabel('Executing now!'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setLabel(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [isoStr])
  return label
}

function fmtDate(s) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  } catch { return s }
}

export default function ThisWeek() {
  const [screener, setScreener]       = useState(null)
  const [status, setStatus]           = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [runAt, setRunAt]             = useState(null)
  const [manualRunning, setManualRunning] = useState(false)
  const [manualMsg, setManualMsg]     = useState(null)
  const [runStatus, setRunStatus]     = useState(null)

  useEffect(() => {
    axios.get('/api/status').then(r => setStatus(r.data)).catch(() => {})
    axios.get('/api/run-status').then(r => setRunStatus(r.data)).catch(() => {})
  }, [])

  // Always poll run-status every 5s so we catch both manual and scheduled runs
  useEffect(() => {
    const t = setInterval(() => {
      axios.get('/api/run-status').then(r => {
        const wasExecuting = runStatus?.executing
        setRunStatus(r.data)
        // Run just finished — show result
        if (wasExecuting && !r.data.executing) {
          if (r.data.result) {
            const { fills, premium } = r.data.result
            setManualMsg({ ok: true, text: `✅ Run complete — ${fills} fill(s), $${premium.toLocaleString()} premium collected` })
          } else if (r.data.error) {
            setManualMsg({ ok: false, text: `Run failed: ${r.data.error}` })
          }
        }
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [runStatus?.executing])

  const countdown = useCountdown(status?.next_execution)

  const execLabel = (() => {
    if (!status?.next_execution) return 'Monday 10:00 AM PST (1:00 PM ET)'
    const d = new Date(status.next_execution)
    const day = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' })
    const pst = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' })
    const et  = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
    return `${day} ${pst} PST (${et} ET)`
  })()

  const isExecuting = runStatus?.executing || manualRunning

  const triggerManualRun = useCallback(async () => {
    if (!window.confirm('Run the CSP pipeline now?\n\nOnly use this if the scheduled run failed or you need a mid-week re-run. This will place real orders in your IBKR account immediately.')) return
    setManualRunning(true)
    setManualMsg(null)
    try {
      await axios.post('/api/manual-run', {}, { timeout: 15000 })
      setRunStatus({ executing: true, started_at: new Date().toISOString(), result: null, error: null })
      setManualMsg(null)
    } catch (err) {
      setManualMsg({ ok: false, text: err.response?.data?.detail ?? err.message })
    } finally {
      setManualRunning(false)
    }
  }, [])

  const runScreener = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get('/api/screener', { timeout: 60000 })
      setScreener(res.data)
      setRunAt(new Date())
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const positions = screener?.positions ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">This Week</h1>
        <div className="text-gray-500 text-sm">Preview next Monday's targets</div>
      </div>

      {/* Next execution */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-sm mb-1">Next Execution</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white font-mono">{countdown || '—'}</div>
            <div className="text-gray-500 dark:text-gray-600 text-sm mt-1">{execLabel}</div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Clock size={40} className="text-blue-600/30" />
            <div className="flex gap-2">
              <button
                onClick={runScreener}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-wait text-white text-sm font-medium rounded-lg transition-colors"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Running...' : 'Run Screener'}
              </button>
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={triggerManualRun}
                  disabled={isExecuting}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 disabled:cursor-wait text-white text-sm font-medium rounded-lg transition-colors"
                  title="Run the full CSP pipeline now and place orders"
                >
                  <Play size={14} className={isExecuting ? 'animate-pulse' : ''} />
                  {isExecuting ? 'Executing...' : 'Run Now'}
                </button>
                <div className="text-xs text-gray-400 dark:text-gray-600 text-right">Only if schedule failed or mid-week re-run</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Executing banner */}
      {isExecuting && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent flex-shrink-0" />
            <div className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {runStatus?.current_ticker
                ? <>Working on <span className="font-bold">{runStatus.current_ticker}</span>
                    {runStatus.current_stage ? <span className="font-normal opacity-75"> — {runStatus.current_stage}</span> : ''}</>
                : 'Pipeline executing — connecting to IBKR...'}
            </div>
          </div>

          {/* Per-ticker results so far */}
          {runStatus?.ticker_results?.length > 0 && (
            <div className="space-y-1">
              {runStatus.ticker_results.map((r, i) => {
                const filled = r.status === 'filled' || r.status === 'partial_fill' || r.status === 'dry_run'
                const skipped = r.status?.startsWith('skipped')
                const emoji = filled ? '✅' : skipped ? '⚠️' : '❌'
                const detail = filled
                  ? `filled @ $${r.fill_price?.toFixed(2)} via ${r.order_type?.replace('_',' ')} — $${r.premium_collected?.toFixed(0)}`
                  : r.status?.replace(/_/g, ' ')
                return (
                  <div key={i} className="text-xs font-mono text-blue-800 dark:text-blue-300 flex gap-2">
                    <span>{emoji}</span>
                    <span className="font-bold">{r.ticker}</span>
                    <span className="opacity-75">{detail}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer note */}
          <div className="text-xs text-blue-600 dark:text-blue-500 opacity-75">
            Check the <span className="font-medium">Dashboard</span> for live holdings and final results.
          </div>
        </div>
      )}

      {/* Manual run feedback */}
      {manualMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${manualMsg.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
          {manualMsg.ok ? '✅' : '❌'} {manualMsg.text}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
          <div className="text-gray-600 dark:text-gray-400">Running screener + position sizer...</div>
          <div className="text-gray-500 dark:text-gray-600 text-sm mt-1">This takes ~10 seconds</div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 flex gap-3">
          <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-red-400 font-medium text-sm">Screener error</div>
            <div className="text-red-400/70 text-sm mt-1">{error}</div>
          </div>
        </div>
      )}

      {/* Results */}
      {screener && !loading && (
        <>
          {/* Capital allocation (shown when wheel holdings are active) */}
          {(screener.active_wheel_count ?? 0) > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <div className="text-gray-900 dark:text-white font-semibold text-sm mb-3">Capital Allocation</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    {screener.compound_enabled ? 'Effective Budget (net liq)' : 'Fund Budget'}
                  </span>
                  <span className="text-gray-900 dark:text-white font-mono">${(screener.total_budget ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-red-400">
                  <span>
                    Reserved ({screener.active_wheel_count} wheel holding{screener.active_wheel_count !== 1 ? 's' : ''})
                    {(screener.wheel_holdings ?? []).filter(h => h.shares > 0).map(h => ` · ${h.ticker}`).join('')}
                  </span>
                  <span className="font-mono">− ${(screener.reserved_capital ?? 0).toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-800 pt-2 flex justify-between font-semibold">
                  <span className="text-gray-900 dark:text-white">Available for CSPs</span>
                  <span className="text-green-400 font-mono">${(screener.budget ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-600 pt-0.5">
                  <span>CSP positions this week</span>
                  <span>{positions.length} of {(screener.active_wheel_count ?? 0) + positions.length} total slots</span>
                </div>
              </div>
            </div>
          )}

          {/* Wheel holdings table */}
          {(screener.wheel_holdings ?? []).some(h => h.shares > 0) && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
                <div className="text-gray-900 dark:text-white font-semibold text-sm">🔄 Wheel Holdings</div>
                <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">
                  {screener.wheel_holdings.filter(h => h.shares > 0).length}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-200 dark:border-gray-800">
                    {['Ticker', 'Shares', 'Assigned @', 'Capital Tied', 'CC Status', 'CC Strike', 'Expiry'].map(h => (
                      <th key={h} className={`${h === 'Ticker' ? 'text-left' : 'text-right'} px-4 py-3`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {screener.wheel_holdings.filter(h => h.shares > 0).map(h => {
                    const capitalTied = h.shares * (h.assigned_strike ?? 0)
                    return (
                      <tr key={h.ticker} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-gray-900 dark:text-white font-semibold">{h.ticker}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{h.shares}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">${h.assigned_strike}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-medium font-mono">${capitalTied.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${
                            h.cc_status === 'open'    ? 'bg-green-900/40 text-green-400 border-green-800'
                            : h.cc_status === 'pending' ? 'bg-yellow-900/40 text-yellow-400 border-yellow-800'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                          }`}>{h.cc_status ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{h.current_cc_strike ? `$${h.current_cc_strike}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 text-xs">{h.current_cc_expiry ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'CSP Positions',  value: positions.length },
              { label: 'Total Premium',  value: `$${(screener.total_premium ?? 0).toLocaleString()}`, accent: 'text-green-400' },
              { label: 'Blended Yield',  value: `${(screener.blended_yield ?? 0).toFixed(2)}%`,      accent: 'text-blue-400' },
            ].map(({ label, value, accent = 'text-gray-900 dark:text-white' }) => (
              <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <div className="text-gray-500 text-xs mb-2">{label}</div>
                <div className={`text-2xl font-bold ${accent}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* CSP targets table */}
          {positions.length > 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="text-gray-900 dark:text-white font-semibold text-sm">CSP Targets</div>
                <div className="text-gray-500 dark:text-gray-600 text-xs">Budget: ${(screener.budget ?? 0).toLocaleString()}</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-200 dark:border-gray-800">
                    {['#', 'Ticker', 'Strike', 'Contracts', 'Capital', 'Premium', 'Yield', 'Buffer', 'Delta', 'Expiry'].map(h => (
                      <th key={h} className={`${h === '#' || h === 'Ticker' ? 'text-left' : 'text-right'} px-4 py-3`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => {
                    const bufPct = p.buffer_pct ?? 0
                    return (
                      <tr key={p.ticker} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-600 text-xs">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-900 dark:text-white font-semibold">{p.ticker}</span>
                            {p.buyzone && (
                              <span className="text-xs text-blue-400 border border-blue-800 bg-blue-900/30 px-1.5 py-0.5 rounded">bz</span>
                            )}
                          </div>
                          <div className="text-gray-500 dark:text-gray-600 text-xs">{p.sector}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-white">${p.strike}</td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{p.contracts}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">${(p.capital_used ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-green-400 font-medium">${(p.premium_total ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-green-400">{(p.yield_pct ?? 0).toFixed(2)}%</td>
                        <td className={`px-4 py-3 text-right font-medium ${
                          bufPct >= 10 ? 'text-green-400' : bufPct >= 5 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {bufPct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{p.delta?.toFixed(3)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 text-xs">{fmtDate(p.expiry)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-10 text-center">
              <TrendingUp size={32} className="text-gray-300 dark:text-gray-700 mx-auto mb-3" />
              <div className="text-gray-500">No positions sized — screener returned 0 qualified targets</div>
            </div>
          )}

          <div className="bg-blue-100 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-900/40 rounded-xl px-5 py-3.5 text-xs text-blue-800 dark:text-blue-300/80 leading-relaxed">
            <span className="font-semibold text-blue-900 dark:text-blue-300">These are screener estimates, not final results.</span>
            {' '}Strikes, premiums, and deltas are calculated Saturday using delayed data and will differ from Monday&apos;s execution against the live IBKR option chain.
            {' '}For wheel holdings, covered calls will target the assigned strike if its delta is ≥ 0.20 — not the strike shown above.
          </div>

          {runAt && (
            <div className="text-gray-400 dark:text-gray-700 text-xs text-right">
              Screener run at {runAt.toLocaleTimeString()}
            </div>
          )}
        </>
      )}

      {/* Idle state */}
      {!screener && !loading && !error && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center">
          <TrendingUp size={40} className="text-gray-300 dark:text-gray-700 mx-auto mb-4" />
          <div className="text-gray-500 text-lg mb-2">No screener results</div>
          <div className="text-gray-500 dark:text-gray-600 text-sm mb-6">
            Click "Run Screener" to fetch and size this week's targets
          </div>
          <button
            onClick={runScreener}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Run Screener Now
          </button>
        </div>
      )}
    </div>
  )
}
