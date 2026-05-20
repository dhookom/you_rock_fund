import { useState } from 'react'
import axios from 'axios'
import { Activity, BookOpen, MessageSquare, CheckCircle, AlertTriangle, XCircle, RefreshCw, ExternalLink, Send } from 'lucide-react'

const FAQ_URL = 'https://github.com/controllinghand/you_rock_fund/blob/main/FAQ.md'

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
      <div className="text-gray-900 dark:text-white font-semibold text-sm flex items-center gap-2">
        <Icon size={15} className="text-blue-500" />
        {title}
      </div>
      {children}
    </div>
  )
}

function StatusIcon({ status }) {
  if (status === 'ok')   return <CheckCircle  size={15} className="text-green-500 shrink-0" />
  if (status === 'warn') return <AlertTriangle size={15} className="text-amber-500 shrink-0" />
  if (status === 'error') return <XCircle     size={15} className="text-red-500  shrink-0" />
  return <div className="w-[15px] h-[15px] rounded-full bg-blue-400 shrink-0" />
}

function OverallBadge({ overall }) {
  const styles = {
    ok:    'bg-green-900/30 border-green-800 text-green-400',
    warn:  'bg-amber-900/30 border-amber-800 text-amber-400',
    error: 'bg-red-900/30 border-red-800 text-red-400',
  }
  const labels = { ok: 'All systems go', warn: 'Needs attention', error: 'Action required' }
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${styles[overall] ?? styles.ok}`}>
      <StatusIcon status={overall} />
      {labels[overall] ?? overall}
    </div>
  )
}

export default function Help() {
  const [running, setRunning]     = useState(false)
  const [results, setResults]     = useState(null)
  const [error, setError]         = useState(null)

  const [fbType, setFbType]       = useState('bug')
  const [fbMessage, setFbMessage] = useState('')
  const [fbSending, setFbSending] = useState(false)
  const [fbResult, setFbResult]   = useState(null)  // {ok, text}

  const submitFeedback = async () => {
    if (!fbMessage.trim()) return
    setFbSending(true)
    setFbResult(null)
    try {
      await axios.post('/api/feedback', { type: fbType, message: fbMessage.trim() })
      setFbResult({ ok: true, text: 'Sent — thanks for the feedback!' })
      setFbMessage('')
    } catch (err) {
      setFbResult({ ok: false, text: err.response?.data?.detail ?? 'Failed to send — try again' })
    } finally {
      setFbSending(false)
    }
  }

  const runDiag = async () => {
    setRunning(true)
    setResults(null)
    setError(null)
    try {
      const res = await axios.get('/api/diag')
      setResults(res.data)
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Request failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Help</h1>
        <div className="text-gray-500 text-sm">Diagnostics, documentation, and support</div>
      </div>

      {/* ── System Diagnostics ──────────────────────────────── */}
      <Section icon={Activity} title="System Diagnostics">
        <div className="text-xs text-gray-500 dark:text-gray-600 leading-relaxed">
          Checks scheduler health, IB Gateway connectivity, last run times, and market status.
          No trades are placed — read-only.
        </div>

        <button
          onClick={runDiag}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-wait text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
          {running ? 'Running…' : results ? 'Run Again' : 'Run Diagnostics'}
        </button>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg">
            <XCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {results && (
          <div className="space-y-3">
            <OverallBadge overall={results.overall} />

            <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              {results.checks.map((c) => (
                <div key={c.name} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900">
                  <StatusIcon status={c.status} />
                  <div className="min-w-[130px] text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                    {c.name}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-500">
                    {c.detail}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs text-gray-400 dark:text-gray-600">
              Run at {new Date(results.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}
      </Section>

      {/* ── FAQ & Troubleshooting ────────────────────────────── */}
      <Section icon={BookOpen} title="FAQ & Troubleshooting">
        <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Step-by-step answers for common setup issues — Docker failures, IB Gateway
          dialogs, market data errors, order fills, and more.
        </div>
        <a
          href={FAQ_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium rounded-lg transition-colors"
        >
          <ExternalLink size={13} />
          View FAQ on GitHub
        </a>
      </Section>

      {/* ── Report a Bug / Feature Request ──────────────────── */}
      <Section icon={MessageSquare} title="Report a Bug or Request a Feature">
        <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Describe what happened or what you'd like to see — this goes straight to the
          YRVI team on Discord. No account needed.
        </div>

        <div className="space-y-3">
          {/* Type selector */}
          <div className="flex gap-2">
            {[
              { value: 'bug',     label: '🐛 Bug Report' },
              { value: 'feature', label: '💡 Feature Request' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFbType(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  fbType === value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Message */}
          <textarea
            rows={4}
            placeholder={fbType === 'bug'
              ? 'What happened? What did you expect? Which page or feature?'
              : 'What would you like to see? What problem would it solve?'}
            value={fbMessage}
            onChange={e => { setFbMessage(e.target.value); setFbResult(null) }}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
          />

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button
              onClick={submitFeedback}
              disabled={fbSending || !fbMessage.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Send size={13} />
              {fbSending ? 'Sending…' : 'Send'}
            </button>

            {fbResult && (
              <span className={`text-sm font-medium flex items-center gap-1.5 ${fbResult.ok ? 'text-green-500' : 'text-red-400'}`}>
                {fbResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {fbResult.text}
              </span>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}
