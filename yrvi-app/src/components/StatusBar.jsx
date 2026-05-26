import { useEffect, useState, useRef } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import axios from 'axios'
import { useThemeContext } from '../ThemeProvider.jsx'

function Indicator({ ok, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-500'}`} />
      <span className={`text-xs ${ok ? 'text-gray-700 dark:text-gray-300' : 'text-red-400'}`}>{label}</span>
    </div>
  )
}

function fmt(n) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString()
}

const THEME_CYCLE = { dark: 'light', light: 'system', system: 'dark' }
const THEME_ICONS = {
  dark:   <Moon size={14} />,
  light:  <Sun size={14} />,
  system: <Monitor size={14} />,
}

function versionDiff(current, latest) {
  const parse = v => (v || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const [cM, cN, cP] = parse(current)
  const [lM, lN, lP] = parse(latest)
  if (lM > cM) return 'major'
  if (lN > cN) return 'minor'
  if (lP > cP) return 'patch'
  return 'same'
}

export default function StatusBar() {
  const [status, setStatus]       = useState(null)
  const [pidFlash, setPidFlash]   = useState(false)
  const prevPid                   = useRef(null)
  const { theme, setTheme }       = useThemeContext()

  const [versionInfo, setVersionInfo]     = useState(null)
  const [vChecking, setVChecking]         = useState(false)
  const [vFlash, setVFlash]               = useState(null)   // {msg, color} | null
  const [showConfirm, setShowConfirm]     = useState(false)
  const [upgradePhase, setUpgradePhase]   = useState(null)   // null|waiting_down|waiting_up|done|error
  const [upgradeOutput, setUpgradeOutput] = useState('')
  const pollRef = useRef(null)

  // ── Status polling every 30s ─────────────────────────────────
  useEffect(() => {
    const fetch = () => axios.get('/api/status').then(r => {
      setStatus(r.data)
      const newPid = r.data?.scheduler_pid
      if (prevPid.current != null && newPid != null && newPid !== prevPid.current) {
        setPidFlash(true)
        setTimeout(() => setPidFlash(false), 2000)
      }
      prevPid.current = newPid
    }).catch(() => {})
    fetch()
    const t = setInterval(fetch, 30000)
    return () => clearInterval(t)
  }, [])

  // ── Version polling every 5 minutes ──────────────────────────
  useEffect(() => {
    const check = () =>
      axios.get('/api/version/check')
        .then(r => setVersionInfo(r.data))
        .catch(() => setVersionInfo(prev =>
          prev
            ? { ...prev, latest: null, up_to_date: null, error: 'unavailable' }
            : { current: 'unknown', latest: null, up_to_date: null, error: 'unavailable' }
        ))
    check()
    const t = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const flash = (msg, color) => {
    setVFlash({ msg, color })
    setTimeout(() => setVFlash(null), 2500)
  }

  const checkVersionNow = () => {
    if (vChecking) return
    setVChecking(true)
    axios.get('/api/version/check')
      .then(r => {
        setVersionInfo(r.data)
        if (r.data?.up_to_date) {
          flash('✓ Up to date', 'text-green-400')
        }
        // if behind, the Upgrade button appearing is feedback enough
      })
      .catch(() => flash('Unable to reach GitHub', 'text-gray-400'))
      .finally(() => setVChecking(false))
  }

  // Cleanup any active poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // ── Reconnect polling helpers ─────────────────────────────────
  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  // Poll /api/version/check until the running version matches expectedVersion.
  // docker compose rolling restarts keep the old container alive until the new
  // one is ready, so waiting for /health to go dark is unreliable — version
  // comparison is the definitive signal.
  function startReconnectPolling(baseOutput, expectedVersion) {
    setUpgradePhase('waiting_up')
    let elapsed = 0
    pollRef.current = setInterval(() => {
      elapsed += 3000
      if (elapsed > 300000) {
        stopPoll()
        setUpgradePhase('error')
        setUpgradeOutput(baseOutput +
          '\n\n⚠️  Still running after 5 minutes — check Docker logs:\n  docker compose --env-file .env.compose logs --tail=50 api')
        return
      }
      axios.get('/api/version/check', { timeout: 2000 })
        .then(r => {
          if (r.data?.current && r.data.current === expectedVersion) {
            stopPoll()
            setUpgradePhase('done')
            setTimeout(() => window.location.reload(), 2000)
          }
        })
        .catch(() => {
          // API restarting — keep polling
        })
    }, 3000)
  }

  // ── Upgrade: call API endpoint, then poll for reconnect ──────
  async function handleUpgrade() {
    const expectedVersion = versionInfo?.latest
    setShowConfirm(false)
    setUpgradePhase('waiting_up')
    setUpgradeOutput('Pulling latest code and rebuilding containers…')
    try {
      const res = await axios.post('/api/version/upgrade', {}, { timeout: 90000 })
      const { success, output } = res.data
      setUpgradeOutput(output || '')
      if (success) {
        startReconnectPolling(output || '', expectedVersion)
      } else {
        setUpgradePhase('error')
      }
    } catch (err) {
      // API going dark mid-request means containers are already rebuilding — poll for restart
      if (!err.response) {
        startReconnectPolling('', expectedVersion)
      } else {
        setUpgradePhase('error')
        setUpgradeOutput(err.response?.data?.detail ?? err.message ?? 'Upgrade request failed')
      }
    }
  }

  function closeUpgrade() {
    stopPoll()
    setUpgradePhase(null)
    setUpgradeOutput('')
  }

  // ── Derived version state ─────────────────────────────────────
  const isLive    = status?.trading_mode === 'live'
  const vUp       = versionInfo && !versionInfo.error && versionInfo.up_to_date === true
  const vBehind   = versionInfo && !versionInfo.error && versionInfo.up_to_date === false
  const vUnknown  = !versionInfo || !!versionInfo.error || versionInfo.up_to_date === null
  const diff      = vBehind ? versionDiff(versionInfo.current, versionInfo.latest) : null
  const pillColor = vUp ? 'green' : vBehind && diff === 'patch' ? 'yellow' : vBehind ? 'red' : 'gray'

  const canCancel = upgradePhase === 'waiting_up'

  const upgradeModalPhaseLabel = {
    waiting_up: 'Building & restarting — this takes 1–2 minutes…',
    done:       '✅ Back online! Refreshing...',
    error:      '⚠️ Taking longer than expected',
  }

  return (
    <>
      {/* ── Top bar ────────────────────────────────────────────── */}
      <div className="h-12 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-6 gap-6 shrink-0">
        {/* Status pills */}
        <div className="flex items-center gap-4">
          <Indicator
            ok={status?.gateway_running && status?.gateway_login_status !== 'failed' && status?.gateway_login_status !== 'locked'}
            label={
              status?.gateway_login_status === 'locked' ? 'Gateway · locked out' :
              status?.gateway_login_status === 'failed' ? 'Gateway · login failed' :
              'Gateway'
            }
          />

          {/* Scheduler with PID-change flash */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${
              pidFlash                         ? 'bg-green-300 shadow-[0_0_6px_2px_rgba(74,222,128,0.6)]' :
              status?.scheduler_pid != null    ? 'bg-green-400' : 'bg-red-500'
            }`} />
            <span className={`text-xs transition-colors duration-500 ${
              pidFlash                         ? 'text-green-400 font-semibold' :
              status?.scheduler_pid != null    ? 'text-gray-700 dark:text-gray-300' : 'text-red-400'
            }`}>Scheduler</span>
          </div>

          <Indicator ok={status?.ibkr_connected} label="IBKR" />

          {/* Version pill — click to check for updates */}
          {versionInfo && (
            <div className="flex items-center gap-2">
              <button
                onClick={checkVersionNow}
                disabled={vChecking}
                title={vChecking ? 'Checking…' : 'Click to check for updates'}
                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity disabled:cursor-wait"
              >
                {vChecking
                  ? <svg className="animate-spin w-2 h-2 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  : <div className={`w-2 h-2 rounded-full ${
                      pillColor === 'green'  ? 'bg-green-400' :
                      pillColor === 'yellow' ? 'bg-yellow-400' :
                      pillColor === 'red'    ? 'bg-red-500' : 'bg-gray-400'
                    }`} />
                }
                <span className={`text-xs ${
                  pillColor === 'green'  ? 'text-gray-700 dark:text-gray-300' :
                  pillColor === 'yellow' ? 'text-yellow-400' :
                  pillColor === 'red'    ? 'text-red-400' : 'text-gray-500'
                }`}>
                  {vChecking
                    ? `v${versionInfo.current}`
                    : vUnknown
                    ? 'version unknown'
                    : vUp
                    ? `v${versionInfo.current}`
                    : `v${versionInfo.current} → v${versionInfo.latest}`}
                </span>
                {vFlash && (
                  <span className={`text-xs font-medium ${vFlash.color}`}>
                    {vFlash.msg}
                  </span>
                )}
              </button>
              {vBehind && (
                <button
                  onClick={() => setShowConfirm(true)}
                  className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                    pillColor === 'yellow'
                      ? 'border-yellow-600 text-yellow-400 hover:bg-yellow-900/30'
                      : 'border-red-700 text-red-400 hover:bg-red-900/30'
                  }`}
                >
                  Upgrade
                </button>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-800" />

        {/* Account info */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">Account</span>
          <span className="text-gray-900 dark:text-white font-medium font-mono">{fmt(status?.account_value)}</span>
          {status?.unrealized_pnl != null && status.unrealized_pnl !== 0 && (
            <>
              <span className="text-gray-500">Unrealized</span>
              <span className={`font-medium font-mono ${status.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {status.unrealized_pnl >= 0 ? '+' : '−'}${Math.round(Math.abs(status.unrealized_pnl)).toLocaleString()}
              </span>
            </>
          )}
          <span className="text-gray-500">Buying Power</span>
          <span className="text-gray-900 dark:text-white font-medium font-mono">{fmt(status?.buying_power)}</span>
          {(status?.wheel_count ?? 0) > 0 && (
            <span className="text-yellow-400 font-medium">🔄 {status.wheel_count} wheel{status.wheel_count !== 1 ? 's' : ''}</span>
          )}
        </div>

        <div className="flex-1" />

        {/* Mode badge */}
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
          isLive
            ? 'bg-red-900/50 text-red-400 border-red-700 animate-pulse'
            : 'bg-blue-900/40 text-blue-400 border-blue-800'
        }`}>
          {isLive ? '🔴 LIVE' : '📄 PAPER'}
        </span>

        {status?.account && (
          <span className="text-xs text-gray-500 dark:text-gray-600">{status.account}</span>
        )}

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(THEME_CYCLE[theme])}
          title={`Theme: ${theme} (click to cycle)`}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {THEME_ICONS[theme]}
        </button>
      </div>

      {/* ── Confirmation modal ─────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Upgrade YRVI?</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              This will pull the latest code and rebuild the containers.
              The dashboard will automatically reconnect when complete. Continue?
            </p>
            <p className="text-sm font-mono text-gray-400 dark:text-gray-500 mb-6">
              v{versionInfo?.current} → v{versionInfo?.latest}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpgrade}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                Upgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade progress modal ─────────────────────────────── */}
      {upgradePhase && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              {upgradePhase !== 'done' && upgradePhase !== 'error' && (
                <svg className="animate-spin h-5 w-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {upgradeModalPhaseLabel[upgradePhase]}
              </h2>
            </div>

            {upgradeOutput && (
              <pre className="bg-gray-950 text-green-300 text-xs font-mono p-4 rounded-lg overflow-auto max-h-72 mb-4 whitespace-pre-wrap break-all">
                {upgradeOutput}
              </pre>
            )}

            {upgradePhase === 'error' && (
              <>
                <p className="text-sm text-yellow-400 mb-4">
                  If the restart didn't happen, run{' '}
                  <code className="font-mono bg-gray-800 dark:bg-gray-950 px-1.5 py-0.5 rounded text-yellow-300 text-xs">
                    bash scripts/yrvi-build.sh all --paper
                  </code>{' '}
                  manually from terminal.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={closeUpgrade}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </>
            )}

            {canCancel && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={closeUpgrade}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
