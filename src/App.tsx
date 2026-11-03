import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'
import PoliticalTools from './PoliticalTools'
import { JusticeScale01Icon } from './JusticeScale01Icon'
import ResearchAssistant from './ResearchAssistant'
import StudyStudio from './StudyStudio'
import Dropdown from './Dropdown'

type Theme = 'light' | 'dark'
type Widget = 'subjects' | 'deadlines' | 'activity' | 'goals' | 'stats'
type Modal = 'settings' | 'profile' | 'search' | 'notifications' | 'deadline' | 'assignment' | 'timer' | 'week' | 'courses' | 'activity' | 'subject' | 'workspace' | 'add-subject' | 'calendar-event' | 'routine' | 'delete-subject' | 'delete-entity' | null

type Subject = { id?: number; name: string; code: string; grade: string; progress: number; color: string; next: string }
type Deadline = { title: string; subject: string; date: string; tone: string }
type Activity = { icon: string; title: string; detail: string; time: string; tone: string }
type Profile = { name: string; term: string; year: string }
type Goal = { id: number; title: string; completed: number }
type Material = { id: number; subject_id: number; title: string; kind: string; url: string; folder: string; tags: string; favorite: number }
type Note = { id: number; subject_id: number; title: string; content: string; format: string; folder: string; tags: string; favorite: number }
type Annotation = { id: number; subject_id: number; note_id: number | null; quote: string; comment: string; color: string }
type DocumentRecord = { id: number; subject_id: number | null; name: string; file_type: string; size: number; extracted_text: string; folder: string; tags: string }
type RecitationQuestion = { id: number; prompt: string; answer: string; answer_mode: string; evaluation: { score?: number; accuracy?: string; strengths?: string[]; improvements?: string[]; follow_up?: string } }
type KnowledgeEntity = { id: number; entity_type: string; name: string; summary: string; details: Record<string, string> }
type KnowledgeRelationship = { id: number; from_entity_id: number; to_entity_id: number; relationship: string; from_name: string; to_name: string }
type DebateTurn = { id: number; speaker: 'user' | 'ai'; content: string; evaluation: { score?: number; strengths?: string[]; improvements?: string[]; fallacies?: string[]; feedback?: string } }
type DebateSession = { id: number; topic: string; position: string; summary?: string; score?: number | null; turns: DebateTurn[]; report?: { score?: number; summary?: string; strengths?: string[]; improvements?: string[]; fallacies?: string[] } }
type DebateHistoryItem = { id: number; topic: string; position: string; summary: string; score: number | null; report?: DebateSession['report']; created_at: string }
type CalendarEvent = { id?: number; title: string; date: number; calendar_date: string; type: string; time: string }
type NotificationItem = { id: string; title: string; detail: string; date: Date; label: string; calendarDate?: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string }
const activity: Activity[] = []
const notificationStorageKey = 'polis.read-notification-ids'
const themeStorageKey = 'polis.theme'

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fromLocalDateString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatLocalDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return fromLocalDateString(value).toLocaleDateString('en-US', options)
}

function loadReadNotifications(): string[] {
  try {
    const saved = window.localStorage.getItem(notificationStorageKey)
    const parsed: unknown = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
  } catch {
    return []
  }
}

function loadTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(themeStorageKey)
    return saved === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const featureCatalog: Record<string, { eyebrow: string; title: string; description: string; features: string[] }> = {
  'AI recitation': {
    eyebrow: 'LEARNING LAB',
    title: 'AI oral recitation',
    description: 'Practice one question at a time with written or voice answers, evaluation, and performance history.',
    features: ['Question generation', 'Written and voice answers', 'Conceptual accuracy assessment', 'Follow-up questions', 'Recitation history'],
  },
  'Knowledge graph': {
    eyebrow: 'POLITICAL KNOWLEDGE',
    title: 'Political knowledge graph',
    description: 'Connect thinkers, theories, ideologies, concepts, events, and your related notes.',
    features: ['Interactive relationships', 'Thinker and theory profiles', 'Historical events', 'Related notes integration', 'User-created connections'],
  },
  'Debate simulator': {
    eyebrow: 'ARGUMENT PRACTICE',
    title: 'Political debate simulator',
    description: 'Build arguments, practice rebuttals, and receive structured feedback on evidence and logic.',
    features: ['AI debate partner', 'Topic and position selection', 'Counterarguments and rebuttals', 'Fallacy identification', 'Debate performance reports'],
  },
  'Research assistant': {
    eyebrow: 'RESEARCH STUDIO',
    title: 'Research assistant',
    description: 'Organize research questions, sources, annotations, outlines, citations, and thesis development.',
    features: ['Research projects', 'Academic source library', 'APA 7 citation workspace', 'Literature review organizer', 'Bibliography export'],
  },
}

const initialWidgets: Record<Widget, boolean> = {
  subjects: true,
  deadlines: true,
  activity: true,
  goals: true,
  stats: true,
}

function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [activeNav, setActiveNav] = useState('Overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [showCustomizer, setShowCustomizer] = useState(false)
  const [widgets, setWidgets] = useState(initialWidgets)
  const [profile, setProfile] = useState<Profile>({ name: '', term: '', year: '' })
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [goals, setGoals] = useState<Goal[]>([])
  const [newGoal, setNewGoal] = useState('')
  const [materials, setMaterials] = useState<Material[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [workspaceTab, setWorkspaceTab] = useState<'notes' | 'materials' | 'documents' | 'annotations'>('notes')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [workspaceSearch, setWorkspaceSearch] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null)
  const [subjectItems, setSubjectItems] = useState<Subject[]>([])
  const [newSubject, setNewSubject] = useState({ name: '', code: '' })
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateString(new Date()))
  const [viewedMonth, setViewedMonth] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), 1) })
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [newEvent, setNewEvent] = useState({ title: '', type: 'Event', time: '09:00' })
  const [timerSeconds, setTimerSeconds] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [recitationTitle, setRecitationTitle] = useState('')
  const [recitationQuestion, setRecitationQuestion] = useState<RecitationQuestion | null>(null)
  const [recitationAnswer, setRecitationAnswer] = useState('')
  const [recitationEvaluation, setRecitationEvaluation] = useState<RecitationQuestion['evaluation'] | null>(null)
  const [recitationRecording, setRecitationRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [knowledgeEntities, setKnowledgeEntities] = useState<KnowledgeEntity[]>([])
  const [knowledgeRelationships, setKnowledgeRelationships] = useState<KnowledgeRelationship[]>([])
  const [knowledgeSearch, setKnowledgeSearch] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<KnowledgeEntity | null>(null)
  const [entityToDelete, setEntityToDelete] = useState<KnowledgeEntity | null>(null)
  const [newEntity, setNewEntity] = useState({ name: '', entityType: 'concept', summary: '' })
  const [newRelationship, setNewRelationship] = useState({ fromEntityId: '', toEntityId: '', relationship: 'related to' })
  const [debateTopic, setDebateTopic] = useState('')
  const [debatePosition, setDebatePosition] = useState('for')
  const [debateSession, setDebateSession] = useState<DebateSession | null>(null)
  const [debateArgument, setDebateArgument] = useState('')
  const [debateBusy, setDebateBusy] = useState(false)
  const [debateHistory, setDebateHistory] = useState<DebateHistoryItem[]>([])
  const [showDebateHistory, setShowDebateHistory] = useState(false)

  const [toast, setToast] = useState('')

  useEffect(() => {
    try { window.localStorage.setItem(themeStorageKey, theme) } catch { /* Keep the current theme for this session. */ }
  }, [theme])
  const [searchQuery, setSearchQuery] = useState('')
  const [deadlineItems, setDeadlineItems] = useState<Deadline[]>([])
  const [newDeadline, setNewDeadline] = useState({ title: '', subject: '', date: '' })
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(loadReadNotifications)
  const notificationItems = useMemo<NotificationItem[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const items: NotificationItem[] = []
    deadlineItems.forEach((deadline) => {
      const [year, month, day] = deadline.date.split('-').map(Number)
      const dueDate = year && month && day ? new Date(year, month - 1, day) : new Date(deadline.date)
      if (Number.isNaN(dueDate.getTime())) return
      dueDate.setHours(0, 0, 0, 0)
      const days = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000)
      if (days < -7 || days > 14) return
      const label = days < 0 ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`
      items.push({ id: `deadline:${deadline.title}:${deadline.subject}:${deadline.date}`, title: deadline.title, detail: `${deadline.subject} · ${label}`, date: dueDate, label })
    })
    calendarEvents.forEach((event) => {
      const dueDate = fromLocalDateString(event.calendar_date)
      const days = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000)
      if (days < 0 || days > 14) return
      const label = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`
      items.push({ id: `event:${event.title}:${event.calendar_date}:${event.time}`, title: event.title, detail: `${event.type} · ${event.time} · ${label}`, date: dueDate, label, calendarDate: event.calendar_date })
    })
    return items.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [deadlineItems, calendarEvents])
  const unreadNotificationCount = notificationItems.filter((item) => !readNotificationIds.includes(item.id)).length
  const averageProgress = subjectItems.length ? Math.round(subjectItems.reduce((sum, subject) => sum + subject.progress, 0) / subjectItems.length) : 0
  const completedGoalCount = goals.filter((goal) => Boolean(goal.completed)).length
  const timerMinutes = Math.floor(timerSeconds / 60).toString().padStart(2, '0')
  const timerRemainder = (timerSeconds % 60).toString().padStart(2, '0')

  const visibleWidgetCount = useMemo(() => Object.values(widgets).filter(Boolean).length, [widgets])

  const markNotificationsRead = (ids: string[]) => {
    const updated = [...new Set([...readNotificationIds, ...ids])]
    setReadNotificationIds(updated)
    try { window.localStorage.setItem(notificationStorageKey, JSON.stringify(updated)) } catch { showToast('Could not save notification read status') }
  }

  const openNotification = (item: NotificationItem) => {
    markNotificationsRead([item.id])
    if (item.calendarDate) {
      setSelectedDate(item.calendarDate)
      const date = fromLocalDateString(item.calendarDate)
      setViewedMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    }
    setActiveNav('Calendar')
    setModal(null)
  }

  const toggleWidget = (widget: Widget) => {
    if (widgets[widget] && visibleWidgetCount === 1) return
    setWidgets((current) => ({ ...current, [widget]: !current[widget] }))
  }

  const toggleGoal = (goal: Goal) => {
    const completed = !goal.completed
    fetch(`/api/goals/${goal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) }).then((response) => response.json()).then((savedGoal) => setGoals((current) => current.map((item) => item.id === savedGoal.id ? savedGoal : item))).catch(() => showToast('Could not update routine'))
  }

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const openNav = (item: string) => {
    setActiveNav(item)
    if (item === 'Knowledge graph') void loadKnowledgeGraph()
  }

  const startRecitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!recitationTitle.trim()) return
    try {
      const response = await fetch('/api/recitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: recitationTitle.trim(), mode: 'written' }) })
      if (!response.ok) throw new Error('Could not start recitation')
      const result = await response.json()
      setRecitationQuestion(result.question)
      setRecitationEvaluation(null)
      setRecitationAnswer('')
    } catch {
      showToast('Could not start AI recitation')
    }
  }

  const exitRecitation = () => {
    if (recorderRef.current?.state === 'recording') {
      const recorder = recorderRef.current
      recorder.onstop = null
      recorder.stream.getTracks().forEach((track) => track.stop())
      recorder.stop()
      recorderRef.current = null
      setRecitationRecording(false)
    }
    setRecitationQuestion(null)
    setRecitationEvaluation(null)
    setRecitationAnswer('')
    showToast('You exited the recitation')
  }

  const submitRecitationAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!recitationQuestion || !recitationAnswer.trim()) return
    try {
      const response = await fetch(`/api/recitations/questions/${recitationQuestion.id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: recitationAnswer.trim(), answerMode: 'written' }) })
      if (!response.ok) throw new Error('Could not evaluate answer')
      const saved = await response.json()
      setRecitationQuestion(saved)
      setRecitationEvaluation(saved.evaluation)
    } catch {
      showToast('Could not evaluate your answer')
    }
  }

  const toggleRecitationRecording = async () => {
    if (recitationRecording && recorderRef.current) {
      recorderRef.current.stop()
      setRecitationRecording(false)
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showToast('Voice recording is not supported in this browser')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const formData = new FormData()
        formData.append('file', new Blob(audioChunksRef.current, { type: recorder.mimeType }), 'recitation.webm')
        try {
          const response = await fetch('/api/recitations/transcribe', { method: 'POST', body: formData })
          if (!response.ok) throw new Error('Transcription failed')
          const result = await response.json()
          setRecitationAnswer(result.text)
          showToast('Voice answer transcribed')
        } catch {
          showToast('Could not transcribe voice answer')
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecitationRecording(true)
    } catch {
      showToast('Microphone permission is required for voice answers')
    }
  }

  const loadKnowledgeGraph = async (search = knowledgeSearch) => {
    try {
      const [entitiesResponse, relationshipsResponse] = await Promise.all([
        fetch(`/api/knowledge/entities?search=${encodeURIComponent(search)}`),
        fetch('/api/knowledge/relationships'),
      ])
      if (!entitiesResponse.ok || !relationshipsResponse.ok) throw new Error('Knowledge graph unavailable')
      setKnowledgeEntities(await entitiesResponse.json())
      setKnowledgeRelationships(await relationshipsResponse.json())
    } catch {
      showToast('Could not load knowledge graph')
    }
  }

  const createKnowledgeEntity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newEntity.name.trim()) return
    try {
      const response = await fetch('/api/knowledge/entities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newEntity) })
      if (!response.ok) throw new Error('Entity creation failed')
      const entity = await response.json()
      setKnowledgeEntities((current) => [...current, entity].sort((a, b) => a.name.localeCompare(b.name)))
      setNewEntity({ name: '', entityType: 'concept', summary: '' })
      showToast('Knowledge entity added')
    } catch {
      showToast('Could not add knowledge entity')
    }
  }

  const createKnowledgeRelationship = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const response = await fetch('/api/knowledge/relationships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newRelationship, fromEntityId: Number(newRelationship.fromEntityId), toEntityId: Number(newRelationship.toEntityId) }) })
      if (!response.ok) throw new Error('Relationship creation failed')
      setNewRelationship({ fromEntityId: '', toEntityId: '', relationship: 'related to' })
      await loadKnowledgeGraph()
      showToast('Connection added')
    } catch {
      showToast('Could not add connection')
    }
  }

  const deleteKnowledgeEntity = async (entity: KnowledgeEntity) => {
    try {
      const response = await fetch(`/api/knowledge/entities/${entity.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Entity deletion failed')
      setKnowledgeEntities((current) => current.filter((item) => item.id !== entity.id))
      setKnowledgeRelationships((current) => current.filter((item) => item.from_entity_id !== entity.id && item.to_entity_id !== entity.id))
      setSelectedEntity(null)
      setEntityToDelete(null)
      setModal(null)
      showToast(`${entity.name} removed from the graph`)
    } catch {
      showToast('Could not remove knowledge entity')
    }
  }

  const startDebate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!debateTopic.trim()) return
    setDebateBusy(true)
    try {
      const response = await fetch('/api/debates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: debateTopic.trim(), position: debatePosition }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'The debate service returned an error.')
      setDebateSession(result)
      setDebateArgument('')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not start debate.') }
    finally { setDebateBusy(false) }
  }

  const submitDebateArgument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!debateSession || !debateArgument.trim()) return
    setDebateBusy(true)
    try {
      const response = await fetch(`/api/debates/${debateSession.id}/arguments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ argument: debateArgument.trim() }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'The debate service returned an error.')
      setDebateSession(result)
      setDebateArgument('')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not submit argument.') }
    finally { setDebateBusy(false) }
  }

  const resetDebate = () => { setDebateSession(null); setDebateArgument(''); setDebateTopic(''); setShowDebateHistory(false) }

  const loadDebateHistory = async () => {
    try {
      const response = await fetch('/api/debates')
      if (!response.ok) throw new Error()
      setDebateHistory(await response.json())
      setShowDebateHistory(true)
    } catch { showToast('Could not load debate reports') }
  }

  const openSavedDebate = async (debateId: number) => {
    try {
      const response = await fetch(`/api/debates/${debateId}`)
      if (!response.ok) throw new Error()
      setDebateSession(await response.json())
      setShowDebateHistory(false)
    } catch { showToast('Could not open this debate report') }
  }

  const addDeadline = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newDeadline.title.trim() || !newDeadline.subject.trim() || !newDeadline.date) return
    fetch('/api/deadlines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newDeadline, tone: 'normal' }) }).then((response) => response.json()).then((savedDeadline) => setDeadlineItems((current) => [...current, savedDeadline])).catch(() => showToast('Could not save deadline'))
    setNewDeadline({ title: '', subject: '', date: '' })
    setModal(null)
    showToast('Deadline added to your academic plan')
  }

  const searchResults = [...subjectItems.map((subject) => subject.name), ...deadlineItems.map((deadline) => deadline.title), ...activity.map((item) => item.title)]
    .filter((item) => item.toLowerCase().includes(searchQuery.toLowerCase()))

  const addSubject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newSubject.name.trim() || !newSubject.code.trim()) return
    const colors = ['violet', 'terracotta', 'sage', 'blue'] as const
    const added: Subject = { ...newSubject, name: newSubject.name.trim(), code: newSubject.code.trim().toUpperCase(), grade: 'A', progress: 0, next: 'Set your next milestone', color: colors[subjectItems.length % colors.length] }
    fetch('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(added) }).then((response) => response.json()).then((savedSubject) => setSubjectItems((current) => [...current, savedSubject])).catch(() => showToast('Could not save subject'))
    setNewSubject({ name: '', code: '' })
    setModal(null)
    showToast(`${added.name} added to your courses`)
  }

  const addCalendarEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newEvent.title.trim()) return
    fetch('/api/calendar-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newEvent, title: newEvent.title.trim(), date: selectedDate }) }).then(async (response) => {
      if (!response.ok) throw new Error('Could not save calendar event')
      const savedEvent = await response.json()
      setCalendarEvents((current) => [...current, savedEvent])
      setNewEvent({ title: '', type: 'Event', time: '09:00' })
      setModal(null)
      showToast(`${newEvent.type} added for ${formatLocalDate(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' })}`)
    }).catch(() => showToast('Could not save calendar event'))
  }

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }).then((response) => response.json()).then((savedProfile) => { setProfile(savedProfile); setModal(null); showToast('Profile updated') }).catch(() => showToast('Could not save profile'))
  }

  const addGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newGoal.trim()) return
    fetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newGoal }) }).then((response) => response.json()).then((savedGoal) => setGoals((current) => [...current, savedGoal])).catch(() => showToast('Could not add routine item'))
    setNewGoal('')
  }

  const updateSubjectProgress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSubject?.id) return
    const form = new FormData(event.currentTarget)
    const progress = Number(form.get('progress'))
    fetch(`/api/subjects/${selectedSubject.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ progress }) }).then((response) => response.json()).then((savedSubject) => {
      setSubjectItems((current) => current.map((item) => item.id === savedSubject.id ? savedSubject : item))
      setSelectedSubject(savedSubject)
      showToast('Subject progress updated')
    }).catch(() => showToast('Could not update subject progress'))
  }

  const deleteSubject = async (subject: Subject) => {
    if (!subject.id) return
    try {
      const response = await fetch(`/api/subjects/${subject.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Subject deletion failed')
      setSubjectItems((current) => current.filter((item) => item.id !== subject.id))
      setSelectedSubject(null)
      setSubjectToDelete(null)
      setModal(null)
      showToast(`${subject.name} removed from your courses`)
    } catch {
      showToast('Could not remove subject')
    }
  }

  const openWorkspace = async (subject: Subject) => {
    if (!subject.id) return
    setSelectedSubject(subject)
    const [loadedMaterials, loadedNotes, loadedAnnotations, loadedDocuments] = await Promise.all([
      fetch(`/api/materials?subjectId=${subject.id}`).then((response) => response.json()),
      fetch(`/api/notes?subjectId=${subject.id}`).then((response) => response.json()),
      fetch(`/api/annotations?subjectId=${subject.id}`).then((response) => response.json()),
      fetch(`/api/documents?subjectId=${subject.id}`).then((response) => response.json()),
    ])
    setMaterials(loadedMaterials)
    setNotes(loadedNotes)
    setAnnotations(loadedAnnotations)
    setDocuments(loadedDocuments)
    setSelectedNote(loadedNotes[0] || null)
    setModal('workspace')
  }

  const saveNote = (note: Note) => {
    fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note) }).then((response) => response.json()).then((savedNote) => setNotes((current) => current.map((item) => item.id === savedNote.id ? savedNote : item))).catch(() => showToast('Could not save note'))
  }

  const createNote = () => {
    if (!selectedSubject?.id) return
    fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectId: selectedSubject.id }) }).then((response) => response.json()).then((note) => { setNotes((current) => [note, ...current]); setSelectedNote(note) }).catch(() => showToast('Could not create note'))
  }

  const addMaterial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSubject?.id) return
    const form = new FormData(event.currentTarget)
    const payload = { subjectId: selectedSubject.id, title: String(form.get('title')), kind: String(form.get('kind')), url: String(form.get('url') || ''), folder: String(form.get('folder') || ''), tags: String(form.get('tags') || '') }
    fetch('/api/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((response) => response.json()).then((material) => { setMaterials((current) => [material, ...current]); showToast('Study material saved') }).catch(() => showToast('Could not save material'))
    event.currentTarget.reset()
  }

  const addAnnotation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSubject?.id) return
    const form = new FormData(event.currentTarget)
    const payload = { subjectId: selectedSubject.id, noteId: selectedNote?.id || null, quote: String(form.get('quote')), comment: String(form.get('comment') || ''), color: String(form.get('color')) }
    fetch('/api/annotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((response) => response.json()).then((annotation) => { setAnnotations((current) => [annotation, ...current]); showToast('Annotation saved') }).catch(() => showToast('Could not save annotation'))
    event.currentTarget.reset()
  }

  const importDocument = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedSubject?.id) return
    const reader = new FileReader()
    reader.onload = () => {
      const extractedText = typeof reader.result === 'string' && /\.(txt|md|markdown)$/i.test(file.name) ? reader.result : ''
      fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectId: selectedSubject.id, name: file.name, fileType: file.type || file.name.split('.').pop()?.toUpperCase(), size: file.size, extractedText }) }).then((response) => response.json()).then((documentRecord) => { setDocuments((current) => [documentRecord, ...current]); showToast(extractedText ? 'Document uploaded and text extracted' : 'Document added to library') }).catch(() => showToast('Could not add document'))
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/subjects').then((response) => response.json()),
      fetch('/api/deadlines').then((response) => response.json()),
      fetch('/api/calendar-events').then((response) => response.json()),
      fetch('/api/profile').then((response) => response.json()),
      fetch('/api/goals').then((response) => response.json()),
    ]).then(([loadedSubjects, loadedDeadlines, loadedEvents, loadedProfile, loadedGoals]) => {
      setSubjectItems(loadedSubjects)
      setDeadlineItems(loadedDeadlines)
      setCalendarEvents(loadedEvents.map((item: CalendarEvent) => ({ ...item, calendar_date: item.calendar_date || `2026-11-${String(item.date).padStart(2, '0')}` })))
      setProfile(loadedProfile)
      setGoals(loadedGoals)
    }).catch(() => showToast('Could not connect to the API. Start it with npm run dev:server.'))
  }, [])

  const greeting = currentTime.getHours() < 12 ? 'Good morning' : currentTime.getHours() < 17 ? 'Good afternoon' : currentTime.getHours() < 21 ? 'Good evening' : 'Good night'
  const currentDate = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
  const monthLabel = viewedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const calendarYear = viewedMonth.getFullYear()
  const calendarMonth = viewedMonth.getMonth()
  const calendarOffset = new Date(calendarYear, calendarMonth, 1).getDay()
  const daysInCalendarMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const calendarCells: (number | null)[] = [...Array.from({ length: calendarOffset }, () => null), ...Array.from({ length: daysInCalendarMonth }, (_, index) => index + 1)]
  const todayString = toLocalDateString(currentTime)
  const openCalendarEvent = (date = selectedDate) => { setSelectedDate(date); setModal('calendar-event') }
  const openAddCalendarEvent = () => {
    const isCurrentMonth = viewedMonth.getFullYear() === currentTime.getFullYear() && viewedMonth.getMonth() === currentTime.getMonth()
    openCalendarEvent(isCurrentMonth ? todayString : toLocalDateString(new Date(calendarYear, calendarMonth, 1)))
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatOpen])

  const sendChatMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = chatInput.trim()
    if (!content || chatSending) return
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content }]
    setChatMessages(nextMessages)
    setChatInput('')
    setChatSending(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages.slice(-20) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'The study assistant could not reply.')
      setChatMessages((current) => [...current, { role: 'assistant', content: result.answer }])
    } catch (error) {
      setChatMessages((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Could not connect to the study assistant.' }])
    } finally {
      setChatSending(false)
    }
  }

  useEffect(() => {
    if (!selectedNote || modal !== 'workspace') return
    const saveTimeout = window.setTimeout(() => saveNote(selectedNote), 700)
    return () => window.clearTimeout(saveTimeout)
  }, [selectedNote, modal])

  useEffect(() => {
    if (!timerRunning) return
    const interval = window.setInterval(() => {
      setTimerSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval)
          setTimerRunning(false)
          const audioContext = new AudioContext()
          const oscillator = audioContext.createOscillator()
          const gain = audioContext.createGain()
          oscillator.frequency.value = 880
          gain.gain.setValueAtTime(0.001, audioContext.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8)
          oscillator.connect(gain)
          gain.connect(audioContext.destination)
          oscillator.start()
          oscillator.stop(audioContext.currentTime + 0.8)
          showToast('Focus session complete')
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [timerRunning])

  return (
    <div className={`app-shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><JusticeScale01Icon size={19} aria-hidden="true" /></span><span>polis</span></div>
        <div className="profile-card"><div className="avatar">{profile.name ? profile.name.slice(0, 2).toUpperCase() : '?'}</div><div><strong>{profile.name || 'Set up profile'}</strong><span>{profile.term || 'Add your academic details'}</span></div><button className="more-button" onClick={() => setModal('profile')} aria-label="Edit profile">•••</button></div>
        <button className="mobile-nav-toggle" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavOpen} aria-controls="main-navigation" onClick={() => setMobileNavOpen((open) => !open)}><span className="mobile-nav-current"><small>SECTIONS</small><strong>{activeNav}</strong></span><span className={mobileNavOpen ? 'mobile-nav-chevron open' : 'mobile-nav-chevron'} aria-hidden="true">⌄</span></button>
        <nav id="main-navigation" className={mobileNavOpen ? 'nav-list mobile-open' : 'nav-list'} aria-label="Main navigation">
          {['Overview', 'My courses', 'Calendar', 'Insights', 'Study studio', 'AI recitation', 'Knowledge graph', 'Politics & governance', 'Debate simulator', 'Research assistant'].map((item) => <button key={item} aria-current={activeNav === item ? 'page' : undefined} className={activeNav === item ? 'nav-item active' : 'nav-item'} onClick={() => { openNav(item); setMobileNavOpen(false) }}><span className="nav-icon">{item === 'Overview' ? '⌂' : item === 'My courses' ? '▤' : item === 'Calendar' ? '□' : item === 'Insights' ? '⌁' : item === 'Knowledge graph' ? '⌘' : item === 'Debate simulator' ? '◇' : item === 'Research assistant' ? '⌕' : '✦'}</span>{item}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setModal('settings')}><span className="nav-icon">⚙</span>Settings</button>
          <span className="version">polis v1.0 · all access</span>
        </div>
      </aside>

      <main className="main-content" onClick={() => { if (mobileNavOpen) setMobileNavOpen(false) }}>
        <header className="topbar"><div className="breadcrumb"><span>Academic space</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search" onClick={() => setModal('search')}>⌕</button><button className="icon-button notification-button" aria-label={unreadNotificationCount ? `Notifications, ${unreadNotificationCount} unread` : 'Notifications'} onClick={() => setModal('notifications')}>♢{unreadNotificationCount > 0 && <span className="notification-dot" />}</button><button className="theme-toggle" onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); showToast(`${theme === 'light' ? 'Dark' : 'Light'} mode enabled`) }} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? '☾' : '☀'}</button><button className="mini-avatar" onClick={() => setModal('profile')} aria-label="Open profile">{profile.name ? profile.name.slice(0, 2).toUpperCase() : '?'}</button></div></header>
        <section className="welcome-row"><div><p className="eyebrow">{currentDate}</p><h1>{profile.name ? `${greeting}, ${profile.name}` : 'Build your academic dashboard'} <span>✦</span></h1><p className="intro">{profile.name ? 'Your academic picture will update as you add progress.' : 'Add your profile and first subject to get started.'}</p></div><div className="welcome-actions"><button className="customize-button" onClick={() => setShowCustomizer(!showCustomizer)}>☷ Customize</button><button className="date-button" onClick={() => setModal('week')}>This week <span>⌄</span></button></div></section>

        {showCustomizer && <section className="customizer"><div><strong>Dashboard widgets</strong><span>Choose what you want to see.</span></div><div className="widget-options">{(Object.keys(widgets) as Widget[]).map((widget) => <label key={widget}><input type="checkbox" checked={widgets[widget]} onChange={() => toggleWidget(widget)} />{widget}</label>)}</div></section>}

        {activeNav === 'Overview' && <>
        <section className="overview-banner"><div><p className="eyebrow">ACADEMIC OVERVIEW</p><h2>{subjectItems.length ? 'Your semester at a glance.' : 'Your academic overview starts here.'}</h2><p>{subjectItems.length} subject{subjectItems.length === 1 ? '' : 's'} added <span>·</span> {averageProgress}% average progress</p></div><div className="semester-ring" style={{ background: `conic-gradient(#e1ad96 ${averageProgress * 3.6}deg, #a69ec2 0deg)` }}><strong>{averageProgress}%</strong><span>progress</span></div></section>

        {widgets.subjects && <section className="section-block"><div className="section-title"><div><p className="eyebrow">YOUR COURSES</p><h2>Subject progress</h2></div><button className="text-button" onClick={() => openNav('My courses')}>View all <span>→</span></button></div><div className="subject-grid">{subjectItems.map((subject) => <article className="subject-card clickable-card" key={subject.name} onClick={() => { setSelectedSubject(subject); setModal('subject') }}><div className="subject-top"><div className={`subject-icon ${subject.color}`}>{subject.name.charAt(0)}</div><span className="grade">{subject.grade}</span></div><span className="course-code">{subject.code}</span><h3>{subject.name}</h3><div className="progress-meta"><span>{subject.progress}% complete</span><span>Next: {subject.next}</span></div><div className="subject-progress"><span className={subject.color} style={{ width: `${subject.progress}%` }} /></div><button className="card-link" onClick={(event) => { event.stopPropagation(); setSelectedSubject(subject); setModal('subject') }}>View progress →</button></article>)}</div></section>}

        <div className="dashboard-grid">
          {widgets.deadlines && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">PLAN AHEAD</p><h2>Upcoming deadlines</h2></div><button className="text-button" onClick={() => openNav('Calendar')}>Calendar <span>→</span></button></div><div className="deadline-list">{deadlineItems.map((deadline) => <div className="deadline-row" key={deadline.title}><div className={`deadline-dot ${deadline.tone}`} /><div><strong>{deadline.title}</strong><span>{deadline.subject}</span></div><time className={deadline.tone}>{deadline.date}</time></div>)}</div><button className="add-task" onClick={() => setModal('deadline')}>+ Add deadline</button></section>}
          {widgets.goals && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">TODAY'S ROUTINE</p><h2>Daily study goals</h2></div><div className="routine-actions"><span className="plan-count">{completedGoalCount} / {goals.length}</span><button className="text-button" onClick={() => setModal('routine')}>Edit</button></div></div><div className="task-list">{goals.map((goal) => <label className={goal.completed ? 'task done' : 'task'} key={goal.id}><input type="checkbox" checked={Boolean(goal.completed)} onChange={() => toggleGoal(goal)} /><span>{goal.title}</span></label>)}</div><div className="goal-progress"><span style={{ width: `${goals.length ? (completedGoalCount / goals.length) * 100 : 0}%` }} /></div><p className="goal-caption">{goals.length ? `${goals.length - completedGoalCount} goal${goals.length - completedGoalCount === 1 ? '' : 's'} left for today` : 'Add goals to create your routine.'}</p></section>}
        </div>

        <div className="quick-stats-grid">
          {widgets.stats && <section className="panel quick-actions"><div className="panel-heading"><div><p className="eyebrow">SHORTCUTS</p><h2>Quick actions</h2></div></div><div className="action-grid"><button onClick={() => setModal('assignment')}><span>＋</span>Add assignment</button><button onClick={() => setModal('timer')}><span>◷</span>Start focus timer</button><button onClick={() => openNav('Calendar')}><span>▤</span>Plan my week</button></div></section>}
          {widgets.stats && <section className="panel study-stats"><div className="panel-heading"><div><p className="eyebrow">YOUR RHYTHM</p><h2>Study statistics</h2></div></div><div className="empty-state">Statistics will appear as you complete study sessions.</div><div className="stat-summary"><span><strong>{goals.length}</strong> routine goals</span><span><strong>{completedGoalCount}</strong> completed</span><span><strong>{deadlineItems.length}</strong> deadlines</span></div></section>}
        </div>

        {widgets.activity && <section className="section-block activity-section"><div className="section-title"><div><p className="eyebrow">YOUR MOMENTUM</p><h2>Recent activity</h2></div><button className="text-button" onClick={() => setModal('activity')}>View all <span>→</span></button></div><div className="activity-list">{activity.map((item) => <div className="activity-row" key={item.title}><div className={`activity-icon ${item.tone}`}>{item.icon}</div><div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><time>{item.time}</time></div>)}</div></section>}
        </>}

        {activeNav === 'My courses' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">ACADEMIC SPACE</p><h1>My courses</h1><p className="intro">Track every subject, milestone, and next step in one place.</p></div><button className="primary-button" onClick={() => setModal('add-subject')}>+ Add subject</button></div><div className="course-page-grid">{subjectItems.map((subject) => <article className="course-large-card" key={subject.name} onClick={() => { setSelectedSubject(subject); setModal('subject') }}><div className={`subject-icon ${subject.color}`}>{subject.name.charAt(0)}</div><div className="course-large-info"><span className="course-code">{subject.code}</span><h2>{subject.name}</h2><p>Next milestone: {subject.next}</p><div className="subject-progress"><span className={subject.color} style={{ width: `${subject.progress}%` }} /></div><small>{subject.progress}% complete</small></div><strong className="large-grade">{subject.grade}</strong></article>)}</div></section>}

        {activeNav === 'Calendar' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">{monthLabel.toUpperCase()}</p><h1>Academic calendar</h1><p className="intro">Select any date to schedule an event, reminder, or study session.</p></div><button className="primary-button" onClick={openAddCalendarEvent}>+ Add event</button></div><div className="calendar-layout"><div className="calendar-card"><div className="calendar-header"><button aria-label="Previous month" onClick={() => setViewedMonth(new Date(calendarYear, calendarMonth - 1, 1))}>←</button><div className="calendar-month-heading"><strong>{monthLabel}</strong><button className="calendar-today-button" onClick={() => { setViewedMonth(new Date(currentTime.getFullYear(), currentTime.getMonth(), 1)); setSelectedDate(todayString) }}>Today</button></div><button aria-label="Next month" onClick={() => setViewedMonth(new Date(calendarYear, calendarMonth + 1, 1))}>→</button></div><div className="calendar-days">{['S','M','T','W','T','F','S'].map((day, index) => <span className="calendar-weekday" key={`${day}-${index}`}>{day}</span>)}{calendarCells.map((day, index) => { if (day === null) return <span className="calendar-day-empty" aria-hidden="true" key={`empty-${index}`} />; const calendarDate = toLocalDateString(new Date(calendarYear, calendarMonth, day)); const hasEvent = calendarEvents.some((item) => item.calendar_date === calendarDate); const isToday = calendarDate === todayString; return <button className={`calendar-day${calendarDate === selectedDate ? ' selected' : ''}${isToday ? ' today' : ''}`} aria-current={isToday ? 'date' : undefined} aria-label={formatLocalDate(calendarDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} key={calendarDate} onClick={() => openCalendarEvent(calendarDate)}>{day}{hasEvent && <i className="calendar-event-dot" />}</button> })}</div></div><div className="calendar-agenda"><p className="eyebrow">UPCOMING</p><h2>Deadlines &amp; events</h2>{deadlineItems.map((deadline) => <div className="agenda-item" key={`${deadline.title}-${deadline.date}`}><span>{deadline.date}</span><div><strong>{deadline.title}</strong><small>{deadline.subject}</small></div></div>)}{[...calendarEvents].sort((a, b) => a.calendar_date.localeCompare(b.calendar_date) || a.time.localeCompare(b.time)).map((calendarEvent, index) => <div className="agenda-item" key={calendarEvent.id ?? `${calendarEvent.title}-${calendarEvent.calendar_date}-${index}`}><span>{formatLocalDate(calendarEvent.calendar_date, { month: 'short', day: 'numeric', year: 'numeric' })}</span><div><strong>{calendarEvent.title}</strong><small>{calendarEvent.type} · {calendarEvent.time}</small></div></div>)}</div></div></section>}

        {activeNav === 'Insights' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">YOUR PROGRESS</p><h1>Academic insights</h1><p className="intro">Live metrics based only on the data you add.</p></div><button className="date-button" onClick={() => showToast('Insights are calculated from your current records')}>Live data <span>⌄</span></button></div><div className="insight-grid"><article className="insight-highlight"><p className="eyebrow">AVERAGE PROGRESS</p><strong>{averageProgress}%</strong><span>{subjectItems.length ? 'Across your subjects' : 'Add subjects to track progress'}</span><div className="insight-line green"><i style={{ width: `${averageProgress}%` }} /></div></article><article className="insight-chart"><p className="eyebrow">ACADEMIC RECORDS</p><h2>{subjectItems.length + deadlineItems.length + calendarEvents.length} items tracked</h2><div className="empty-state">{subjectItems.length || deadlineItems.length || calendarEvents.length ? 'Your overview updates automatically when records change.' : 'Add a subject, deadline, or event to start seeing insights.'}</div></article></div><div className="insight-note"><span>✦</span><div><strong>{subjectItems.length ? 'Keep building your academic picture.' : 'Your insights are ready when you are.'}</strong><p>All metrics on this page are derived from your current subjects, progress, deadlines, and calendar events. No placeholder data is shown.</p></div></div></section>}
        {activeNav === 'AI recitation' && <section className="page-view recitation-page"><div className="page-heading"><div><p className="eyebrow">LEARNING LAB</p><h1>AI oral recitation</h1><p className="intro">Practice one question at a time and receive feedback on conceptual accuracy.</p></div></div>{!recitationQuestion && <form className="recitation-start" onSubmit={startRecitation}><label>What should you be tested on?<input className="modal-input" required placeholder="e.g. Marxist theory and political economy" value={recitationTitle} onChange={(event) => setRecitationTitle(event.target.value)} /></label><button className="primary-button" type="submit">Start recitation</button><p>OpenAI generates the question and evaluates your answer securely through the API.</p></form>}{recitationQuestion && <article className="recitation-card"><div className="recitation-card-head"><p className="eyebrow">QUESTION</p><button className="recitation-exit" type="button" onClick={exitRecitation}>Exit recitation</button></div><h2>{recitationQuestion.prompt}</h2><form onSubmit={submitRecitationAnswer}><textarea className="recitation-answer" required placeholder="Explain your answer in your own words..." value={recitationAnswer} onChange={(event) => setRecitationAnswer(event.target.value)} /><div className="recitation-actions"><button className="primary-button" type="submit">Submit answer</button><button className={recitationRecording ? 'record-button recording' : 'record-button'} type="button" onClick={toggleRecitationRecording}>{recitationRecording ? 'Stop recording' : 'Record voice answer'}</button></div></form>{recitationEvaluation && <div className="recitation-feedback"><div className="score-badge">{recitationEvaluation.score ?? '—'}<span>/100</span></div><div><p><strong>Conceptual accuracy:</strong> {recitationEvaluation.accuracy}</p><p><strong>Strengths:</strong> {recitationEvaluation.strengths?.join(' ') || 'No strengths recorded.'}</p><p><strong>Improve next:</strong> {recitationEvaluation.improvements?.join(' ') || 'No improvement notes recorded.'}</p>{recitationEvaluation.follow_up && <p><strong>Follow-up:</strong> {recitationEvaluation.follow_up}</p>}</div></div>}</article>}</section>}
        {activeNav === 'Knowledge graph' && <section className="page-view knowledge-page"><div className="page-heading"><div><p className="eyebrow">POLITICAL KNOWLEDGE</p><h1>Knowledge graph</h1><p className="intro">Search concepts and connect thinkers, theories, ideologies, events, and institutions.</p></div></div><div className="knowledge-toolbar"><input className="modal-input" placeholder="Search entities..." value={knowledgeSearch} onChange={(event) => { setKnowledgeSearch(event.target.value); void loadKnowledgeGraph(event.target.value) }} /><span>{knowledgeEntities.length} entities · {knowledgeRelationships.length} connections</span></div><div className="knowledge-layout"><div><form className="knowledge-form" onSubmit={createKnowledgeEntity}><h2>Add entity</h2><input className="modal-input" required placeholder="Name" value={newEntity.name} onChange={(event) => setNewEntity({ ...newEntity, name: event.target.value })} /><Dropdown className="modal-input" ariaLabel="Entity type" value={newEntity.entityType} onChange={(value) => setNewEntity({ ...newEntity, entityType: value })} options={['thinker', 'theory', 'ideology', 'concept', 'event', 'institution'].map((type) => ({ value: type, label: type }))} /><textarea className="modal-input knowledge-summary" placeholder="Short summary" value={newEntity.summary} onChange={(event) => setNewEntity({ ...newEntity, summary: event.target.value })} /><button className="primary-button" type="submit">Add to graph</button></form><form className="knowledge-form" onSubmit={createKnowledgeRelationship}><h2>Connect entities</h2><Dropdown className="modal-input" ariaLabel="From entity" value={newRelationship.fromEntityId} onChange={(value) => setNewRelationship({ ...newRelationship, fromEntityId: value })} options={[{ value: '', label: 'From entity' }, ...knowledgeEntities.map((entity) => ({ value: String(entity.id), label: entity.name }))]} /><input className="modal-input" required placeholder="Relationship (e.g. developed)" value={newRelationship.relationship} onChange={(event) => setNewRelationship({ ...newRelationship, relationship: event.target.value })} /><Dropdown className="modal-input" ariaLabel="To entity" value={newRelationship.toEntityId} onChange={(value) => setNewRelationship({ ...newRelationship, toEntityId: value })} options={[{ value: '', label: 'To entity' }, ...knowledgeEntities.map((entity) => ({ value: String(entity.id), label: entity.name }))]} /><button className="primary-button" type="submit">Create connection</button></form></div><div className="knowledge-results"><div className="knowledge-entity-grid">{knowledgeEntities.map((entity) => <button className={selectedEntity?.id === entity.id ? 'knowledge-entity selected' : 'knowledge-entity'} key={entity.id} onClick={() => setSelectedEntity(entity)}><span>{entity.entity_type}</span><strong>{entity.name}</strong><p>{entity.summary || 'No summary yet.'}</p></button>)}</div><div className="knowledge-connections"><h2>Connections</h2>{knowledgeRelationships.length ? knowledgeRelationships.map((connection) => <p key={connection.id}><strong>{connection.from_name}</strong> <span>{connection.relationship}</span> <strong>{connection.to_name}</strong></p>) : <div className="empty-state">Add entities and connect them to build your graph.</div>}</div>{selectedEntity && <div className="knowledge-profile"><p className="eyebrow">{selectedEntity.entity_type}</p><h2>{selectedEntity.name}</h2><p>{selectedEntity.summary || 'Add a summary to describe this profile.'}</p><button className="delete-entity" onClick={() => { setEntityToDelete(selectedEntity); setModal('delete-entity') }}>Remove entity</button></div>}</div></div></section>}
        {activeNav === 'Debate simulator' && <section className="page-view debate-page"><div className="page-heading"><div><p className="eyebrow">ARGUMENT PRACTICE</p><h1>Political debate simulator</h1><p className="intro">Build arguments, practice rebuttals, and receive structured feedback on evidence and logic.</p></div><div className="debate-heading-actions">{showDebateHistory && <button className="text-button debate-back-button" onClick={() => setShowDebateHistory(false)}>Back to setup</button>}{(debateSession || showDebateHistory) && <button className="primary-button" onClick={resetDebate}>New debate</button>}{!debateSession && !showDebateHistory && <button className="text-button" onClick={() => void loadDebateHistory()}>Past reports</button>}</div></div>{showDebateHistory ? <div className="debate-history"><p className="eyebrow">RECENT DEBATES</p>{debateHistory.length ? debateHistory.map((item) => <button className="debate-history-item" key={item.id} onClick={() => void openSavedDebate(item.id)}><span><strong>{item.topic}</strong><small>{item.position === 'for' ? 'Supported the motion' : 'Opposed the motion'} · {new Date(item.created_at).toLocaleDateString()}</small></span><b>{item.score == null ? 'In progress' : `${Math.round(Number(item.score))}/100`}</b></button>) : <p className="empty-state">Your completed debate reports will appear here.</p>}</div> : !debateSession ? <><form className="debate-start" onSubmit={startDebate}><p className="eyebrow">SET UP YOUR DEBATE</p><label>Debate topic<input className="modal-input" required maxLength={240} placeholder="e.g. Should voting be compulsory?" value={debateTopic} onChange={(event) => setDebateTopic(event.target.value)} /></label><label>Your position<Dropdown className="modal-input" ariaLabel="Your position" value={debatePosition} onChange={setDebatePosition} options={[{ value: 'for', label: 'Support the motion' }, { value: 'against', label: 'Oppose the motion' }]} /></label><button className="primary-button" disabled={debateBusy} type="submit">{debateBusy ? 'Preparing debate…' : 'Start debate'}</button></form><div className="debate-feature-list"><div><span>✦</span><strong>AI debate partner</strong><small>Get an opening argument from the opposite side.</small></div><div><span>✦</span><strong>Counterarguments and rebuttals</strong><small>Respond to each point through three debate rounds.</small></div><div><span>✦</span><strong>Fallacy identification</strong><small>See potential reasoning fallacies in your feedback.</small></div><button onClick={() => void loadDebateHistory()}><span>✦</span><strong>Debate performance reports</strong><small>Open saved scores, feedback, and past transcripts.</small></button></div></> : <div className="debate-workspace"><div className="debate-meta"><span className="eyebrow">{debateSession.position === 'for' ? 'YOU SUPPORT THE MOTION' : 'YOU OPPOSE THE MOTION'}</span><h2>{debateSession.topic}</h2><p>{debateSession.report ? 'Debate complete · your performance report is ready' : 'Present a clear claim with reasoning or evidence. Your partner will respond.'}</p></div><div className="debate-transcript">{debateSession.turns.map((turn) => <article className={`debate-turn ${turn.speaker}`} key={turn.id}><span className="eyebrow">{turn.speaker === 'user' ? 'YOUR ARGUMENT' : 'AI PARTNER'}</span><p>{turn.content}</p>{turn.speaker === 'user' && turn.evaluation && <div className="debate-feedback"><strong>Argument feedback · {turn.evaluation.score ?? '—'}/100</strong><span>{turn.evaluation.feedback}</span>{Boolean(turn.evaluation.fallacies?.length) && <span><b>Possible fallacies:</b> {turn.evaluation.fallacies?.join(', ')}</span>}{Boolean(turn.evaluation.improvements?.length) && <span><b>Try next:</b> {turn.evaluation.improvements?.join(' ')}</span>}</div>}</article>)}</div>{debateSession.report ? <article className="debate-report"><p className="eyebrow">PERFORMANCE REPORT · {debateSession.report.score ?? '—'}/100</p><h2>Debate complete</h2><p>{debateSession.report.summary}</p><div><section><strong>What worked</strong><p>{debateSession.report.strengths?.join(' ') || 'Keep making specific, well-supported claims.'}</p></section><section><strong>Work on next</strong><p>{debateSession.report.improvements?.join(' ') || 'Add evidence and address counterarguments directly.'}</p></section><section><strong>Fallacies to review</strong><p>{debateSession.report.fallacies?.join(', ') || 'No clear fallacies detected.'}</p></section></div><button className="primary-button" onClick={resetDebate}>Start another debate</button></article> : <form className="debate-compose" onSubmit={submitDebateArgument}><label htmlFor="debate-argument">Your argument</label><textarea id="debate-argument" className="recitation-answer" required minLength={12} maxLength={4000} placeholder="State your claim, explain your reasoning, and add evidence where you can…" value={debateArgument} onChange={(event) => setDebateArgument(event.target.value)} /><div className="debate-compose-footer"><span>{debateArgument.length}/4000 · The debate ends after 3 rounds.</span><button className="primary-button" disabled={debateBusy}>{debateBusy ? 'Evaluating…' : 'Submit argument'}</button></div></form>}</div>}</section>}
        {activeNav === 'Politics & governance' && <PoliticalTools />}
        {activeNav === 'Study studio' && <StudyStudio />}
        {activeNav === 'Research assistant' && <ResearchAssistant />}
        {activeNav !== 'AI recitation' && activeNav !== 'Knowledge graph' && activeNav !== 'Debate simulator' && activeNav !== 'Politics & governance' && activeNav !== 'Research assistant' && featureCatalog[activeNav] && <section className="page-view feature-hub"><div className="page-heading"><div><p className="eyebrow">{featureCatalog[activeNav].eyebrow}</p><h1>{featureCatalog[activeNav].title}</h1><p className="intro">{featureCatalog[activeNav].description}</p></div><button className="primary-button" onClick={() => showToast('This workspace is ready for the next implementation milestone')}>Explore workspace</button></div><div className="feature-grid">{featureCatalog[activeNav].features.map((feature) => <article className="feature-card" key={feature}><span>✦</span><h2>{feature}</h2><p>Foundation ready for structured data, progress tracking, and future AI-assisted workflows.</p></article>)}</div></section>}
        <footer><span>Built for a life of intention.</span><span>Need a hand? <button className="footer-link" onClick={() => showToast('Guide coming soon — your dashboard is ready to explore.')}>Visit the guide</button></span></footer>

        {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="modal" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button>
          {modal === 'search' && <><p className="eyebrow">FIND ANYTHING</p><h2>Search your academic space</h2><input className="modal-input" autoFocus placeholder="Search courses, deadlines, activity..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><div className="search-results">{searchQuery && (searchResults.length ? searchResults.map((result) => <button key={result} onClick={() => { setModal(null); showToast(`Opened ${result}`) }}>{result}<span>→</span></button>) : <p>No matching items found.</p>)}</div></>}
          {modal === 'notifications' && <><p className="eyebrow">UPDATES · {unreadNotificationCount} UNREAD</p><h2>Notifications</h2>{notificationItems.length ? <div className="notification-list">{notificationItems.map((item) => { const isRead = readNotificationIds.includes(item.id); return <button className={isRead ? 'notification-item read' : 'notification-item unread'} key={item.id} onClick={() => openNotification(item)}><span className="notification-copy"><strong>{item.title}</strong><span>{item.detail}</span></span><span className="notification-status">{isRead ? 'Read' : item.label}</span></button> })}</div> : <div className="notification-empty"><span>✓</span><strong>You’re all caught up</strong><p>Deadlines and calendar events due in the next two weeks will show up here.</p></div>}<button className="modal-primary" disabled={!unreadNotificationCount} onClick={() => markNotificationsRead(notificationItems.map((item) => item.id))}>{unreadNotificationCount ? 'Mark all as read' : 'All caught up'}</button></>}
          {modal === 'settings' && <><p className="eyebrow">PERSONALIZE</p><h2>Settings</h2><div className="settings-list"><label>Theme <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? 'Light' : 'Dark'} ↔</button></label><label>Weekly digest <input type="checkbox" defaultChecked /></label><label>Deadline reminders <input type="checkbox" defaultChecked /></label></div><button className="modal-primary" onClick={() => { setModal(null); showToast('Settings saved') }}>Done</button></>}
          {modal === 'profile' && <form onSubmit={saveProfile}><p className="eyebrow">YOUR ACCOUNT</p><h2>Edit profile</h2><input className="modal-input" required placeholder="Your name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /><input className="modal-input" placeholder="Term (e.g. Fall 2026)" value={profile.term} onChange={(event) => setProfile({ ...profile, term: event.target.value })} /><input className="modal-input" placeholder="Year or program" value={profile.year} onChange={(event) => setProfile({ ...profile, year: event.target.value })} /><button className="modal-primary" type="submit">Save profile</button></form>}
          {modal === 'routine' && <><p className="eyebrow">PERSONALIZE</p><h2>Customize routine</h2><form onSubmit={addGoal} className="inline-form"><input className="modal-input" required placeholder="Add a study goal" value={newGoal} onChange={(event) => setNewGoal(event.target.value)} /><button className="modal-primary" type="submit">Add goal</button></form><div className="modal-list">{goals.map((goal) => <div key={goal.id}><strong>{goal.title}<button className="delete-goal" onClick={() => { fetch(`/api/goals/${goal.id}`, { method: 'DELETE' }); setGoals((current) => current.filter((item) => item.id !== goal.id)) }}>Remove</button></strong><span>{goal.completed ? 'Completed' : 'Not completed'}</span></div>)}</div></>}
          {modal === 'week' && <><p className="eyebrow">DATE RANGE</p><h2>Plan your study week</h2><div className="range-options">{['This week', 'Next week', 'This month'].map((range) => <button key={range} onClick={() => { setModal(null); showToast(`${range} selected`) }}>{range}<span>→</span></button>)}</div></>}
          {modal === 'courses' && <><p className="eyebrow">MY COURSES</p><h2>All subjects</h2><div className="modal-list">{subjectItems.map((subject) => <div key={subject.name}><strong>{subject.name} <em>{subject.grade}</em></strong><span>{subject.code} · {subject.progress}% complete</span></div>)}</div></>}
          {modal === 'subject' && selectedSubject && <><p className="eyebrow">{selectedSubject.code}</p><div className="subject-modal-title"><div className={`subject-icon ${selectedSubject.color}`}>{selectedSubject.name.charAt(0)}</div><h2>{selectedSubject.name}</h2><span className="grade">{selectedSubject.grade}</span></div><div className="subject-detail-progress"><div><strong>{selectedSubject.progress}%</strong><span>course progress</span></div><div className="large-progress"><span className={selectedSubject.color} style={{ width: `${selectedSubject.progress}%` }} /></div></div><form className="progress-editor" onSubmit={updateSubjectProgress}><label>Update progress<input className="modal-input" name="progress" type="number" min="0" max="100" defaultValue={selectedSubject.progress} /></label><button className="modal-primary" type="submit">Save progress</button></form><div className="detail-grid"><div><span>Next milestone</span><strong>{selectedSubject.next}</strong></div><div><span>Current grade</span><strong>{selectedSubject.grade}</strong></div><div><span>Study sessions</span><strong>—</strong></div><div><span>Time invested</span><strong>—</strong></div></div><button className="modal-primary" onClick={() => openWorkspace(selectedSubject)}>Open academic workspace</button><button className="delete-subject" onClick={() => { setSubjectToDelete(selectedSubject); setModal('delete-subject') }}>Remove subject</button></>}
          {modal === 'delete-subject' && subjectToDelete && <div className="delete-confirmation"><p className="eyebrow">REMOVE COURSE</p><h2>Remove {subjectToDelete.name}?</h2><p className="modal-copy">This will permanently remove the course and its related workspace content.</p><div className="confirmation-actions"><button className="modal-secondary" onClick={() => { setSubjectToDelete(null); setModal('subject') }}>Cancel</button><button className="modal-danger" onClick={() => deleteSubject(subjectToDelete)}>Remove subject</button></div></div>}
          {modal === 'delete-entity' && entityToDelete && <div className="delete-confirmation"><p className="eyebrow">REMOVE ENTITY</p><h2>Remove {entityToDelete.name}?</h2><p className="modal-copy">This will permanently remove the entity and all of its graph connections.</p><div className="confirmation-actions"><button className="modal-secondary" onClick={() => { setEntityToDelete(null); setModal(null) }}>Cancel</button><button className="modal-danger" onClick={() => deleteKnowledgeEntity(entityToDelete)}>Remove entity</button></div></div>}
          {modal === 'workspace' && selectedSubject && <div className="workspace-modal"><div className="workspace-heading"><div><p className="eyebrow">{selectedSubject.code} · ACADEMIC WORKSPACE</p><h2>{selectedSubject.name}</h2></div><div className="workspace-heading-actions"><input className="workspace-search" placeholder="Search workspace" value={workspaceSearch} onChange={(event) => setWorkspaceSearch(event.target.value)} /><button className="workspace-export" onClick={() => window.print()}>Export PDF</button></div></div><div className="workspace-tabs">{(['notes', 'materials', 'documents', 'annotations'] as const).map((tab) => <button className={workspaceTab === tab ? 'active' : ''} key={tab} onClick={() => setWorkspaceTab(tab)}>{tab}</button>)}</div>{workspaceTab === 'notes' && <div className="workspace-content"><aside className="workspace-sidebar"><button className="modal-primary" onClick={createNote}>+ New note</button>{notes.filter((note) => `${note.title} ${note.tags}`.toLowerCase().includes(workspaceSearch.toLowerCase())).map((note) => <button className={selectedNote?.id === note.id ? 'selected-note' : ''} onClick={() => setSelectedNote(note)} key={note.id}>{note.title || 'Untitled note'}<small>{note.tags || 'No tags'}</small></button>)}</aside><div className="note-editor">{selectedNote ? <><input className="note-title-input" value={selectedNote.title} onChange={(event) => setSelectedNote({ ...selectedNote, title: event.target.value })} onBlur={() => saveNote(selectedNote)} /><div className="editor-tools"><span>Markdown / rich text</span><button onClick={() => saveNote(selectedNote)}>Save now</button></div><textarea className="note-textarea" placeholder="Write notes, definitions, and key concepts..." value={selectedNote.content} onChange={(event) => setSelectedNote({ ...selectedNote, content: event.target.value })} onBlur={() => saveNote({ ...selectedNote, content: selectedNote.content })} /><input className="modal-input" placeholder="Tags, comma separated" value={selectedNote.tags} onChange={(event) => setSelectedNote({ ...selectedNote, tags: event.target.value })} onBlur={() => saveNote({ ...selectedNote, tags: selectedNote.tags })} /></> : <div className="empty-state">Create a note to start your workspace.</div>}</div></div>}{workspaceTab === 'materials' && <div className="workspace-content single-column"><form className="workspace-form" onSubmit={addMaterial}><h3>Add study material</h3><input className="modal-input" name="title" required placeholder="Material title" /><select className="modal-input" name="kind"><option>Link</option><option>Book</option><option>Reading</option><option>Video</option></select><input className="modal-input" name="url" placeholder="URL or reference" /><div className="form-row"><input className="modal-input" name="folder" placeholder="Folder" /><input className="modal-input" name="tags" placeholder="Tags" /></div><button className="modal-primary" type="submit">Save material</button></form><div className="library-list">{materials.filter((item) => `${item.title} ${item.tags}`.toLowerCase().includes(workspaceSearch.toLowerCase())).map((material) => <div key={material.id}><strong>{material.title}</strong><span>{material.kind} · {material.folder || 'Unfiled'} · {material.tags || 'No tags'}</span></div>)}</div></div>}{workspaceTab === 'documents' && <div className="workspace-content single-column"><label className="upload-dropzone">Upload PDF, DOCX, PPTX, TXT, or Markdown<input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.markdown" onChange={importDocument} /></label><div className="library-list">{documents.map((document) => <div key={document.id}><strong>{document.name}</strong><span>{document.file_type} · {Math.ceil(document.size / 1024)} KB {document.extracted_text ? '· text extracted' : '· preview metadata saved'}</span></div>)}</div></div>}{workspaceTab === 'annotations' && <div className="workspace-content single-column"><form className="workspace-form" onSubmit={addAnnotation}><h3>Highlight a key concept</h3><textarea className="modal-input" name="quote" required placeholder="Paste the passage or concept to highlight" /><textarea className="modal-input" name="comment" placeholder="Add your annotation or explanation" /><select className="modal-input" name="color"><option>yellow</option><option>blue</option><option>green</option><option>pink</option></select><button className="modal-primary" type="submit">Save annotation</button></form><div className="library-list">{annotations.map((annotation) => <div key={annotation.id}><strong>{annotation.quote}</strong><span>{annotation.comment || 'No comment'} · {annotation.color}</span></div>)}</div></div>}</div>}
          {modal === 'add-subject' && <form onSubmit={addSubject}><p className="eyebrow">MY COURSES</p><h2>Add a subject</h2><input className="modal-input" required placeholder="Subject name" value={newSubject.name} onChange={(event) => setNewSubject({ ...newSubject, name: event.target.value })} /><input className="modal-input" required placeholder="Course code (e.g. BIO 120)" value={newSubject.code} onChange={(event) => setNewSubject({ ...newSubject, code: event.target.value })} /><button className="modal-primary" type="submit">Add subject</button></form>}
          {modal === 'calendar-event' && <form onSubmit={addCalendarEvent}><p className="eyebrow">EVENT DATE</p><h2>Plan for {formatLocalDate(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' })}</h2><input className="modal-input" required autoFocus placeholder="Event or reminder title" value={newEvent.title} onChange={(event) => setNewEvent({ ...newEvent, title: event.target.value })} /><div className="form-row"><label>Type<select className="modal-input" value={newEvent.type} onChange={(event) => setNewEvent({ ...newEvent, type: event.target.value })}><option>Event</option><option>Reminder</option><option>Study session</option><option>Exam</option></select></label><label>Time<input className="modal-input" type="time" value={newEvent.time} onChange={(event) => setNewEvent({ ...newEvent, time: event.target.value })} /></label></div><button className="modal-primary" type="submit">Save to calendar</button></form>}
          {modal === 'deadline' && <form onSubmit={addDeadline}><p className="eyebrow">PLAN AHEAD</p><h2>Add a deadline</h2><input className="modal-input" required placeholder="Assignment or exam name" value={newDeadline.title} onChange={(event) => setNewDeadline({ ...newDeadline, title: event.target.value })} /><input className="modal-input" required placeholder="Course code" value={newDeadline.subject} onChange={(event) => setNewDeadline({ ...newDeadline, subject: event.target.value })} /><input className="modal-input" required type="date" value={newDeadline.date} onChange={(event) => setNewDeadline({ ...newDeadline, date: event.target.value })} /><button className="modal-primary" type="submit">Add deadline</button></form>}
          {modal === 'assignment' && <form onSubmit={(event) => { event.preventDefault(); setModal(null); showToast('Assignment added to your plan') }}><p className="eyebrow">QUICK ACTION</p><h2>Add an assignment</h2><input className="modal-input" required placeholder="What do you need to do?" /><select className="modal-input" defaultValue=""><option value="" disabled>Choose a course</option>{subjectItems.map((subject) => <option key={subject.code}>{subject.code}</option>)}</select><button className="modal-primary" type="submit">Save assignment</button></form>}
          {modal === 'timer' && <><p className="eyebrow">FOCUS MODE</p><h2>Focus timer</h2><div className={`timer-display ${timerSeconds === 0 ? 'timer-complete' : ''}`}>{timerMinutes}:{timerRemainder}</div><p className="modal-copy">{timerSeconds === 0 ? 'Your focus session is complete.' : timerRunning ? 'Stay with it. You are doing good work.' : 'Settle in for a focused session.'}</p><div className="timer-controls">{timerSeconds === 0 ? <button className="modal-primary" onClick={() => setTimerSeconds(25 * 60)}>Start another session</button> : <button className="modal-primary" onClick={() => { setTimerRunning(!timerRunning); showToast(timerRunning ? 'Focus timer paused' : 'Focus timer started') }}>{timerRunning ? 'Pause timer' : 'Start timer'}</button>}<button className="timer-reset" onClick={() => { setTimerRunning(false); setTimerSeconds(25 * 60) }}>Reset</button></div><p className="timer-note">A chime will play when the timer reaches zero.</p></>}
          {modal === 'activity' && <><p className="eyebrow">YOUR MOMENTUM</p><h2>Recent activity</h2><div className="modal-list">{activity.map((item) => <div key={item.title}><strong>{item.title}</strong><span>{item.detail} · {item.time}</span></div>)}</div></>}
        </section></div>}
        <div className="study-chat">
          {chatOpen && <section className="study-chat-panel" aria-label="Polis study assistant">
            <header className="study-chat-header"><div><strong>Study assistant</strong><span>Here to help you learn</span></div><button type="button" onClick={() => setChatOpen(false)} aria-label="Close study assistant">×</button></header>
            <div className="study-chat-messages" aria-live="polite">
              {!chatMessages.length && <div className="study-chat-welcome"><span>✦</span><strong>What are you working on?</strong><p>Ask about a political science concept, plan a study session, or get help with the app.</p></div>}
              {chatMessages.map((message, index) => <div className={`study-chat-message ${message.role}`} key={`${index}-${message.role}`}><p>{message.content}</p></div>)}
              {chatSending && <div className="study-chat-message assistant"><p>Thinking…</p></div>}
              <div ref={chatEndRef} />
            </div>
            <form className="study-chat-form" onSubmit={sendChatMessage}><textarea aria-label="Message the study assistant" placeholder="Ask anything…" value={chatInput} maxLength={4000} rows={2} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /><button type="submit" disabled={chatSending || !chatInput.trim()} aria-label="Send message">↑</button></form>
            <p className="study-chat-note">AI can make mistakes. Check important information.</p>
          </section>}
          <button className="study-chat-toggle" type="button" onClick={() => setChatOpen((open) => !open)} aria-expanded={chatOpen} aria-label={chatOpen ? 'Close study assistant' : 'Open study assistant'}>{chatOpen ? '×' : '✦'}<span>{chatOpen ? 'Close' : 'Ask Polis'}</span></button>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    </div>
  )
}

export default App
