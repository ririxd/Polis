import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'

type Theme = 'light' | 'dark'
type Widget = 'subjects' | 'deadlines' | 'activity' | 'goals' | 'stats'
type Modal = 'settings' | 'profile' | 'search' | 'notifications' | 'deadline' | 'assignment' | 'timer' | 'week' | 'courses' | 'activity' | 'subject' | 'workspace' | 'add-subject' | 'calendar-event' | 'routine' | null

type Subject = { id?: number; name: string; code: string; grade: string; progress: number; color: string; next: string }
type Deadline = { title: string; subject: string; date: string; tone: string }
type Activity = { icon: string; title: string; detail: string; time: string; tone: string }
type Profile = { name: string; term: string; year: string }
type Goal = { id: number; title: string; completed: number }
type Material = { id: number; subject_id: number; title: string; kind: string; url: string; folder: string; tags: string; favorite: number }
type Note = { id: number; subject_id: number; title: string; content: string; format: string; folder: string; tags: string; favorite: number }
type Annotation = { id: number; subject_id: number; note_id: number | null; quote: string; comment: string; color: string }
type DocumentRecord = { id: number; subject_id: number | null; name: string; file_type: string; size: number; extracted_text: string; folder: string; tags: string }
const activity: Activity[] = []

const initialWidgets: Record<Widget, boolean> = {
  subjects: true,
  deadlines: true,
  activity: true,
  goals: true,
  stats: true,
}

function App() {
  const [theme, setTheme] = useState<Theme>('light')
  const [activeNav, setActiveNav] = useState('Overview')
  const [showCustomizer, setShowCustomizer] = useState(false)
  const [widgets, setWidgets] = useState(initialWidgets)
  const [profile, setProfile] = useState<Profile>({ name: '', term: '', year: '' })
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
  const [subjectItems, setSubjectItems] = useState<Subject[]>([])
  const [newSubject, setNewSubject] = useState({ name: '', code: '', grade: 'A', progress: 0 })
  const [selectedDate, setSelectedDate] = useState(1)
  const [calendarEvents, setCalendarEvents] = useState<{ title: string; date: number; type: string; time: string }[]>([])
  const [newEvent, setNewEvent] = useState({ title: '', type: 'Event', time: '09:00' })
  const [timerSeconds, setTimerSeconds] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(false)

  const [toast, setToast] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deadlineItems, setDeadlineItems] = useState<Deadline[]>([])
  const [newDeadline, setNewDeadline] = useState({ title: '', subject: '', date: '' })
  const gradePoints: Record<string, number> = { A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, C: 2 }
  const averageProgress = subjectItems.length ? Math.round(subjectItems.reduce((sum, subject) => sum + subject.progress, 0) / subjectItems.length) : 0
  const averageGpa = subjectItems.length ? (subjectItems.reduce((sum, subject) => sum + (gradePoints[subject.grade] || 0), 0) / subjectItems.length).toFixed(1) : '—'
  const completedGoalCount = goals.filter((goal) => Boolean(goal.completed)).length
  const timerMinutes = Math.floor(timerSeconds / 60).toString().padStart(2, '0')
  const timerRemainder = (timerSeconds % 60).toString().padStart(2, '0')

  const visibleWidgetCount = useMemo(() => Object.values(widgets).filter(Boolean).length, [widgets])

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
    showToast(`${item} view selected`)
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
    const added: Subject = { ...newSubject, name: newSubject.name.trim(), code: newSubject.code.trim().toUpperCase(), next: 'Set your next milestone', color: colors[subjectItems.length % colors.length] }
    fetch('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(added) }).then((response) => response.json()).then((savedSubject) => setSubjectItems((current) => [...current, savedSubject])).catch(() => showToast('Could not save subject'))
    setNewSubject({ name: '', code: '', grade: 'A', progress: 0 })
    setModal(null)
    showToast(`${added.name} added to your courses`)
  }

  const addCalendarEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newEvent.title.trim()) return
    fetch('/api/calendar-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newEvent, title: newEvent.title.trim(), date: selectedDate }) }).then((response) => response.json()).then((savedEvent) => setCalendarEvents((current) => [...current, savedEvent])).catch(() => showToast('Could not save calendar event'))
    setNewEvent({ title: '', type: 'Event', time: '09:00' })
    setModal(null)
    showToast(`${newEvent.type} added for November ${selectedDate}`)
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
    Promise.all([
      fetch('/api/subjects').then((response) => response.json()),
      fetch('/api/deadlines').then((response) => response.json()),
      fetch('/api/calendar-events').then((response) => response.json()),
      fetch('/api/profile').then((response) => response.json()),
      fetch('/api/goals').then((response) => response.json()),
    ]).then(([loadedSubjects, loadedDeadlines, loadedEvents, loadedProfile, loadedGoals]) => {
      setSubjectItems(loadedSubjects)
      setDeadlineItems(loadedDeadlines)
      setCalendarEvents(loadedEvents)
      setProfile(loadedProfile)
      setGoals(loadedGoals)
    }).catch(() => showToast('Could not connect to the local database'))
  }, [])

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
        <div className="brand"><span className="brand-mark">P</span><span>polis</span></div>
        <div className="profile-card"><div className="avatar">{profile.name ? profile.name.slice(0, 2).toUpperCase() : '?'}</div><div><strong>{profile.name || 'Set up profile'}</strong><span>{profile.term || 'Add your academic details'}</span></div><button className="more-button" onClick={() => setModal('profile')} aria-label="Edit profile">•••</button></div>
        <nav className="nav-list" aria-label="Main navigation">
          {['Overview', 'My courses', 'Calendar', 'Insights'].map((item) => <button key={item} className={activeNav === item ? 'nav-item active' : 'nav-item'} onClick={() => openNav(item)}><span className="nav-icon">{item === 'Overview' ? '⌂' : item === 'My courses' ? '▤' : item === 'Calendar' ? '□' : '⌁'}</span>{item}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setModal('settings')}><span className="nav-icon">⚙</span>Settings</button>
          <span className="version">polis v1.0 · all access</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Academic space</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search" onClick={() => setModal('search')}>⌕</button><button className="icon-button" aria-label="Notifications" onClick={() => setModal('notifications')}>♢<span className="notification-dot" /></button><button className="theme-toggle" onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); showToast(`${theme === 'light' ? 'Dark' : 'Light'} mode enabled`) }} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? '☾' : '☀'}</button><button className="mini-avatar" onClick={() => setModal('profile')} aria-label="Open profile">{profile.name ? profile.name.slice(0, 2).toUpperCase() : '?'}</button></div></header>
        <section className="welcome-row"><div><p className="eyebrow">SUNDAY, NOVEMBER 1, 2026 · WEEK 10</p><h1>{profile.name ? `Good morning, ${profile.name}` : 'Build your academic dashboard'} <span>✦</span></h1><p className="intro">{profile.name ? 'Your academic picture will update as you add progress.' : 'Add your profile and first subject to get started.'}</p></div><div className="welcome-actions"><button className="customize-button" onClick={() => setShowCustomizer(!showCustomizer)}>☷ Customize</button><button className="date-button" onClick={() => setModal('week')}>This week <span>⌄</span></button></div></section>

        {showCustomizer && <section className="customizer"><div><strong>Dashboard widgets</strong><span>Choose what you want to see.</span></div><div className="widget-options">{(Object.keys(widgets) as Widget[]).map((widget) => <label key={widget}><input type="checkbox" checked={widgets[widget]} onChange={() => toggleWidget(widget)} />{widget}</label>)}</div></section>}

        {activeNav === 'Overview' && <>
        <section className="overview-banner"><div><p className="eyebrow">ACADEMIC OVERVIEW</p><h2>{subjectItems.length ? 'Your semester at a glance.' : 'Your academic overview starts here.'}</h2><p>{subjectItems.length} subject{subjectItems.length === 1 ? '' : 's'} added <span>·</span> GPA {averageGpa} <span>·</span> {averageProgress}% average progress</p></div><div className="semester-ring"><strong>{averageProgress}%</strong><span>progress</span></div></section>

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

        {activeNav === 'Calendar' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">NOVEMBER 2026</p><h1>Academic calendar</h1><p className="intro">Select any date to schedule an event, reminder, or study session.</p></div><button className="primary-button" onClick={() => { setSelectedDate(1); setModal('calendar-event') }}>+ Add event</button></div><div className="calendar-layout"><div className="calendar-card"><div className="calendar-header"><button onClick={() => showToast('Previous month is not available in this demo')}>←</button><strong>November 2026</strong><button onClick={() => showToast('Next month is not available in this demo')}>→</button></div><div className="calendar-days">{['S','M','T','W','T','F','S'].map((day, index) => <span className="calendar-weekday" key={`${day}-${index}`}>{day}</span>)}{Array.from({ length: 30 }, (_, index) => { const date = index + 1; const hasEvent = calendarEvents.some((item) => item.date === date); return <button className={date === selectedDate ? 'calendar-day selected' : 'calendar-day'} key={date} onClick={() => { setSelectedDate(date); setModal('calendar-event') }}>{date}{hasEvent && <i className="calendar-event-dot" />}</button> })}</div></div><div className="calendar-agenda"><p className="eyebrow">UPCOMING</p><h2>Deadlines & events</h2>{deadlineItems.map((deadline) => <div className="agenda-item" key={deadline.title}><span>{deadline.date}</span><div><strong>{deadline.title}</strong><small>{deadline.subject}</small></div></div>)}{calendarEvents.map((calendarEvent, index) => <div className="agenda-item" key={`${calendarEvent.title}-${index}`}><span>Nov {calendarEvent.date}</span><div><strong>{calendarEvent.title}</strong><small>{calendarEvent.type} · {calendarEvent.time}</small></div></div>)}</div></div></section>}

        {activeNav === 'Insights' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">YOUR PROGRESS</p><h1>Academic insights</h1><p className="intro">Live metrics based only on the data you add.</p></div><button className="date-button" onClick={() => showToast('Insights are calculated from your current records')}>Live data <span>⌄</span></button></div><div className="insight-grid"><article className="insight-highlight"><p className="eyebrow">CURRENT GPA</p><strong>{averageGpa}</strong><span>{subjectItems.length ? `${subjectItems.length} subject${subjectItems.length === 1 ? '' : 's'} tracked` : 'Add subjects to calculate GPA'}</span><div className="insight-line"><i style={{ width: `${subjectItems.length ? Math.min(Number(averageGpa) * 25, 100) : 0}%` }} /></div></article><article className="insight-highlight"><p className="eyebrow">AVERAGE PROGRESS</p><strong>{averageProgress}%</strong><span>{subjectItems.length ? 'Across your subjects' : 'Add subjects to track progress'}</span><div className="insight-line green"><i style={{ width: `${averageProgress}%` }} /></div></article><article className="insight-chart"><p className="eyebrow">ACADEMIC RECORDS</p><h2>{subjectItems.length + deadlineItems.length + calendarEvents.length} items tracked</h2><div className="empty-state">{subjectItems.length || deadlineItems.length || calendarEvents.length ? 'Your overview updates automatically when records change.' : 'Add a subject, deadline, or event to start seeing insights.'}</div></article></div><div className="insight-note"><span>✦</span><div><strong>{subjectItems.length ? 'Keep building your academic picture.' : 'Your insights are ready when you are.'}</strong><p>All metrics on this page are derived from your current subjects, progress, deadlines, and calendar events. No placeholder data is shown.</p></div></div></section>}
        <footer><span>Built for a life of intention.</span><span>Need a hand? <button className="footer-link" onClick={() => showToast('Guide coming soon — your dashboard is ready to explore.')}>Visit the guide</button></span></footer>

        {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="modal" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button>
          {modal === 'search' && <><p className="eyebrow">FIND ANYTHING</p><h2>Search your academic space</h2><input className="modal-input" autoFocus placeholder="Search courses, deadlines, activity..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><div className="search-results">{searchQuery && (searchResults.length ? searchResults.map((result) => <button key={result} onClick={() => { setModal(null); showToast(`Opened ${result}`) }}>{result}<span>→</span></button>) : <p>No matching items found.</p>)}</div></>}
          {modal === 'notifications' && <><p className="eyebrow">UPDATES</p><h2>Notifications</h2><div className="modal-list"><div><strong>Calculus problem set is due tomorrow.</strong><span>Plan a little time today to finish it.</span></div><div><strong>Your design draft was uploaded.</strong><span>Everything is ready for the next critique.</span></div></div><button className="modal-primary" onClick={() => { setModal(null); showToast('Notifications marked as read') }}>Mark all as read</button></>}
          {modal === 'settings' && <><p className="eyebrow">PERSONALIZE</p><h2>Settings</h2><div className="settings-list"><label>Theme <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? 'Light' : 'Dark'} ↔</button></label><label>Weekly digest <input type="checkbox" defaultChecked /></label><label>Deadline reminders <input type="checkbox" defaultChecked /></label></div><button className="modal-primary" onClick={() => { setModal(null); showToast('Settings saved') }}>Done</button></>}
          {modal === 'profile' && <form onSubmit={saveProfile}><p className="eyebrow">YOUR ACCOUNT</p><h2>Edit profile</h2><input className="modal-input" required placeholder="Your name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /><input className="modal-input" placeholder="Term (e.g. Fall 2026)" value={profile.term} onChange={(event) => setProfile({ ...profile, term: event.target.value })} /><input className="modal-input" placeholder="Year or program" value={profile.year} onChange={(event) => setProfile({ ...profile, year: event.target.value })} /><button className="modal-primary" type="submit">Save profile</button></form>}
          {modal === 'routine' && <><p className="eyebrow">PERSONALIZE</p><h2>Customize routine</h2><form onSubmit={addGoal} className="inline-form"><input className="modal-input" required placeholder="Add a study goal" value={newGoal} onChange={(event) => setNewGoal(event.target.value)} /><button className="modal-primary" type="submit">Add goal</button></form><div className="modal-list">{goals.map((goal) => <div key={goal.id}><strong>{goal.title}<button className="delete-goal" onClick={() => { fetch(`/api/goals/${goal.id}`, { method: 'DELETE' }); setGoals((current) => current.filter((item) => item.id !== goal.id)) }}>Remove</button></strong><span>{goal.completed ? 'Completed' : 'Not completed'}</span></div>)}</div></>}
          {modal === 'week' && <><p className="eyebrow">DATE RANGE</p><h2>Plan your study week</h2><div className="range-options">{['This week', 'Next week', 'This month'].map((range) => <button key={range} onClick={() => { setModal(null); showToast(`${range} selected`) }}>{range}<span>→</span></button>)}</div></>}
          {modal === 'courses' && <><p className="eyebrow">MY COURSES</p><h2>All subjects</h2><div className="modal-list">{subjectItems.map((subject) => <div key={subject.name}><strong>{subject.name} <em>{subject.grade}</em></strong><span>{subject.code} · {subject.progress}% complete</span></div>)}</div></>}
          {modal === 'subject' && selectedSubject && <><p className="eyebrow">{selectedSubject.code}</p><div className="subject-modal-title"><div className={`subject-icon ${selectedSubject.color}`}>{selectedSubject.name.charAt(0)}</div><h2>{selectedSubject.name}</h2><span className="grade">{selectedSubject.grade}</span></div><div className="subject-detail-progress"><div><strong>{selectedSubject.progress}%</strong><span>course progress</span></div><div className="large-progress"><span className={selectedSubject.color} style={{ width: `${selectedSubject.progress}%` }} /></div></div><form className="progress-editor" onSubmit={updateSubjectProgress}><label>Update progress<input className="modal-input" name="progress" type="number" min="0" max="100" defaultValue={selectedSubject.progress} /></label><button className="modal-primary" type="submit">Save progress</button></form><div className="detail-grid"><div><span>Next milestone</span><strong>{selectedSubject.next}</strong></div><div><span>Current grade</span><strong>{selectedSubject.grade}</strong></div><div><span>Study sessions</span><strong>—</strong></div><div><span>Time invested</span><strong>—</strong></div></div><button className="modal-primary" onClick={() => openWorkspace(selectedSubject)}>Open academic workspace</button></>}
          {modal === 'workspace' && selectedSubject && <div className="workspace-modal"><div className="workspace-heading"><div><p className="eyebrow">{selectedSubject.code} · ACADEMIC WORKSPACE</p><h2>{selectedSubject.name}</h2></div><div className="workspace-heading-actions"><input className="workspace-search" placeholder="Search workspace" value={workspaceSearch} onChange={(event) => setWorkspaceSearch(event.target.value)} /><button className="workspace-export" onClick={() => window.print()}>Export PDF</button></div></div><div className="workspace-tabs">{(['notes', 'materials', 'documents', 'annotations'] as const).map((tab) => <button className={workspaceTab === tab ? 'active' : ''} key={tab} onClick={() => setWorkspaceTab(tab)}>{tab}</button>)}</div>{workspaceTab === 'notes' && <div className="workspace-content"><aside className="workspace-sidebar"><button className="modal-primary" onClick={createNote}>+ New note</button>{notes.filter((note) => `${note.title} ${note.tags}`.toLowerCase().includes(workspaceSearch.toLowerCase())).map((note) => <button className={selectedNote?.id === note.id ? 'selected-note' : ''} onClick={() => setSelectedNote(note)} key={note.id}>{note.title || 'Untitled note'}<small>{note.tags || 'No tags'}</small></button>)}</aside><div className="note-editor">{selectedNote ? <><input className="note-title-input" value={selectedNote.title} onChange={(event) => setSelectedNote({ ...selectedNote, title: event.target.value })} onBlur={() => saveNote(selectedNote)} /><div className="editor-tools"><span>Markdown / rich text</span><button onClick={() => saveNote(selectedNote)}>Save now</button></div><textarea className="note-textarea" placeholder="Write notes, definitions, and key concepts..." value={selectedNote.content} onChange={(event) => setSelectedNote({ ...selectedNote, content: event.target.value })} onBlur={() => saveNote({ ...selectedNote, content: selectedNote.content })} /><input className="modal-input" placeholder="Tags, comma separated" value={selectedNote.tags} onChange={(event) => setSelectedNote({ ...selectedNote, tags: event.target.value })} onBlur={() => saveNote({ ...selectedNote, tags: selectedNote.tags })} /></> : <div className="empty-state">Create a note to start your workspace.</div>}</div></div>}{workspaceTab === 'materials' && <div className="workspace-content single-column"><form className="workspace-form" onSubmit={addMaterial}><h3>Add study material</h3><input className="modal-input" name="title" required placeholder="Material title" /><select className="modal-input" name="kind"><option>Link</option><option>Book</option><option>Reading</option><option>Video</option></select><input className="modal-input" name="url" placeholder="URL or reference" /><div className="form-row"><input className="modal-input" name="folder" placeholder="Folder" /><input className="modal-input" name="tags" placeholder="Tags" /></div><button className="modal-primary" type="submit">Save material</button></form><div className="library-list">{materials.filter((item) => `${item.title} ${item.tags}`.toLowerCase().includes(workspaceSearch.toLowerCase())).map((material) => <div key={material.id}><strong>{material.title}</strong><span>{material.kind} · {material.folder || 'Unfiled'} · {material.tags || 'No tags'}</span></div>)}</div></div>}{workspaceTab === 'documents' && <div className="workspace-content single-column"><label className="upload-dropzone">Upload PDF, DOCX, PPTX, TXT, or Markdown<input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.markdown" onChange={importDocument} /></label><div className="library-list">{documents.map((document) => <div key={document.id}><strong>{document.name}</strong><span>{document.file_type} · {Math.ceil(document.size / 1024)} KB {document.extracted_text ? '· text extracted' : '· preview metadata saved'}</span></div>)}</div></div>}{workspaceTab === 'annotations' && <div className="workspace-content single-column"><form className="workspace-form" onSubmit={addAnnotation}><h3>Highlight a key concept</h3><textarea className="modal-input" name="quote" required placeholder="Paste the passage or concept to highlight" /><textarea className="modal-input" name="comment" placeholder="Add your annotation or explanation" /><select className="modal-input" name="color"><option>yellow</option><option>blue</option><option>green</option><option>pink</option></select><button className="modal-primary" type="submit">Save annotation</button></form><div className="library-list">{annotations.map((annotation) => <div key={annotation.id}><strong>{annotation.quote}</strong><span>{annotation.comment || 'No comment'} · {annotation.color}</span></div>)}</div></div>}</div>}
          {modal === 'add-subject' && <form onSubmit={addSubject}><p className="eyebrow">MY COURSES</p><h2>Add a subject</h2><input className="modal-input" required placeholder="Subject name" value={newSubject.name} onChange={(event) => setNewSubject({ ...newSubject, name: event.target.value })} /><input className="modal-input" required placeholder="Course code (e.g. BIO 120)" value={newSubject.code} onChange={(event) => setNewSubject({ ...newSubject, code: event.target.value })} /><div className="form-row"><label>Starting progress<input className="modal-input" type="number" min="0" max="100" value={newSubject.progress} onChange={(event) => setNewSubject({ ...newSubject, progress: Number(event.target.value) })} /></label><label>Current grade<select className="modal-input" value={newSubject.grade} onChange={(event) => setNewSubject({ ...newSubject, grade: event.target.value })}><option>A</option><option>A-</option><option>B+</option><option>B</option></select></label></div><button className="modal-primary" type="submit">Add subject</button></form>}
          {modal === 'calendar-event' && <form onSubmit={addCalendarEvent}><p className="eyebrow">NOVEMBER 2026 · DATE {selectedDate}</p><h2>Plan for November {selectedDate}</h2><input className="modal-input" required autoFocus placeholder="Event or reminder title" value={newEvent.title} onChange={(event) => setNewEvent({ ...newEvent, title: event.target.value })} /><div className="form-row"><label>Type<select className="modal-input" value={newEvent.type} onChange={(event) => setNewEvent({ ...newEvent, type: event.target.value })}><option>Event</option><option>Reminder</option><option>Study session</option><option>Exam</option></select></label><label>Time<input className="modal-input" type="time" value={newEvent.time} onChange={(event) => setNewEvent({ ...newEvent, time: event.target.value })} /></label></div><button className="modal-primary" type="submit">Save to calendar</button></form>}
          {modal === 'deadline' && <form onSubmit={addDeadline}><p className="eyebrow">PLAN AHEAD</p><h2>Add a deadline</h2><input className="modal-input" required placeholder="Assignment or exam name" value={newDeadline.title} onChange={(event) => setNewDeadline({ ...newDeadline, title: event.target.value })} /><input className="modal-input" required placeholder="Course code" value={newDeadline.subject} onChange={(event) => setNewDeadline({ ...newDeadline, subject: event.target.value })} /><input className="modal-input" required type="date" value={newDeadline.date} onChange={(event) => setNewDeadline({ ...newDeadline, date: event.target.value })} /><button className="modal-primary" type="submit">Add deadline</button></form>}
          {modal === 'assignment' && <form onSubmit={(event) => { event.preventDefault(); setModal(null); showToast('Assignment added to your plan') }}><p className="eyebrow">QUICK ACTION</p><h2>Add an assignment</h2><input className="modal-input" required placeholder="What do you need to do?" /><select className="modal-input" defaultValue=""><option value="" disabled>Choose a course</option>{subjectItems.map((subject) => <option key={subject.code}>{subject.code}</option>)}</select><button className="modal-primary" type="submit">Save assignment</button></form>}
          {modal === 'timer' && <><p className="eyebrow">FOCUS MODE</p><h2>Focus timer</h2><div className={`timer-display ${timerSeconds === 0 ? 'timer-complete' : ''}`}>{timerMinutes}:{timerRemainder}</div><p className="modal-copy">{timerSeconds === 0 ? 'Your focus session is complete.' : timerRunning ? 'Stay with it. You are doing good work.' : 'Settle in for a focused session.'}</p><div className="timer-controls">{timerSeconds === 0 ? <button className="modal-primary" onClick={() => setTimerSeconds(25 * 60)}>Start another session</button> : <button className="modal-primary" onClick={() => { setTimerRunning(!timerRunning); showToast(timerRunning ? 'Focus timer paused' : 'Focus timer started') }}>{timerRunning ? 'Pause timer' : 'Start timer'}</button>}<button className="timer-reset" onClick={() => { setTimerRunning(false); setTimerSeconds(25 * 60) }}>Reset</button></div><p className="timer-note">A chime will play when the timer reaches zero.</p></>}
          {modal === 'activity' && <><p className="eyebrow">YOUR MOMENTUM</p><h2>Recent activity</h2><div className="modal-list">{activity.map((item) => <div key={item.title}><strong>{item.title}</strong><span>{item.detail} · {item.time}</span></div>)}</div></>}
        </section></div>}
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    </div>
  )
}

export default App
