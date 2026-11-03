import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Dropdown from './Dropdown'
import './StudyStudio.css'

type QuestionType = 'multiple-choice' | 'true-false' | 'identification' | 'enumeration' | 'situational' | 'essay'
type StudyCard = { id: number; deck_id: number; front: string; back: string }
type Deck = { id: number; title: string; topic: string; card_count: number }
type Question = { prompt: string; options?: string[]; answer: string | string[]; explanation: string; concept: string }
type Grade = { score: number; correct: boolean; feedback: string }
type QuizAttempt = { id: number; topic: string; question_type: QuestionType; difficulty: string; question_count: number; score: number; total: number; answers: string[]; results: Grade[]; questions: Question[]; duration_seconds: number; created_at: string }
type Quiz = { topic: string; questionType: QuestionType; difficulty: string; questions: Question[] }

const questionTypes: { id: QuestionType; label: string }[] = [
  { id: 'multiple-choice', label: 'Multiple choice' },
  { id: 'true-false', label: 'True or false' },
  { id: 'identification', label: 'Identification' },
  { id: 'enumeration', label: 'Enumeration' },
  { id: 'situational', label: 'Situational' },
  { id: 'essay', label: 'Essay' },
]

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export default function StudyStudio() {
  const [tab, setTab] = useState<'tools' | 'flashcards' | 'quizzes'>('tools')
  const [source, setSource] = useState('')
  const [question, setQuestion] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [decks, setDecks] = useState<Deck[]>([])
  const [selectedDeck, setSelectedDeck] = useState<number | null>(null)
  const [cards, setCards] = useState<StudyCard[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [newDeckTitle, setNewDeckTitle] = useState('')
  const [manualFront, setManualFront] = useState('')
  const [manualBack, setManualBack] = useState('')
  const [flashcardCount, setFlashcardCount] = useState(10)
  const [quizType, setQuizType] = useState<QuestionType>('multiple-choice')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [questionCount, setQuestionCount] = useState(10)
  const [timed, setTimed] = useState(false)
  const [timeLimit, setTimeLimit] = useState(20)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [grade, setGrade] = useState<Grade[] | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [quizStartedAt, setQuizStartedAt] = useState<number | null>(null)
  const [history, setHistory] = useState<QuizAttempt[]>([])

  const selectedCard = cards[cardIndex]
  const historyAverage = history.length ? Math.round(history.reduce((sum, item) => sum + (item.score / Math.max(item.total, 1)) * 100, 0) / history.length) : 0
  const weakTopics = useMemo(() => {
    const missed = new Map<string, number>()
    history.forEach((attempt) => attempt.questions.forEach((item, index) => {
      const wasCorrect = attempt.results?.[index]?.correct ?? attempt.answers[index]?.trim().toLowerCase() === String(item.answer).trim().toLowerCase()
      if (!wasCorrect) missed.set(item.concept || attempt.topic || 'Review', (missed.get(item.concept || attempt.topic || 'Review') || 0) + 1)
    }))
    return [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [history])

  const refreshDecks = useCallback(async () => {
    const data = await api<Deck[]>('/api/study/decks')
    setDecks(data)
    setSelectedDeck((current) => current && data.some((item) => item.id === current) ? current : data[0]?.id ?? null)
  }, [])

  const refreshHistory = useCallback(async () => setHistory(await api<QuizAttempt[]>('/api/study/quizzes')), [])

  useEffect(() => {
    void refreshDecks().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load flashcards'))
    void refreshHistory().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load quiz history'))
  }, [refreshDecks, refreshHistory])

  useEffect(() => {
    if (!selectedDeck) { setCards([]); return }
    void api<StudyCard[]>(`/api/study/decks/${selectedDeck}/cards`).then((data) => { setCards(data); setCardIndex(0); setCardFlipped(false) }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load cards'))
  }, [selectedDeck])

  const generateStudyMaterial = async (event: FormEvent<HTMLFormElement>, kind: 'all' | 'source-answer') => {
    event.preventDefault()
    setBusy(true); setError(''); setOutput('')
    try {
      const result = await api<{ result: string }>('/api/study/generate', { method: 'POST', body: JSON.stringify({ kind, content: source, question: kind === 'source-answer' ? question : '' }) })
      setOutput(result.result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate study material') }
    finally { setBusy(false) }
  }

  const generateFlashcards = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await api<{ id: number; cards: StudyCard[] }>('/api/study/flashcards/generate', { method: 'POST', body: JSON.stringify({ content: source, count: flashcardCount }) })
      await refreshDecks(); setSelectedDeck(result.id); setCards(result.cards); setCardIndex(0); setTab('flashcards')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate flashcards') }
    finally { setBusy(false) }
  }

  const createManualDeck = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api<Deck>('/api/study/decks', { method: 'POST', body: JSON.stringify({ title: newDeckTitle, topic: newDeckTitle, cards: [] }) })
      setNewDeckTitle(''); await refreshDecks(); setSelectedDeck(result.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create deck') }
    finally { setBusy(false) }
  }

  const addManualCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedDeck) return
    setBusy(true); setError('')
    try {
      const card = await api<StudyCard>(`/api/study/decks/${selectedDeck}/cards`, { method: 'POST', body: JSON.stringify({ front: manualFront, back: manualBack }) })
      setCards((current) => [...current, card]); setManualFront(''); setManualBack(''); await refreshDecks()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add card') }
    finally { setBusy(false) }
  }

  const startQuiz = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setGrade(null); setQuiz(null)
    try {
      const generated = await api<Quiz>('/api/study/quizzes/generate', { method: 'POST', body: JSON.stringify({ content: source, questionType: quizType, difficulty, count: questionCount }) })
      setQuiz(generated); setAnswers(generated.questions.map(() => '')); setSecondsLeft(timed ? timeLimit * 60 : 0); setQuizStartedAt(Date.now()); setTab('quizzes')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create quiz') }
    finally { setBusy(false) }
  }

  const submitQuiz = useCallback(async () => {
    if (!quiz || grade || busy) return
    setBusy(true); setError('')
    try {
      const graded = await api<{ results: Grade[] }>('/api/study/quizzes/grade', { method: 'POST', body: JSON.stringify({ questions: quiz.questions, answers }) })
      const percentage = Math.round(graded.results.reduce((sum, item) => sum + item.score, 0) / Math.max(graded.results.length, 1))
      const elapsed = quizStartedAt ? Math.max(0, Math.round((Date.now() - quizStartedAt) / 1000)) : 0
      const saved = await api<QuizAttempt>('/api/study/quizzes/attempts', { method: 'POST', body: JSON.stringify({ topic: quiz.topic, questionType: quiz.questionType, difficulty: quiz.difficulty, questions: quiz.questions, answers, results: graded.results, score: percentage, durationSeconds: elapsed }) })
      setGrade(graded.results); await refreshHistory();
      if (!saved.id) setError('Quiz scored, but the attempt could not be saved.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not score quiz') }
    finally { setBusy(false) }
  }, [answers, busy, grade, quiz, quizStartedAt, refreshHistory])

  useEffect(() => {
    if (!quiz || grade || !timed || secondsLeft <= 0) return
    const timer = window.setInterval(() => setSecondsLeft((value) => value <= 1 ? 0 : value - 1), 1000)
    return () => window.clearInterval(timer)
  }, [grade, quiz, secondsLeft, timed])

  useEffect(() => {
    if (quiz && timed && secondsLeft === 0 && !grade && !busy) void submitQuiz()
  }, [busy, grade, quiz, secondsLeft, submitQuiz, timed])

  const displayAnswer = (index: number, value: string) => setAnswers((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))
  const timerLabel = `${Math.floor(secondsLeft / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`

  return <section className="page-view study-studio">
    <div className="page-heading"><div><p className="eyebrow">LEARNING LAB</p><h1>Study studio</h1><p className="intro">Turn your notes and readings into clear explanations, study materials, flashcards, and practice exams.</p></div></div>
    <div className="study-tabs" role="tablist" aria-label="Study studio tools">
      {([['tools', 'Study tools'], ['flashcards', `Flashcards · ${decks.length}`], ['quizzes', `Quizzes · ${history.length}`]] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {error && <div className="study-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}

    {tab === 'tools' && <>
      <div className="study-capabilities"><strong>Use your material for</strong><span>plain-language explanations</span><span>academic writing</span><span>chapter summaries</span><span>key concepts</span><span>definitions</span><span>study guides</span><span>exam reviewers</span></div>
      <form className="study-panel study-source-form" onSubmit={(event) => generateStudyMaterial(event, 'all')}>
        <div className="study-panel-heading"><div><p className="eyebrow">STUDY PACK</p><h2>Bring your material</h2><p className="study-panel-note">Generate one organized study pack covering all of these uses.</p></div></div>
        <label>Chapter, notes, or reading<textarea className="study-textarea" rows={8} value={source} onChange={(event) => setSource(event.target.value)} required placeholder="Paste your text here to create a complete study pack." /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Working…' : 'Generate study pack'}</button>
      </form>
      {output && <article className="study-panel study-output"><p className="eyebrow">RESULT</p><div>{output}</div></article>}
      <form className="study-panel study-source-form study-source-answer-form" onSubmit={(event) => generateStudyMaterial(event, 'source-answer')}>
        <div className="study-panel-heading"><div><p className="eyebrow">SOURCE-BACKED ANSWER</p><h2>Ask your sources</h2><p className="study-panel-note">Answer a specific question using only labeled source material.</p></div></div>
        <label>Your question<input className="modal-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What do these sources say about...?" required /></label>
        <label>Sources (label each source)<textarea className="study-textarea" rows={6} value={source} onChange={(event) => setSource(event.target.value)} required placeholder="Paste your sources here and label them [Source 1], [Source 2], and so on." /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Working…' : 'Generate source-backed answer'}</button>
      </form>
      <form className="study-panel study-inline-form" onSubmit={generateFlashcards}><div><p className="eyebrow">ACTIVE RECALL</p><h2>Generate flashcards from this material</h2><p>Cards are automatically grouped into a named deck by topic.</p></div><label>Number of cards<input className="modal-input" type="number" min={2} max={30} value={flashcardCount} onChange={(event) => setFlashcardCount(Number(event.target.value))} /></label><button className="secondary-button" disabled={busy || !source.trim()}>{busy ? 'Generating…' : 'Create flashcards'}</button></form>
    </>}

    {tab === 'flashcards' && <div className="study-two-column">
      <div className="study-panel"><div className="study-panel-heading"><div><p className="eyebrow">YOUR LIBRARY</p><h2>Flashcard decks</h2></div></div>
        {decks.length ? <div className="study-deck-list">{decks.map((deck) => <button key={deck.id} className={selectedDeck === deck.id ? 'selected' : ''} onClick={() => setSelectedDeck(deck.id)}><strong>{deck.title}</strong><span>{deck.topic || 'General'} · {deck.card_count} cards</span></button>)}</div> : <p className="empty-state">No decks yet. Generate cards from the Study tools tab or create a deck below.</p>}
        <form className="study-manual-deck" onSubmit={createManualDeck}><label>New manual deck<input className="modal-input" required value={newDeckTitle} onChange={(event) => setNewDeckTitle(event.target.value)} placeholder="e.g. Political theory" /></label><button className="secondary-button" disabled={busy}>Create deck</button></form>
      </div>
      <div className="study-panel study-card-workspace"><div className="study-panel-heading"><div><p className="eyebrow">PRACTICE</p><h2>{selectedCard ? `Card ${cardIndex + 1} of ${cards.length}` : 'Your cards'}</h2></div></div>
        {selectedCard ? <><button className="study-flashcard" onClick={() => setCardFlipped((value) => !value)} aria-label="Flip flashcard"><span>{cardFlipped ? 'ANSWER' : 'QUESTION'}</span><strong>{cardFlipped ? selectedCard.back : selectedCard.front}</strong><small>Click to flip</small></button><div className="study-card-navigation"><button className="secondary-button" onClick={() => { setCardIndex((index) => (index - 1 + cards.length) % cards.length); setCardFlipped(false) }}>Previous</button><button className="secondary-button" onClick={() => { setCardIndex((index) => (index + 1) % cards.length); setCardFlipped(false) }}>Next</button></div></> : <p className="empty-state">Select a deck or create a card to start studying.</p>}
        {selectedDeck && <form className="study-manual-card" onSubmit={addManualCard}><h3>Add a card</h3><label>Front<input className="modal-input" required value={manualFront} onChange={(event) => setManualFront(event.target.value)} placeholder="Question or term" /></label><label>Back<textarea className="modal-input" required rows={3} value={manualBack} onChange={(event) => setManualBack(event.target.value)} placeholder="Answer or definition" /></label><button className="secondary-button" disabled={busy}>Save card</button></form>}
      </div>
    </div>}

    {tab === 'quizzes' && <>
      {!quiz && <div className="study-two-column study-quiz-layout"><form className="study-panel study-quiz-form" onSubmit={startQuiz}><p className="eyebrow">PRACTICE EXAM</p><h2>Build a quiz</h2><label>Study material<textarea className="study-textarea" required rows={7} value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste course notes, a chapter, or a study guide." /></label><div className="study-form-grid"><label>Question format<Dropdown className="modal-input" ariaLabel="Question format" value={quizType} onChange={(value) => setQuizType(value as QuestionType)} options={questionTypes.map((item) => ({ value: item.id, label: item.label }))} /></label><label>Difficulty<Dropdown className="modal-input" ariaLabel="Difficulty" value={difficulty} onChange={setDifficulty} options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} /></label><label>Number of questions<input className="modal-input" type="number" min={1} max={30} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label><label className="study-timed-label"><span>Timed exam</span><input type="checkbox" checked={timed} onChange={(event) => setTimed(event.target.checked)} /></label>{timed && <label>Time limit (minutes)<input className="modal-input" type="number" min={1} max={180} value={timeLimit} onChange={(event) => setTimeLimit(Number(event.target.value))} /></label>}</div><button className="primary-button" disabled={busy}>{busy ? 'Preparing exam…' : 'Generate quiz'}</button></form>
        <div className="study-panel study-analytics"><p className="eyebrow">YOUR PROGRESS</p><h2>Quiz analytics</h2><div className="study-analytics-number">{history.length ? `${historyAverage}%` : '—'}<span>average score</span></div><p>{history.length} completed attempt{history.length === 1 ? '' : 's'}</p><h3>Topics to revisit</h3>{weakTopics.length ? weakTopics.map(([name, count]) => <div className="study-weak-topic" key={name}><span>{name}</span><b>{count} missed</b></div>) : <p className="empty-state">Missed concepts will appear here after you complete quizzes.</p>}</div></div>}
      {quiz && <form className="study-panel study-live-quiz" onSubmit={(event) => { event.preventDefault(); void submitQuiz() }}><div className="study-live-head"><div><p className="eyebrow">{quiz.difficulty.toUpperCase()} · {questionTypes.find((item) => item.id === quiz.questionType)?.label.toUpperCase()}</p><h2>{quiz.topic || 'Practice quiz'}</h2><span>{quiz.questions.length} questions</span></div>{timed && !grade && <div className={secondsLeft < 60 ? 'study-countdown urgent' : 'study-countdown'}>{timerLabel}</div>}</div>
        {quiz.questions.map((item, index) => <article className="study-question" key={`${item.concept}-${index}`}><p className="study-question-kicker">QUESTION {index + 1} · {item.concept}</p><h3>{item.prompt}</h3>{item.options?.length ? <div className="study-answer-options">{item.options.map((option) => <label key={option} className={grade && String(item.answer).toLowerCase() === option.toLowerCase() ? 'answer-correct' : ''}><input type="radio" name={`question-${index}`} value={option} checked={answers[index] === option} disabled={Boolean(grade)} onChange={() => displayAnswer(index, option)} />{option}</label>)}</div> : <textarea className="study-textarea" rows={quiz.questionType === 'essay' ? 5 : 2} value={answers[index] || ''} disabled={Boolean(grade)} onChange={(event) => displayAnswer(index, event.target.value)} placeholder="Write your answer" />}
          {grade && <div className={grade[index]?.correct ? 'study-feedback good' : 'study-feedback'}><strong>{grade[index]?.correct ? 'Correct' : `Review · ${grade[index]?.score ?? 0}%`}</strong><p>{grade[index]?.feedback}</p><p><b>Expected answer:</b> {Array.isArray(item.answer) ? item.answer.join('; ') : item.answer}</p><p><b>Explanation:</b> {item.explanation}</p></div>}</article>)}
        {!grade ? <div className="study-quiz-actions"><button className="secondary-button" type="button" onClick={() => { setQuiz(null); setGrade(null) }}>Exit quiz</button><button className="primary-button" disabled={busy}>{busy ? 'Scoring…' : 'Submit answers'}</button></div> : <div className="study-quiz-actions"><strong>Your score: {Math.round(grade.reduce((sum, item) => sum + item.score, 0) / grade.length)}%</strong><button className="primary-button" type="button" onClick={() => { setQuiz(null); setGrade(null); setAnswers([]) }}>Finish review</button></div>}</form>}
      <div className="study-panel study-history"><div className="study-panel-heading"><div><p className="eyebrow">PAST ATTEMPTS</p><h2>Quiz history</h2></div></div>{history.length ? <div className="study-history-list">{history.map((item) => <article key={item.id}><div><strong>{item.topic || 'Practice quiz'}</strong><span>{questionTypes.find((type) => type.id === item.question_type)?.label || item.question_type} · {item.difficulty} · {item.question_count} questions</span></div><b>{item.score}%</b><time>{new Date(item.created_at).toLocaleDateString()}</time></article>)}</div> : <p className="empty-state">Completed quizzes will be saved here.</p>}</div>
    </>}
    <p className="study-disclaimer">AI-generated materials can contain errors. Check important details against your course readings.</p>
  </section>
}
