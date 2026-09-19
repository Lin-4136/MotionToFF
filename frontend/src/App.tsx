import { useCallback, useEffect, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type HealthState =
  | { status: 'loading' }
  | { status: 'ok' }
  | { status: 'error'; message: string }

type InterviewerLine = { role: string; text: string }

type RubricScores = {
  structure: number
  specificity: number
  confidence: number
  evidence: string[]
  red_flags: string[]
  overall: number
}

type DirectorDecision = {
  action: string
  rationale: string
  input_snapshot: Record<string, unknown>
}

type TurnResult = {
  scores: RubricScores
  decision: DirectorDecision
  next_question: InterviewerLine
}

type CompletedTurn = TurnResult & { answer: string; question: string }

function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' })
  const [currentQuestion, setCurrentQuestion] = useState<InterviewerLine | null>(
    null,
  )
  const [answer, setAnswer] = useState('')
  const [completedTurns, setCompletedTurns] = useState<CompletedTurn[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [turnError, setTurnError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const [healthRes, sessionRes] = await Promise.all([
          fetch(`${API_BASE}/health`),
          fetch(`${API_BASE}/session`),
        ])
        if (!healthRes.ok) {
          throw new Error(`Health HTTP ${healthRes.status}`)
        }
        const healthData: { ok?: boolean } = await healthRes.json()
        if (!healthData.ok) {
          throw new Error('Health check returned ok: false')
        }
        if (!sessionRes.ok) {
          throw new Error(`Session HTTP ${sessionRes.status}`)
        }
        const sessionData: { current_question: InterviewerLine } =
          await sessionRes.json()
        if (!cancelled) {
          setHealth({ status: 'ok' })
          setCurrentQuestion(sessionData.current_question)
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Unknown error'
          setHealth({ status: 'error', message })
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const submitAnswer = useCallback(async () => {
    const trimmed = answer.trim()
    if (!trimmed || !currentQuestion || submitting) {
      return
    }

    setSubmitting(true)
    setTurnError(null)

    try {
      const res = await fetch(`${API_BASE}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: trimmed }),
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(detail || `HTTP ${res.status}`)
      }
      const data: TurnResult = await res.json()
      setCompletedTurns((prev) => [
        ...prev,
        {
          ...data,
          answer: trimmed,
          question: currentQuestion.text,
        },
      ])
      setCurrentQuestion(data.next_question)
      setAnswer('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submit failed'
      setTurnError(message)
    } finally {
      setSubmitting(false)
    }
  }, [answer, currentQuestion, submitting])

  return (
    <main className="app">
      <header className="app-header">
        <h1>Practice Interview</h1>
        <p className="muted">
          <a href="/diag">Media diagnostic (/diag)</a>
          {' · '}
          <a href="/report">Session report (/report)</a>
        </p>
        {health.status === 'loading' && <p className="muted">Checking backend…</p>}
        {health.status === 'ok' && <p className="status-ok">backend ok</p>}
      {health.status === 'error' && (
        <p className="status-error">
          Backend unreachable: {health.message}
        </p>
      )}
      </header>

      {health.status === 'ok' && currentQuestion && (
        <section className="interview-panel">
          <h2>Interviewer</h2>
          <p className="interviewer-line">{currentQuestion.text}</p>

          <label className="answer-label" htmlFor="answer">
            Your answer
          </label>
          <textarea
            id="answer"
            className="answer-input"
            rows={5}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            disabled={submitting}
          />

          <button
            type="button"
            className="submit-btn"
            onClick={submitAnswer}
            disabled={submitting || !answer.trim()}
          >
            {submitting ? 'Scoring…' : 'Submit answer'}
          </button>

          {turnError && <p className="status-error">{turnError}</p>}
        </section>
      )}

      {completedTurns.length > 0 && (
        <section className="turn-history">
          <h2>Turn feedback</h2>
          <ul className="turn-list">
            {[...completedTurns].reverse().map((turn, index) => (
              <li key={`${turn.question}-${completedTurns.length - index}`}>
                <p className="turn-meta">
                  Turn {completedTurns.length - index} · decision:{' '}
                  <strong>{turn.decision.action}</strong>
                </p>
                <p className="turn-scores">
                  Scores — overall: {turn.scores.overall.toFixed(2)}, structure:{' '}
                  {turn.scores.structure.toFixed(2)}, specificity:{' '}
                  {turn.scores.specificity.toFixed(2)}, confidence:{' '}
                  {turn.scores.confidence.toFixed(2)}
                </p>
                <p className="turn-rationale">{turn.decision.rationale}</p>
                <p className="turn-next">
                  Next: {turn.next_question.text}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

export default App
