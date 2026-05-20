import { useState } from 'react'
import axios from 'axios'
import { Activity, BookOpen, MessageSquare, CheckCircle, AlertTriangle, XCircle, RefreshCw, ExternalLink } from 'lucide-react'

// Set this to your YRVI bug/feature Discord channel invite link
const DISCORD_COMMUNITY_URL = 'https://discord.gg/PLACEHOLDER'

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
  const [running, setRunning]   = useState(false)
  const [results, setResults]   = useState(null)
  const [error, setError]       = useState(null)

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
          Found something broken or have an idea? Post in the YRVI Discord channel.
          Include what you were doing, what you expected, and what happened instead.
          Screenshots of the dashboard or log output are especially helpful.
        </div>
        <a
          href={DISCORD_COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <MessageSquare size={13} />
          Open Discord
        </a>
      </Section>
    </div>
  )
}
