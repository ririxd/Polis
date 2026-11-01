import { useMemo, useState, type FormEvent } from 'react'
import './App.css'

type Theme = 'light' | 'dark'
type Widget = 'subjects' | 'deadlines' | 'activity' | 'goals' | 'stats'
type Modal = 'settings' | 'profile' | 'search' | 'notifications' | 'deadline' | 'assignment' | 'timer' | 'week' | 'courses' | 'activity' | 'subject' | 'add-subject' | 'calendar-event' | null
type Subject = typeof subjects[number]

const subjects = [
  { name: 'Calculus II', code: 'MATH 204', progress: 82, grade: 'A-', color: 'violet', next: 'Problem set 6' },
  { name: 'World History', code: 'HIST 110', progress: 68, grade: 'B+', color: 'terracotta', next: 'Reading response' },
  { name: 'Cognitive Science', code: 'COGS 201', progress: 91, grade: 'A', color: 'sage', next: 'Lab reflection' },
  { name: 'Digital Design', code: 'DES 150', progress: 74, grade: 'A-', color: 'blue', next: 'Portfolio critique' },
]

const deadlines = [
  { title: 'Calculus problem set 6', subject: 'MATH 204', date: 'Tomorrow', tone: 'urgent' },
  { title: 'Reading response: Ch. 8', subject: 'HIST 110', date: 'Nov 04', tone: 'normal' },
  { title: 'Cognitive science lab', subject: 'COGS 201', date: 'Nov 07', tone: 'normal' },
]

const activity = [
  { icon: '✓', title: 'Completed Calculus II quiz', detail: 'Scored 18 / 20', time: '34 min ago', tone: 'violet' },
  { icon: '▰', title: 'Uploaded design draft', detail: 'Digital Design', time: 'Yesterday', tone: 'blue' },
  { icon: '◷', title: 'Studied at the library', detail: '1h 45m focus session', time: 'Yesterday', tone: 'terracotta' },
]

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
  const [completedGoals, setCompletedGoals] = useState<string[]>(['Review lecture notes'])
  const [modal, setModal] = useState<Modal>(null)
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [subjectItems, setSubjectItems] = useState<Subject[]>(subjects)
  const [newSubject, setNewSubject] = useState({ name: '', code: '', grade: 'A', progress: 0 })
  const [selectedDate, setSelectedDate] = useState(1)
  const [calendarEvents, setCalendarEvents] = useState<{ title: string; date: number; type: string; time: string }[]>([])
  const [newEvent, setNewEvent] = useState({ title: '', type: 'Event', time: '09:00' })
  const [toast, setToast] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deadlineItems, setDeadlineItems] = useState(deadlines)
  const [newDeadline, setNewDeadline] = useState({ title: '', subject: '', date: '' })

  const visibleWidgetCount = useMemo(() => Object.values(widgets).filter(Boolean).length, [widgets])

  const toggleWidget = (widget: Widget) => {
    if (widgets[widget] && visibleWidgetCount === 1) return
    setWidgets((current) => ({ ...current, [widget]: !current[widget] }))
  }

  const toggleGoal = (goal: string) => {
    setCompletedGoals((current) => current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal])
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
    setDeadlineItems((current) => [...current, { ...newDeadline, tone: 'normal' }])
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
    setSubjectItems((current) => [...current, added])
    setNewSubject({ name: '', code: '', grade: 'A', progress: 0 })
    setModal(null)
    showToast(`${added.name} added to your courses`)
  }

  const addCalendarEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newEvent.title.trim()) return
    setCalendarEvents((current) => [...current, { ...newEvent, title: newEvent.title.trim(), date: selectedDate }])
    setNewEvent({ title: '', type: 'Event', time: '09:00' })
    setModal(null)
    showToast(`${newEvent.type} added for November ${selectedDate}`)
  }

  return (
    <div className={`app-shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">P</span><span>polis</span></div>
        <div className="profile-card"><div className="avatar">JD</div><div><strong>Jamie Davis</strong><span>Spring 2026 · Year 2</span></div><button className="more-button" aria-label="Profile options">•••</button></div>
        <nav className="nav-list" aria-label="Main navigation">
          {['Overview', 'My courses', 'Calendar', 'Insights'].map((item) => <button key={item} className={activeNav === item ? 'nav-item active' : 'nav-item'} onClick={() => openNav(item)}><span className="nav-icon">{item === 'Overview' ? '⌂' : item === 'My courses' ? '▤' : item === 'Calendar' ? '□' : '⌁'}</span>{item}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setModal('settings')}><span className="nav-icon">⚙</span>Settings</button>
          <span className="version">polis v1.0 · all access</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Academic space</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search" onClick={() => setModal('search')}>⌕</button><button className="icon-button" aria-label="Notifications" onClick={() => setModal('notifications')}>♢<span className="notification-dot" /></button><button className="theme-toggle" onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); showToast(`${theme === 'light' ? 'Dark' : 'Light'} mode enabled`) }} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? '☾' : '☀'}</button><button className="mini-avatar" onClick={() => setModal('profile')} aria-label="Open profile">JD</button></div></header>
        <section className="welcome-row"><div><p className="eyebrow">SUNDAY, NOVEMBER 1, 2026 · WEEK 10</p><h1>Good morning, Jamie <span>✦</span></h1><p className="intro">You are making steady progress. Here is your academic picture.</p></div><div className="welcome-actions"><button className="customize-button" onClick={() => setShowCustomizer(!showCustomizer)}>☷ Customize</button><button className="date-button" onClick={() => setModal('week')}>This week <span>⌄</span></button></div></section>

        {showCustomizer && <section className="customizer"><div><strong>Dashboard widgets</strong><span>Choose what you want to see.</span></div><div className="widget-options">{(Object.keys(widgets) as Widget[]).map((widget) => <label key={widget}><input type="checkbox" checked={widgets[widget]} onChange={() => toggleWidget(widget)} />{widget}</label>)}</div></section>}

        {activeNav === 'Overview' && <>
        <section className="overview-banner"><div><p className="eyebrow">ACADEMIC OVERVIEW</p><h2>One clear view of your semester.</h2><p>18 credits enrolled <span>·</span> 3.6 current GPA <span>·</span> 42% of semester complete</p></div><div className="semester-ring"><strong>42%</strong><span>semester</span></div></section>

        {widgets.subjects && <section className="section-block"><div className="section-title"><div><p className="eyebrow">YOUR COURSES</p><h2>Subject progress</h2></div><button className="text-button" onClick={() => openNav('My courses')}>View all <span>→</span></button></div><div className="subject-grid">{subjectItems.map((subject) => <article className="subject-card clickable-card" key={subject.name} onClick={() => { setSelectedSubject(subject); setModal('subject') }}><div className="subject-top"><div className={`subject-icon ${subject.color}`}>{subject.name.charAt(0)}</div><span className="grade">{subject.grade}</span></div><span className="course-code">{subject.code}</span><h3>{subject.name}</h3><div className="progress-meta"><span>{subject.progress}% complete</span><span>Next: {subject.next}</span></div><div className="subject-progress"><span className={subject.color} style={{ width: `${subject.progress}%` }} /></div><button className="card-link" onClick={(event) => { event.stopPropagation(); setSelectedSubject(subject); setModal('subject') }}>View progress →</button></article>)}</div></section>}

        <div className="dashboard-grid">
          {widgets.deadlines && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">PLAN AHEAD</p><h2>Upcoming deadlines</h2></div><button className="text-button" onClick={() => openNav('Calendar')}>Calendar <span>→</span></button></div><div className="deadline-list">{deadlineItems.map((deadline) => <div className="deadline-row" key={deadline.title}><div className={`deadline-dot ${deadline.tone}`} /><div><strong>{deadline.title}</strong><span>{deadline.subject}</span></div><time className={deadline.tone}>{deadline.date}</time></div>)}</div><button className="add-task" onClick={() => setModal('deadline')}>+ Add deadline</button></section>}
          {widgets.goals && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">TODAY'S ROUTINE</p><h2>Daily study goals</h2></div><span className="plan-count">{completedGoals.length} / 3</span></div><div className="task-list">{['Review lecture notes', 'Complete problem set', 'Read for 30 minutes'].map((goal) => <label className={completedGoals.includes(goal) ? 'task done' : 'task'} key={goal}><input type="checkbox" checked={completedGoals.includes(goal)} onChange={() => toggleGoal(goal)} /><span>{goal}</span></label>)}</div><div className="goal-progress"><span style={{ width: `${(completedGoals.length / 3) * 100}%` }} /></div><p className="goal-caption">{completedGoals.length === 3 ? 'All goals complete — great work.' : `${3 - completedGoals.length} goal${3 - completedGoals.length === 1 ? '' : 's'} left for today`}</p></section>}
        </div>

        <div className="quick-stats-grid">
          {widgets.stats && <section className="panel quick-actions"><div className="panel-heading"><div><p className="eyebrow">SHORTCUTS</p><h2>Quick actions</h2></div></div><div className="action-grid"><button onClick={() => setModal('assignment')}><span>＋</span>Add assignment</button><button onClick={() => setModal('timer')}><span>◷</span>Start focus timer</button><button onClick={() => openNav('Calendar')}><span>▤</span>Plan my week</button></div></section>}
          {widgets.stats && <section className="panel study-stats"><div className="panel-heading"><div><p className="eyebrow">YOUR RHYTHM</p><h2>Study statistics</h2></div><span className="stat-change">↑ 18%</span></div><div className="stat-row"><div><strong>14h 35m</strong><span>Study time this week</span></div><div className="mini-bars">{[38, 55, 42, 75, 58, 84, 66].map((height, index) => <i key={index} style={{ height: `${height}%` }} className={index === 5 ? 'today' : ''} />)}</div></div><div className="stat-summary"><span><strong>6</strong> sessions</span><span><strong>87%</strong> focus score</span><span><strong>4</strong> day streak</span></div></section>}
        </div>

        {widgets.activity && <section className="section-block activity-section"><div className="section-title"><div><p className="eyebrow">YOUR MOMENTUM</p><h2>Recent activity</h2></div><button className="text-button" onClick={() => setModal('activity')}>View all <span>→</span></button></div><div className="activity-list">{activity.map((item) => <div className="activity-row" key={item.title}><div className={`activity-icon ${item.tone}`}>{item.icon}</div><div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><time>{item.time}</time></div>)}</div></section>}
        </>}

        {activeNav === 'My courses' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">ACADEMIC SPACE</p><h1>My courses</h1><p className="intro">Track every subject, milestone, and next step in one place.</p></div><button className="primary-button" onClick={() => setModal('add-subject')}>+ Add subject</button></div><div className="course-page-grid">{subjectItems.map((subject) => <article className="course-large-card" key={subject.name} onClick={() => { setSelectedSubject(subject); setModal('subject') }}><div className={`subject-icon ${subject.color}`}>{subject.name.charAt(0)}</div><div className="course-large-info"><span className="course-code">{subject.code}</span><h2>{subject.name}</h2><p>Next milestone: {subject.next}</p><div className="subject-progress"><span className={subject.color} style={{ width: `${subject.progress}%` }} /></div><small>{subject.progress}% complete</small></div><strong className="large-grade">{subject.grade}</strong></article>)}</div></section>}

        {activeNav === 'Calendar' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">NOVEMBER 2026</p><h1>Academic calendar</h1><p className="intro">Select any date to schedule an event, reminder, or study session.</p></div><button className="primary-button" onClick={() => { setSelectedDate(1); setModal('calendar-event') }}>+ Add event</button></div><div className="calendar-layout"><div className="calendar-card"><div className="calendar-header"><button onClick={() => showToast('Previous month is not available in this demo')}>←</button><strong>November 2026</strong><button onClick={() => showToast('Next month is not available in this demo')}>→</button></div><div className="calendar-days">{['S','M','T','W','T','F','S'].map((day, index) => <span className="calendar-weekday" key={`${day}-${index}`}>{day}</span>)}{Array.from({ length: 30 }, (_, index) => { const date = index + 1; const hasEvent = calendarEvents.some((item) => item.date === date); return <button className={date === selectedDate ? 'calendar-day selected' : 'calendar-day'} key={date} onClick={() => { setSelectedDate(date); setModal('calendar-event') }}>{date}{hasEvent && <i className="calendar-event-dot" />}</button> })}</div></div><div className="calendar-agenda"><p className="eyebrow">UPCOMING</p><h2>Deadlines & events</h2>{deadlineItems.map((deadline) => <div className="agenda-item" key={deadline.title}><span>{deadline.date}</span><div><strong>{deadline.title}</strong><small>{deadline.subject}</small></div></div>)}{calendarEvents.map((calendarEvent, index) => <div className="agenda-item" key={`${calendarEvent.title}-${index}`}><span>Nov {calendarEvent.date}</span><div><strong>{calendarEvent.title}</strong><small>{calendarEvent.type} · {calendarEvent.time}</small></div></div>)}</div></div></section>}

        {activeNav === 'Insights' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">YOUR PROGRESS</p><h1>Academic insights</h1><p className="intro">Patterns to help you study with more intention.</p></div><button className="date-button" onClick={() => showToast('Insights range set to this semester')}>This semester <span>⌄</span></button></div><div className="insight-grid"><article className="insight-highlight"><p className="eyebrow">CURRENT GPA</p><strong>3.6</strong><span>↑ 0.3 from last term</span><div className="insight-line"><i style={{ width: '78%' }} /></div></article><article className="insight-highlight"><p className="eyebrow">FOCUS SCORE</p><strong>87%</strong><span>Above your 80% target</span><div className="insight-line green"><i style={{ width: '87%' }} /></div></article><article className="insight-chart"><p className="eyebrow">STUDY HOURS</p><h2>14h 35m this week</h2><div className="large-bars">{[42,58,47,75,63,88,68].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="chart-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></article></div><div className="insight-note"><span>✦</span><div><strong>Your best study window is 9:00–11:00 AM.</strong><p>You complete 34% more focused work during this window. Consider protecting it for Calculus and other deep work.</p></div></div></section>}
        <footer><span>Built for a life of intention.</span><span>Need a hand? <button className="footer-link" onClick={() => showToast('Guide coming soon — your dashboard is ready to explore.')}>Visit the guide</button></span></footer>

        {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="modal" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button>
          {modal === 'search' && <><p className="eyebrow">FIND ANYTHING</p><h2>Search your academic space</h2><input className="modal-input" autoFocus placeholder="Search courses, deadlines, activity..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><div className="search-results">{searchQuery && (searchResults.length ? searchResults.map((result) => <button key={result} onClick={() => { setModal(null); showToast(`Opened ${result}`) }}>{result}<span>→</span></button>) : <p>No matching items found.</p>)}</div></>}
          {modal === 'notifications' && <><p className="eyebrow">UPDATES</p><h2>Notifications</h2><div className="modal-list"><div><strong>Calculus problem set is due tomorrow.</strong><span>Plan a little time today to finish it.</span></div><div><strong>Your design draft was uploaded.</strong><span>Everything is ready for the next critique.</span></div></div><button className="modal-primary" onClick={() => { setModal(null); showToast('Notifications marked as read') }}>Mark all as read</button></>}
          {modal === 'settings' && <><p className="eyebrow">PERSONALIZE</p><h2>Settings</h2><div className="settings-list"><label>Theme <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? 'Light' : 'Dark'} ↔</button></label><label>Weekly digest <input type="checkbox" defaultChecked /></label><label>Deadline reminders <input type="checkbox" defaultChecked /></label></div><button className="modal-primary" onClick={() => { setModal(null); showToast('Settings saved') }}>Done</button></>}
          {modal === 'profile' && <><p className="eyebrow">YOUR ACCOUNT</p><h2>Jamie Davis</h2><p className="modal-copy">Year 2 · Spring 2026 · 18 credits enrolled</p><button className="modal-primary" onClick={() => { setModal(null); showToast('Profile is up to date') }}>Done</button></>}
          {modal === 'week' && <><p className="eyebrow">DATE RANGE</p><h2>Plan your study week</h2><div className="range-options">{['This week', 'Next week', 'This month'].map((range) => <button key={range} onClick={() => { setModal(null); showToast(`${range} selected`) }}>{range}<span>→</span></button>)}</div></>}
          {modal === 'courses' && <><p className="eyebrow">MY COURSES</p><h2>All subjects</h2><div className="modal-list">{subjectItems.map((subject) => <div key={subject.name}><strong>{subject.name} <em>{subject.grade}</em></strong><span>{subject.code} · {subject.progress}% complete</span></div>)}</div></>}
          {modal === 'subject' && selectedSubject && <><p className="eyebrow">{selectedSubject.code}</p><div className="subject-modal-title"><div className={`subject-icon ${selectedSubject.color}`}>{selectedSubject.name.charAt(0)}</div><h2>{selectedSubject.name}</h2><span className="grade">{selectedSubject.grade}</span></div><div className="subject-detail-progress"><div><strong>{selectedSubject.progress}%</strong><span>course progress</span></div><div className="large-progress"><span className={selectedSubject.color} style={{ width: `${selectedSubject.progress}%` }} /></div></div><div className="detail-grid"><div><span>Next milestone</span><strong>{selectedSubject.next}</strong></div><div><span>Current grade</span><strong>{selectedSubject.grade}</strong></div><div><span>Study sessions</span><strong>8 this term</strong></div><div><span>Time invested</span><strong>24h 10m</strong></div></div><button className="modal-primary" onClick={() => { setModal(null); showToast(`Opened ${selectedSubject.name} workspace`) }}>Open course workspace</button></>}
          {modal === 'add-subject' && <form onSubmit={addSubject}><p className="eyebrow">MY COURSES</p><h2>Add a subject</h2><input className="modal-input" required placeholder="Subject name" value={newSubject.name} onChange={(event) => setNewSubject({ ...newSubject, name: event.target.value })} /><input className="modal-input" required placeholder="Course code (e.g. BIO 120)" value={newSubject.code} onChange={(event) => setNewSubject({ ...newSubject, code: event.target.value })} /><div className="form-row"><label>Starting progress<input className="modal-input" type="number" min="0" max="100" value={newSubject.progress} onChange={(event) => setNewSubject({ ...newSubject, progress: Number(event.target.value) })} /></label><label>Current grade<select className="modal-input" value={newSubject.grade} onChange={(event) => setNewSubject({ ...newSubject, grade: event.target.value })}><option>A</option><option>A-</option><option>B+</option><option>B</option></select></label></div><button className="modal-primary" type="submit">Add subject</button></form>}
          {modal === 'calendar-event' && <form onSubmit={addCalendarEvent}><p className="eyebrow">NOVEMBER 2026 · DATE {selectedDate}</p><h2>Plan for November {selectedDate}</h2><input className="modal-input" required autoFocus placeholder="Event or reminder title" value={newEvent.title} onChange={(event) => setNewEvent({ ...newEvent, title: event.target.value })} /><div className="form-row"><label>Type<select className="modal-input" value={newEvent.type} onChange={(event) => setNewEvent({ ...newEvent, type: event.target.value })}><option>Event</option><option>Reminder</option><option>Study session</option><option>Exam</option></select></label><label>Time<input className="modal-input" type="time" value={newEvent.time} onChange={(event) => setNewEvent({ ...newEvent, time: event.target.value })} /></label></div><button className="modal-primary" type="submit">Save to calendar</button></form>}
          {modal === 'deadline' && <form onSubmit={addDeadline}><p className="eyebrow">PLAN AHEAD</p><h2>Add a deadline</h2><input className="modal-input" required placeholder="Assignment or exam name" value={newDeadline.title} onChange={(event) => setNewDeadline({ ...newDeadline, title: event.target.value })} /><input className="modal-input" required placeholder="Course code" value={newDeadline.subject} onChange={(event) => setNewDeadline({ ...newDeadline, subject: event.target.value })} /><input className="modal-input" required type="date" value={newDeadline.date} onChange={(event) => setNewDeadline({ ...newDeadline, date: event.target.value })} /><button className="modal-primary" type="submit">Add deadline</button></form>}
          {modal === 'assignment' && <form onSubmit={(event) => { event.preventDefault(); setModal(null); showToast('Assignment added to your plan') }}><p className="eyebrow">QUICK ACTION</p><h2>Add an assignment</h2><input className="modal-input" required placeholder="What do you need to do?" /><select className="modal-input" defaultValue=""><option value="" disabled>Choose a course</option>{subjectItems.map((subject) => <option key={subject.code}>{subject.code}</option>)}</select><button className="modal-primary" type="submit">Save assignment</button></form>}
          {modal === 'timer' && <><p className="eyebrow">FOCUS MODE</p><h2>Ready for a focused session?</h2><p className="modal-copy">Start a 25-minute study session. Put your phone away and make a little progress.</p><button className="modal-primary" onClick={() => { setModal(null); showToast('Focus timer started — 25 minutes on the clock') }}>Start 25-minute timer</button></>}
          {modal === 'activity' && <><p className="eyebrow">YOUR MOMENTUM</p><h2>Recent activity</h2><div className="modal-list">{activity.map((item) => <div key={item.title}><strong>{item.title}</strong><span>{item.detail} · {item.time}</span></div>)}</div></>}
        </section></div>}
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    </div>
  )
}

export default App
