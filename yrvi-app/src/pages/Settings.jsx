import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { Save, AlertTriangle, CheckCircle, Send, Sun, Moon, Monitor, RefreshCw, Power } from 'lucide-react'
import { useThemeContext } from '../ThemeProvider.jsx'

const PRESET_TIMES = [
  { value: '06:30', et: '9:30 AM ET',  note: 'Market Open' },
  { value: '07:00', et: '10:00 AM ET', note: '30 min after open' },
  { value: '07:30', et: '10:30 AM ET', note: '1 hr after open' },
  { value: '08:00', et: '11:00 AM ET', note: '' },
  { value: '09:00', et: '12:00 PM ET', note: 'Noon ET' },
  { value: '10:00', et: '1:00 PM ET',  note: 'Recommended ★' },
  { value: '11:00', et: '2:00 PM ET',  note: '' },
]

function fmtExecTime(val) {
  if (!val) return ''
  const [hStr, mStr] = val.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (isNaN(h) || isNaN(m)) return val
  const pad = n => String(n).padStart(2, '0')
  const pst12 = h % 12 || 12
  const pstAP  = h >= 12 ? 'PM' : 'AM'
  const etH    = (h + 3) % 24
  const et12   = etH % 12 || 12
  const etAP   = etH >= 12 ? 'PM' : 'AM'
  return `${pst12}:${pad(m)} ${pstAP} PST (${et12}:${pad(m)} ${etAP} ET)`
}

function isPreset(val) {
  return PRESET_TIMES.some(p => p.value === val)
}

function SliderRow({ label, value, min, max, step = 1, format = v => v, onChange, description }) {
  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="w-40 shrink-0">
          <div className="text-gray-700 dark:text-gray-300 text-sm">{label}</div>
          <div className="text-blue-500 dark:text-blue-400 font-medium text-sm">{format(value)}</div>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-blue-500 h-1.5"
        />
        <div className="flex gap-1 text-xs text-gray-400 dark:text-gray-600 w-28 shrink-0 justify-end">
          <span>{format(min)}</span>
          <span>–</span>
          <span>{format(max)}</span>
        </div>
      </div>
      {description && (
        <div className="ml-40 mt-1 text-xs text-gray-500 dark:text-gray-600 leading-relaxed">
          {description}
        </div>
      )}
    </div>
  )
}

function Section({ title, emoji, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
      <div className="text-gray-900 dark:text-white font-semibold text-sm flex items-center gap-2">
        <span>{emoji}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, sub, checked, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer select-none">
      <div>
        <div className="text-gray-700 dark:text-gray-300 text-sm">{label}</div>
        {sub && <div className="text-gray-500 dark:text-gray-600 text-xs mt-0.5">{sub}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`} />
      </button>
    </label>
  )
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light',  label: 'Light',  icon: Sun },
  { value: 'dark',   label: 'Dark',   icon: Moon },
]

const TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific  — America/Los_Angeles' },
  { value: 'America/Denver',      label: 'Mountain — America/Denver' },
  { value: 'America/Chicago',     label: 'Central  — America/Chicago' },
  { value: 'America/New_York',    label: 'Eastern  — America/New_York' },
  { value: 'America/Anchorage',   label: 'Alaska   — America/Anchorage' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii   — Pacific/Honolulu' },
]

export default function SettingsPage() {
  const [settings, setSettings]           = useState(null)
  const [original, setOriginal]           = useState(null)
  const [saving, setSaving]               = useState(false)
  const [testing, setTesting]             = useState(false)
  const [msg, setMsg]                     = useState(null)
  const [showModal, setShowModal]         = useState(false)
  const [confirm, setConfirm]             = useState('')
  const [switching, setSwitching]         = useState(false)
  const [liveReady, setLiveReady]         = useState(null)
  const [liveMissing, setLiveMissing]     = useState([])
  const [liveChecking, setLiveChecking]   = useState(false)
  const [accountMasked, setAccountMasked] = useState('')
  const [restarting, setRestarting]       = useState(false)
  const [restartResult, setRestartResult] = useState(null)
  const [timezone, setTimezone]                 = useState('')
  const [timezoneOriginal, setTimezoneOriginal] = useState('')
  const [tzSaving, setTzSaving]                 = useState(false)
  const [showShutdownModal, setShowShutdownModal] = useState(false)
  const [shuttingDown, setShuttingDown]           = useState(false)

  const { theme, setTheme } = useThemeContext()

  useEffect(() => {
    axios.get('/api/settings').then(r => {
      setSettings(r.data)
      setOriginal(r.data)
      const tz = r.data?.timezone || 'America/Los_Angeles'
      setTimezone(tz)
      setTimezoneOriginal(tz)
    })
  }, [])

  const set = useCallback((key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }))
  }, [])

  const showMsg = (type, text) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await axios.post('/api/settings', settings)
      setSettings(res.data)
      setOriginal(res.data)
      showMsg('success', 'Settings saved')
    } catch (err) {
      showMsg('error', err.response?.data?.detail ?? err.message)
    } finally {
      setSaving(false)
    }
  }

  const testDiscord = async () => {
    setTesting(true)
    try {
      await axios.post('/api/discord-test')
      showMsg('success', 'Test notification sent to Discord')
    } catch (err) {
      showMsg('error', err.response?.data?.detail ?? err.message)
    } finally {
      setTesting(false)
    }
  }

  const confirmShutdown = async () => {
    setShuttingDown(true)
    showMsg('success', 'Shutting down…')
    try {
      await axios.post('/api/shutdown', { confirm: 'shutdown' })
    } catch (err) {
      // The api kills itself shortly after responding, so a network error here
      // means the shutdown is in progress — treat as success.
      const status = err?.response?.status
      if (status === 400 || status === 501) {
        showMsg('error', err.response?.data?.detail ?? 'Shutdown rejected')
        setShuttingDown(false)
        return
      }
    }
    setShowShutdownModal(false)
  }

  const saveTimezone = async () => {
    setTzSaving(true)
    try {
      const res = await axios.post('/api/settings/timezone', { timezone })
      setTimezone(res.data.timezone)
      setTimezoneOriginal(res.data.timezone)
      showMsg('success', 'Timezone saved — restart the scheduler for changes to take effect')
    } catch (err) {
      showMsg('error', err.response?.data?.detail ?? err.message)
    } finally {
      setTzSaving(false)
    }
  }

  const restartScheduler = async () => {
    setRestarting(true)
    setRestartResult(null)
    try {
      const res = await axios.post('/api/restart-scheduler')
      setRestartResult({ ok: true, text: `Scheduler restarted (PID ${res.data.pid})` })
    } catch (err) {
      setRestartResult({ ok: false, text: err.response?.data?.detail ?? 'Restart failed — check logs' })
    } finally {
      setRestarting(false)
    }
  }

  const openModal = async () => {
    setShowModal(true)
    setConfirm('')
    if (settings.trading_mode !== 'live') {
      setLiveReady(null)
      setLiveMissing([])
      setAccountMasked('')
      setLiveChecking(true)
      try {
        const res = await axios.get('/api/live-ready')
        setLiveReady(res.data.ready)
        setLiveMissing(res.data.missing)
        setAccountMasked(res.data.account_masked)
      } catch {
        setLiveReady(false)
        setLiveMissing(['Error checking live credentials — is the API running?'])
      } finally {
        setLiveChecking(false)
      }
    }
  }

  const switchMode = async () => {
    if (confirm !== 'CONFIRM') return
    const target = settings.trading_mode === 'live' ? 'paper' : 'live'
    setSwitching(true)
    try {
      await axios.post('/api/trading-mode', { mode: target, confirmation: 'CONFIRM' })
      setSettings(prev => ({ ...prev, trading_mode: target, ibkr_port: target === 'live' ? 4001 : 4002 }))
      setOriginal(prev => ({ ...prev, trading_mode: target }))
      setShowModal(false)
      setConfirm('')
      showMsg('success', `Switched to ${target.toUpperCase()} mode`)
    } catch (err) {
      showMsg('error', err.response?.data?.detail ?? err.message)
    } finally {
      setSwitching(false)
    }
  }

  const isDirty = JSON.stringify(settings) !== JSON.stringify(original)

  if (!settings) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  )

  const isLive = settings.trading_mode === 'live'

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Settings</h1>
          <div className="text-gray-500 text-sm">Hot-reloads on every API call — no restart needed</div>
        </div>
        <button
          onClick={save}
          disabled={saving || !isDirty}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Save size={14} />
          {saving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>

      {/* Toast message */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          msg.type === 'success'
            ? 'bg-green-900/30 border border-green-800 text-green-400'
            : 'bg-red-900/30 border border-red-800 text-red-400'
        }`}>
          {msg.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
          {msg.text}
        </div>
      )}

      {/* Fund Settings */}
      <Section title="Fund Settings" emoji="💰">
        <SliderRow label="Fund Budget"  value={settings.fund_budget}      min={10000}  max={2000000} step={10000} format={v => `$${v.toLocaleString()}`} onChange={v => set('fund_budget', v)} />
        <SliderRow label="# Positions"  value={settings.num_positions}    min={1}      max={10}                  format={v => `${v} positions`}           onChange={v => set('num_positions', v)} />
        <SliderRow label="Min Position" value={settings.min_position_size} min={5000}  max={100000}  step={5000}  format={v => `$${v.toLocaleString()}`} onChange={v => set('min_position_size', v)} />
        <SliderRow label="Max Position" value={settings.max_position_size} min={10000} max={200000}  step={5000}  format={v => `$${v.toLocaleString()}`} onChange={v => set('max_position_size', v)} />
      </Section>

      {/* Screener Filters */}
      <Section title="Screener Filters" emoji="📐">
        <SliderRow label="Max Delta"      value={settings.max_delta}            min={0.10} max={0.30} step={0.01} format={v => v.toFixed(2)}                onChange={v => set('max_delta', v)} />
        <SliderRow label="Min Buffer %"   value={settings.min_buffer_pct}       min={0.03} max={0.20} step={0.01} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => set('min_buffer_pct', v)} />
        <SliderRow label="Earnings Filter" value={settings.earnings_filter_days} min={0}    max={30}              format={v => `${v} days`}                  onChange={v => set('earnings_filter_days', v)} />
        <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
          <Toggle
            label="Ignore Earnings Filter for Wheel CCs"
            sub="Allow covered calls on held positions even if earnings fall within the filter window. The screener's other criteria (delta, buffer, IV) still apply. Has no effect on new CSP entries."
            checked={!!settings.wheel_cc_ignore_earnings_filter}
            onChange={v => set('wheel_cc_ignore_earnings_filter', v)}
          />
        </div>
      </Section>

      {/* Liquidity Filters */}
      <Section title="Liquidity Filters" emoji="💧">
        <SliderRow
          label="Max Spread %"
          value={settings.max_spread_pct ?? 0.20}
          min={0.05} max={0.50} step={0.05}
          format={v => `${(v * 100).toFixed(0)}%`}
          onChange={v => set('max_spread_pct', v)}
          description="Skip if bid/ask spread exceeds this % of mid price"
        />
        <SliderRow
          label="Min Bid Yield %"
          value={settings.min_bid_yield_pct ?? 0.01}
          min={0.005} max={0.03} step={0.0025}
          format={v => `${(v * 100).toFixed(2)}%`}
          onChange={v => set('min_bid_yield_pct', v)}
          description="Override spread filter if bid yield meets this threshold"
        />
        <SliderRow
          label="Max Spread Hard Cap %"
          value={settings.max_spread_hard_cap ?? 0.50}
          min={0.25} max={1.00} step={0.05}
          format={v => `${(v * 100).toFixed(0)}%`}
          onChange={v => set('max_spread_hard_cap', v)}
          description="Always skip regardless of yield if spread exceeds this %"
        />
      </Section>

      {/* Execution */}
      <Section title="Execution" emoji="⚙️">
        {/* Monday execution time */}
        <div>
          <div className="text-gray-700 dark:text-gray-300 text-sm mb-2">⏰ Monday Execution Time (PST)</div>
          <select
            value={isPreset(settings.execution_time) ? settings.execution_time : 'custom'}
            onChange={e => {
              if (e.target.value !== 'custom') set('execution_time', e.target.value)
              // switching to custom: keep current value in the text input below
            }}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            {PRESET_TIMES.map(({ value, et, note }) => (
              <option key={value} value={value}>
                {value} PST ({et}){note ? ` — ${note}` : ''}
              </option>
            ))}
            <option value="custom">Custom (HH:MM PST)</option>
          </select>

          {!isPreset(settings.execution_time) && (
            <input
              type="text"
              placeholder="HH:MM (24-hr PST, e.g. 09:30)"
              value={settings.execution_time ?? ''}
              onChange={e => set('execution_time', e.target.value)}
              className="mt-2 w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          )}

          {settings.execution_time && (
            <div className="mt-1.5 text-blue-500 dark:text-blue-400 text-xs font-medium">
              {fmtExecTime(settings.execution_time)}
            </div>
          )}

          <div className="mt-2 text-xs text-gray-500 dark:text-gray-600 leading-relaxed">
            Earlier = less liquidity and wider spreads.
            10:00 AM PST (1:00 PM ET) recommended for best fill prices.
          </div>
          {settings.execution_time !== original?.execution_time && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <span className="text-xs text-amber-600 dark:text-amber-500">
                ⚠ Save + restart scheduler for new time to take effect.
              </span>
              <button
                onClick={restartScheduler}
                disabled={restarting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-600 text-amber-600 dark:text-amber-500 dark:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-60 disabled:cursor-wait transition-colors"
              >
                <RefreshCw size={11} className={restarting ? 'animate-spin' : ''} />
                {restarting ? 'Restarting…' : 'Restart Scheduler'}
              </button>
            </div>
          )}
          {restartResult && (
            <div className={`mt-1.5 text-xs font-medium ${restartResult.ok ? 'text-green-500' : 'text-red-400'}`}>
              {restartResult.ok ? '✅' : '❌'} {restartResult.text}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
          <Toggle label="Dry Run" sub="Simulate orders — no real trades placed" checked={settings.dry_run} onChange={v => set('dry_run', v)} />
        </div>
      </Section>

      {/* Timezone */}
      <Section title="Timezone" emoji="🌐">
        <div>
          <div className="text-gray-700 dark:text-gray-300 text-sm mb-2">Scheduler timezone</div>
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            {TIMEZONES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <div className="mt-2 text-xs text-gray-500 dark:text-gray-600 leading-relaxed">
            Cron jobs (Monday execution, weekly preview, daily monitor) fire at the local wall-clock time in this zone.
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={saveTimezone}
              disabled={tzSaving || timezone === timezoneOriginal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={11} />
              {tzSaving ? 'Saving…' : 'Save Timezone'}
            </button>
            {timezone !== timezoneOriginal && (
              <span className="text-xs text-amber-600 dark:text-amber-500">
                ⚠ Save and then restart scheduler for change to take effect.
              </span>
            )}
            <button
              onClick={restartScheduler}
              disabled={restarting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-600 text-amber-600 dark:text-amber-500 dark:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-60 disabled:cursor-wait transition-colors"
            >
              <RefreshCw size={11} className={restarting ? 'animate-spin' : ''} />
              {restarting ? 'Restarting…' : 'Restart Scheduler'}
            </button>
          </div>
        </div>
      </Section>

      {/* Appearance */}
      <Section title="Appearance" emoji="🎨">
        <div>
          <div className="text-gray-700 dark:text-gray-300 text-sm mb-3">Theme</div>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  theme === value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Trading Mode — prominent */}
      <div className={`border-2 rounded-xl p-5 space-y-4 ${
        isLive ? 'border-red-700 bg-red-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
      }`}>
        <div className="text-gray-900 dark:text-white font-semibold text-sm flex items-center gap-2">
          <span>🔄</span> Trading Mode
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-sm mb-1">Current mode</div>
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold border ${
              isLive
                ? 'bg-red-900/50 text-red-400 border-red-700'
                : 'bg-blue-900/40 text-blue-400 border-blue-800'
            }`}>
              {isLive ? '🔴 LIVE TRADING' : '📄 PAPER TRADING'}
            </span>
            <div className="text-gray-500 dark:text-gray-600 text-xs mt-2">
              IBKR port: {settings.ibkr_port} ({isLive ? '4001 = live' : '4002 = paper'})
            </div>
          </div>
          <button
            onClick={openModal}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              isLive
                ? 'border-blue-700 text-blue-400 hover:bg-blue-900/30'
                : 'border-red-700 text-red-400 hover:bg-red-900/30'
            }`}
          >
            Switch to {isLive ? 'Paper' : 'Live'}
          </button>
        </div>

        {isLive && (
          <div className="flex items-center gap-2 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <span className="text-red-400 text-xs">
              Live mode active — all trades use real money
            </span>
          </div>
        )}
      </div>

      {/* Notifications */}
      <Section title="Notifications" emoji="🔔">
        <Toggle
          label="Discord Webhook"
          sub="Post trade results and alerts to Discord"
          checked={settings.discord_webhook_enabled}
          onChange={v => set('discord_webhook_enabled', v)}
        />
        <button
          onClick={testDiscord}
          disabled={testing}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 px-3 py-2 rounded-lg transition-colors w-full"
        >
          <Send size={13} />
          {testing ? 'Sending...' : 'Send test notification'}
        </button>
      </Section>

      {/* Shutdown */}
      <Section title="Shutdown" emoji="⛔">
        <div className="space-y-3">
          <div className="text-xs text-gray-500 dark:text-gray-600 leading-relaxed">
            Stop all YRVI containers (scheduler, web, IB Gateway, secrets, api). The api shuts itself down last — this page will become unreachable.
          </div>
          <button
            onClick={() => setShowShutdownModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Power size={14} />
            Shut Down YRVI
          </button>
        </div>
      </Section>

      {/* Shutdown Modal */}
      {showShutdownModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && !shuttingDown && setShowShutdownModal(false)}
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Power size={22} className="text-red-400" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Shut Down YRVI</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-5">
              This will stop all YRVI containers. To restart, click the YRVI icon on your desktop.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowShutdownModal(false)}
                disabled={shuttingDown}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmShutdown}
                disabled={shuttingDown}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {shuttingDown ? 'Shutting down…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trading Mode Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl">

            {/* ── Switch to Live ── */}
            {!isLive ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle size={22} className="text-red-400" />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Switch to Live Trading</h3>
                </div>

                {liveChecking && (
                  <div className="flex items-center gap-3 text-gray-500 text-sm py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 shrink-0" />
                    Checking live credentials…
                  </div>
                )}

                {!liveChecking && liveReady === false && (
                  <>
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-5">
                      <div className="text-red-400 font-medium text-sm mb-2">
                        ⚠️ Live credentials not configured
                      </div>
                      <div className="text-red-300 text-sm mb-3">
                        Add these to your .env file before switching:
                      </div>
                      <ul className="space-y-1 mb-3">
                        {liveMissing.map(v => (
                          <li key={v} className="text-red-300 text-sm font-mono">• {v}</li>
                        ))}
                      </ul>
                      <div className="text-red-400 text-xs">Then restart YRVI and try again.</div>
                    </div>
                    <button
                      onClick={() => setShowModal(false)}
                      className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Close
                    </button>
                  </>
                )}

                {!liveChecking && liveReady === true && (
                  <>
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-5">
                      <div className="text-red-400 font-medium text-sm mb-1">⚠️ Switching to LIVE trading</div>
                      <div className="text-red-300 text-sm">
                        Account: <span className="font-mono font-bold">{accountMasked}</span>
                        <br />Real money will be used!
                      </div>
                    </div>
                    <div className="mb-5">
                      <label className="text-gray-600 dark:text-gray-400 text-sm block mb-2">
                        Type <code className="text-yellow-500 dark:text-yellow-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">CONFIRM</code> to proceed:
                      </label>
                      <input
                        autoFocus
                        type="text"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && confirm === 'CONFIRM' && switchMode()}
                        placeholder="CONFIRM"
                        className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowModal(false); setConfirm('') }}
                        className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={switchMode}
                        disabled={confirm !== 'CONFIRM' || switching}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {switching ? 'Switching…' : 'Switch to Live'}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              /* ── Switch back to Paper ── */
              <>
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle size={22} className="text-yellow-400" />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Switch to Paper Trading</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-5">
                  This will switch back to IBKR port 4002 (paper gateway). No real trades will be placed.
                </p>
                <div className="mb-5">
                  <label className="text-gray-600 dark:text-gray-400 text-sm block mb-2">
                    Type <code className="text-yellow-500 dark:text-yellow-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">CONFIRM</code> to proceed:
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirm === 'CONFIRM' && switchMode()}
                    placeholder="CONFIRM"
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowModal(false); setConfirm('') }}
                    className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={switchMode}
                    disabled={confirm !== 'CONFIRM' || switching}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {switching ? 'Switching…' : 'Switch to Paper'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
