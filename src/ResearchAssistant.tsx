import { useEffect, useMemo, useState, type FormEvent } from 'react'

type ResearchProject = { id: number; title: string; research_question: string; thesis: string; outline: string[] }
type SourceMetadata = {
  authors?: string
  year?: string
  kind?: 'journal' | 'book' | 'report' | 'web'
  container?: string
  publisher?: string
  volume?: string
  issue?: string
  pages?: string
  literature?: { summary?: string; methodology?: string; findings?: string; limitations?: string }
}
type ResearchSource = { id: number; project_id: number | null; title: string; url: string; doi: string; citation: string; notes: string; metadata: SourceMetadata }
type Tab = 'projects' | 'sources' | 'citation' | 'literature' | 'bibliography'
type SourceDraft = { authors: string; year: string; title: string; kind: NonNullable<SourceMetadata['kind']>; container: string; publisher: string; volume: string; issue: string; pages: string; doi: string; url: string; notes: string }

const emptySource: SourceDraft = { authors: '', year: '', title: '', kind: 'journal', container: '', publisher: '', volume: '', issue: '', pages: '', doi: '', url: '', notes: '' }
const tabs: { id: Tab; label: string }[] = [
  { id: 'projects', label: 'Projects' }, { id: 'sources', label: 'Source library' },
  { id: 'citation', label: 'APA 7 citation' }, { id: 'literature', label: 'Literature review' },
  { id: 'bibliography', label: 'Bibliography' },
]

function apaCitation(source: SourceDraft) {
  const authors = source.authors.split(';').map((author) => author.trim()).filter(Boolean)
  const authorText = (authors.length > 1 ? `${authors.slice(0, -1).join(', ')}, & ${authors.at(-1)}` : authors[0])?.replace(/\.+$/, '')
  const year = source.year.trim() || 'n.d.'
  const title = source.title.trim() || 'Untitled work'
  const doiOrUrl = source.doi.trim() ? `https://doi.org/${source.doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : source.url.trim()
  const yearTitle = authorText ? `${authorText}. (${year}). ${title}.` : `${title}. (${year}).`
  if (source.kind === 'journal') {
    const volume = source.volume ? `, ${source.volume}${source.issue ? `(${source.issue})` : ''}` : ''
    const pages = source.pages ? `, ${source.pages}` : ''
    return `${yearTitle}${source.container ? ` ${source.container}${volume}${pages}.` : ''}${doiOrUrl ? ` ${doiOrUrl}` : ''}`.trim()
  }
  if (source.kind === 'book') return `${yearTitle}${source.publisher ? ` ${source.publisher}.` : ''}${doiOrUrl ? ` ${doiOrUrl}` : ''}`.trim()
  if (source.kind === 'report') return `${yearTitle}${source.publisher ? ` ${source.publisher}.` : ''}${doiOrUrl ? ` ${doiOrUrl}` : ''}`.trim()
  return `${yearTitle}${source.container ? ` ${source.container}.` : ''}${doiOrUrl ? ` ${doiOrUrl}` : ''}`.trim()
}

function sourceToDraft(source: ResearchSource): SourceDraft {
  return {
    ...emptySource,
    authors: source.metadata?.authors || '', year: source.metadata?.year || '',
    kind: source.metadata?.kind || 'journal', container: source.metadata?.container || '',
    publisher: source.metadata?.publisher || '', volume: source.metadata?.volume || '',
    issue: source.metadata?.issue || '', pages: source.metadata?.pages || '', doi: source.doi || '',
    url: source.url || '', notes: source.notes || '', title: source.title || '',
  }
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'The research workspace could not complete that request.')
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export default function ResearchAssistant() {
  const [projects, setProjects] = useState<ResearchProject[]>([])
  const [project, setProject] = useState<ResearchProject | null>(null)
  const [sources, setSources] = useState<ResearchSource[]>([])
  const [tab, setTab] = useState<Tab>('projects')
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(emptySource)
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null)
  const [projectDraft, setProjectDraft] = useState({ title: '', research_question: '', thesis: '', outlineText: '' })
  const [creatingProject, setCreatingProject] = useState(false)
  const [showSourceForm, setShowSourceForm] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [literatureDrafts, setLiteratureDrafts] = useState<Record<number, NonNullable<SourceMetadata['literature']>>>({})

  useEffect(() => {
    apiRequest<ResearchProject[]>('/api/research/projects').then((items) => {
      setProjects(items)
      if (items[0]) setProject(items[0])
    }).catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!project) { setSources([]); return }
    apiRequest<ResearchSource[]>(`/api/research/sources?projectId=${project.id}`)
      .then(setSources).catch((error: Error) => setMessage(error.message))
  }, [project?.id])

  useEffect(() => {
    if (!project) setProjectDraft({ title: '', research_question: '', thesis: '', outlineText: '' })
    else setProjectDraft({ title: project.title, research_question: project.research_question || '', thesis: project.thesis || '', outlineText: (project.outline || []).join('\n') })
  }, [project?.id, project?.title, project?.research_question, project?.thesis, project?.outline])

  const filteredSources = useMemo(() => sources.filter((source) => `${source.title} ${source.metadata?.authors || ''} ${source.metadata?.container || ''}`.toLowerCase().includes(search.toLowerCase())), [sources, search])
  const citation = apaCitation(sourceDraft)

  const saveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = { title: projectDraft.title.trim(), research_question: projectDraft.research_question, thesis: projectDraft.thesis, outline: projectDraft.outlineText.split('\n').map((item) => item.trim()).filter(Boolean) }
      const saved = await apiRequest<ResearchProject>(project ? `/api/research/projects/${project.id}` : '/api/research/projects', {
        method: project ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      setProjects((items) => project ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items])
      setProject(saved)
      setCreatingProject(false)
      setMessage('Project saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save project.') }
    finally { setSaving(false) }
  }

  const removeProject = async () => {
    if (!project || !window.confirm(`Delete “${project.title}” and its linked sources?`)) return
    try {
      await apiRequest(`/api/research/projects/${project.id}`, { method: 'DELETE' })
      const remaining = projects.filter((item) => item.id !== project.id)
      setProjects(remaining); setProject(remaining[0] || null); setMessage('Project deleted.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete project.') }
  }

  const saveSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    const payload = {
      project_id: project?.id,
      title: sourceDraft.title.trim(), url: sourceDraft.url.trim(), doi: sourceDraft.doi.trim(),
      citation, notes: sourceDraft.notes,
      metadata: { authors: sourceDraft.authors, year: sourceDraft.year, kind: sourceDraft.kind, container: sourceDraft.container, publisher: sourceDraft.publisher, volume: sourceDraft.volume, issue: sourceDraft.issue, pages: sourceDraft.pages },
    }
    try {
      const saved = await apiRequest<ResearchSource>(editingSourceId ? `/api/research/sources/${editingSourceId}` : '/api/research/sources', { method: editingSourceId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      setSources((items) => editingSourceId ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]); setSourceDraft(emptySource); setEditingSourceId(null); setShowSourceForm(false); setMessage(editingSourceId ? 'Source updated.' : 'Source added to your library.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save source.') }
    finally { setSaving(false) }
  }

  const removeSource = async (source: ResearchSource) => {
    try {
      await apiRequest(`/api/research/sources/${source.id}`, { method: 'DELETE' })
      setSources((items) => items.filter((item) => item.id !== source.id)); setMessage('Source removed.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove source.') }
  }

  const saveLiteratureNotes = async (source: ResearchSource) => {
    const literature = literatureDrafts[source.id] || source.metadata?.literature || {}
    try {
      const saved = await apiRequest<ResearchSource>(`/api/research/sources/${source.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { ...source.metadata, literature } }),
      })
      setSources((items) => items.map((item) => item.id === saved.id ? saved : item)); setMessage('Literature review notes saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save review notes.') }
  }

  const exportBibliography = () => {
    const entries = [...sources].sort((a, b) => (a.metadata?.authors || a.title).localeCompare(b.metadata?.authors || b.title)).map((source) => source.citation || apaCitation(sourceToDraft(source)))
    if (!entries.length) { setMessage('Add sources before exporting a bibliography.'); return }
    const file = new Blob([`References\n\n${entries.join('\n\n')}`], { type: 'text/plain;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = `${(project?.title || 'research').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-references.txt`; link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    setMessage('Bibliography downloaded.')
  }

  const copyCitation = async () => {
    try { await navigator.clipboard.writeText(citation); setMessage('APA citation copied.') }
    catch { setMessage('Clipboard access is unavailable in this browser.') }
  }

  const changeDraft = <K extends keyof SourceDraft,>(field: K, value: SourceDraft[K]) => setSourceDraft((draft) => ({ ...draft, [field]: value }))
  const changeLiterature = (sourceId: number, field: keyof NonNullable<SourceMetadata['literature']>, value: string) => {
    const source = sources.find((item) => item.id === sourceId)
    setLiteratureDrafts((current) => ({ ...current, [sourceId]: { ...(current[sourceId] || source?.metadata?.literature), [field]: value } }))
  }

  return (
    <section className="page-view research-page">
      <div className="page-heading"><div><p className="eyebrow">RESEARCH STUDIO</p><h1>Research assistant</h1><p className="intro">Shape a research question, organize evidence, and prepare your references.</p></div><button className="primary-button" onClick={() => { setCreatingProject(true); setProject(null); setTab('projects') }}>+ New project</button></div>
      <nav className="research-tabs" aria-label="Research tools">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      {message && <div className="research-message" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}
      {loading ? <div className="empty-state">Loading your research workspace…</div> : <>
        {projects.length > 0 && <div className="research-project-picker"><label>Current project<select value={project?.id || ''} onChange={(event) => { const selected = projects.find((item) => item.id === Number(event.target.value)); setProject(selected || null); setCreatingProject(event.target.value === '') }}>{creatingProject && <option value="">New project</option>}{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><span>{sources.length} source{sources.length === 1 ? '' : 's'}</span></div>}
        {tab === 'projects' && <div className="research-panel-grid">
          <form className="research-panel research-project-form" onSubmit={saveProject}><div><p className="eyebrow">{project && !creatingProject ? 'PROJECT PLAN' : 'NEW PROJECT'}</p><h2>{project && !creatingProject ? 'Research project' : 'Start a research project'}</h2></div>
            <label>Project title<input className="modal-input" required maxLength={180} value={projectDraft.title} onChange={(event) => setProjectDraft({ ...projectDraft, title: event.target.value })} placeholder="e.g. Youth participation in local elections" /></label>
            <label>Research question<textarea className="modal-input" rows={3} maxLength={2000} value={projectDraft.research_question} onChange={(event) => setProjectDraft({ ...projectDraft, research_question: event.target.value })} placeholder="What do you want to find out?" /></label>
            <label>Working thesis<textarea className="modal-input" rows={3} maxLength={4000} value={projectDraft.thesis} onChange={(event) => setProjectDraft({ ...projectDraft, thesis: event.target.value })} placeholder="Your current answer or argument" /></label>
            <label>Outline <small>One section per line</small><textarea className="modal-input" rows={5} value={projectDraft.outlineText} onChange={(event) => setProjectDraft({ ...projectDraft, outlineText: event.target.value })} placeholder={'Introduction\nLiterature review\nAnalysis\nConclusion'} /></label>
            <div className="research-form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : project && !creatingProject ? 'Save project' : 'Create project'}</button>{project && !creatingProject && <button className="research-danger" type="button" onClick={() => void removeProject()}>Delete project</button>}</div>
          </form>
          <article className="research-panel"><p className="eyebrow">YOUR PROJECTS</p><h2>Research projects</h2>{projects.length ? <div className="research-project-list">{projects.map((item) => <button key={item.id} className={project?.id === item.id && !creatingProject ? 'selected' : ''} onClick={() => { setProject(item); setCreatingProject(false) }}><strong>{item.title}</strong><span>{item.research_question || 'Add a research question'}</span></button>)}</div> : <p className="empty-state">Create a project to keep your question, thesis, outline, and sources together.</p>}</article>
        </div>}
        {tab === 'sources' && <div className="research-panel"><div className="research-panel-heading"><div><p className="eyebrow">SOURCE LIBRARY</p><h2>Academic sources</h2></div><button className="primary-button" disabled={!project} onClick={() => { setSourceDraft(emptySource); setEditingSourceId(null); setShowSourceForm((show) => !show) }}>{showSourceForm ? 'Cancel' : '+ Add source'}</button></div>
          {!project && <p className="empty-state">Create or select a research project to add sources.</p>}
          {showSourceForm && project && <form className="research-source-form" onSubmit={saveSource}><p className="eyebrow">{editingSourceId ? 'EDIT SOURCE' : 'SOURCE DETAILS'}</p><div className="research-form-grid">
            <label>Authors <small>Separate multiple authors with semicolons</small><input className="modal-input" value={sourceDraft.authors} onChange={(event) => changeDraft('authors', event.target.value)} placeholder="Smith, J. A.; Lee, M." /></label>
            <label>Year<input className="modal-input" value={sourceDraft.year} onChange={(event) => changeDraft('year', event.target.value)} placeholder="2024" /></label>
            <label className="research-wide">Title<input className="modal-input" required value={sourceDraft.title} onChange={(event) => changeDraft('title', event.target.value)} placeholder="Source title" /></label>
            <label>Source type<select className="modal-input" value={sourceDraft.kind} onChange={(event) => changeDraft('kind', event.target.value as SourceDraft['kind'])}><option value="journal">Journal article</option><option value="book">Book</option><option value="report">Report</option><option value="web">Web page</option></select></label>
            <label>{sourceDraft.kind === 'journal' ? 'Journal name' : 'Website / series'}<input className="modal-input" value={sourceDraft.container} onChange={(event) => changeDraft('container', event.target.value)} /></label>
            {(sourceDraft.kind === 'journal' || sourceDraft.kind === 'book' || sourceDraft.kind === 'report') && <label>Publisher<input className="modal-input" value={sourceDraft.publisher} onChange={(event) => changeDraft('publisher', event.target.value)} /></label>}
            {sourceDraft.kind === 'journal' && <><label>Volume<input className="modal-input" value={sourceDraft.volume} onChange={(event) => changeDraft('volume', event.target.value)} /></label><label>Issue<input className="modal-input" value={sourceDraft.issue} onChange={(event) => changeDraft('issue', event.target.value)} /></label><label>Pages<input className="modal-input" value={sourceDraft.pages} onChange={(event) => changeDraft('pages', event.target.value)} placeholder="12–28" /></label></>}
            <label>DOI<input className="modal-input" value={sourceDraft.doi} onChange={(event) => changeDraft('doi', event.target.value)} placeholder="10.1234/example" /></label>
            <label className="research-wide">URL<input className="modal-input" type="url" value={sourceDraft.url} onChange={(event) => changeDraft('url', event.target.value)} placeholder="https://…" /></label>
            <label className="research-wide">Reading notes<textarea className="modal-input" rows={3} value={sourceDraft.notes} onChange={(event) => changeDraft('notes', event.target.value)} placeholder="Key ideas, quotes, or follow-up" /></label>
          </div><div className="research-citation-preview"><small>APA 7 preview</small><p>{citation}</p></div><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : editingSourceId ? 'Update source' : 'Save source'}</button></form>}
          <div className="research-library-tools"><input className="modal-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, author, or journal" /></div>
          <div className="research-source-list">{filteredSources.map((source) => <article className="research-source-item" key={source.id}><div><span className="research-source-meta">{source.metadata?.kind || 'source'} · {source.metadata?.year || 'year not set'}</span><h3>{source.title}</h3><p>{source.metadata?.authors || 'Author not set'}{source.metadata?.container ? ` · ${source.metadata.container}` : ''}</p><p className="research-citation-text">{source.citation}</p>{source.notes && <small>{source.notes}</small>}</div><div className="research-source-actions"><button className="research-edit" onClick={() => { setSourceDraft(sourceToDraft(source)); setEditingSourceId(source.id); setShowSourceForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button><button className="research-danger" onClick={() => void removeSource(source)}>Remove</button></div></article>)}{!filteredSources.length && <p className="empty-state">{sources.length ? 'No sources match your search.' : 'Your saved sources will appear here.'}</p>}</div>
        </div>}
        {tab === 'citation' && <div className="research-panel research-citation-builder"><p className="eyebrow">APA 7 CITATION WORKSPACE</p><h2>Build a reference</h2><p className="research-help">Enter source details to generate a reference. Save it to your project from the source library.</p><div className="research-form-grid">
          <label>Authors <small>Separate multiple authors with semicolons</small><input className="modal-input" value={sourceDraft.authors} onChange={(event) => changeDraft('authors', event.target.value)} placeholder="Smith, J. A.; Lee, M." /></label><label>Year<input className="modal-input" value={sourceDraft.year} onChange={(event) => changeDraft('year', event.target.value)} placeholder="2024" /></label>
          <label className="research-wide">Title<input className="modal-input" value={sourceDraft.title} onChange={(event) => changeDraft('title', event.target.value)} placeholder="Source title" /></label>
          <label>Source type<select className="modal-input" value={sourceDraft.kind} onChange={(event) => changeDraft('kind', event.target.value as SourceDraft['kind'])}><option value="journal">Journal article</option><option value="book">Book</option><option value="report">Report</option><option value="web">Web page</option></select></label>
          <label>{sourceDraft.kind === 'journal' ? 'Journal name' : 'Website / series'}<input className="modal-input" value={sourceDraft.container} onChange={(event) => changeDraft('container', event.target.value)} /></label>
          <label>Publisher<input className="modal-input" value={sourceDraft.publisher} onChange={(event) => changeDraft('publisher', event.target.value)} /></label>
          {sourceDraft.kind === 'journal' && <><label>Volume<input className="modal-input" value={sourceDraft.volume} onChange={(event) => changeDraft('volume', event.target.value)} /></label><label>Issue<input className="modal-input" value={sourceDraft.issue} onChange={(event) => changeDraft('issue', event.target.value)} /></label><label>Pages<input className="modal-input" value={sourceDraft.pages} onChange={(event) => changeDraft('pages', event.target.value)} /></label></>}
          <label>DOI<input className="modal-input" value={sourceDraft.doi} onChange={(event) => changeDraft('doi', event.target.value)} placeholder="10.1234/example" /></label><label className="research-wide">URL<input className="modal-input" type="url" value={sourceDraft.url} onChange={(event) => changeDraft('url', event.target.value)} placeholder="https://…" /></label>
        </div><div className="research-citation-preview"><small>Reference list entry</small><p>{citation}</p></div><button className="primary-button" onClick={() => void copyCitation()}>Copy citation</button></div>}
        {tab === 'literature' && <div className="research-panel"><div className="research-panel-heading"><div><p className="eyebrow">LITERATURE REVIEW ORGANIZER</p><h2>Compare your sources</h2></div><span>{sources.length} source{sources.length === 1 ? '' : 's'}</span></div>{!sources.length ? <p className="empty-state">Add sources to organize your literature review.</p> : <div className="literature-list">{sources.map((source) => { const notes = literatureDrafts[source.id] || source.metadata?.literature || {}; return <article className="literature-card" key={source.id}><div className="literature-card-title"><div><h3>{source.title}</h3><span>{source.metadata?.authors || 'Author not set'} · {source.metadata?.year || 'n.d.'}</span></div><button className="text-button" onClick={() => void saveLiteratureNotes(source)}>Save notes</button></div><div className="research-form-grid"><label>Summary<textarea className="modal-input" rows={3} value={notes.summary || ''} onChange={(event) => changeLiterature(source.id, 'summary', event.target.value)} placeholder="Main argument and contribution" /></label><label>Methodology<textarea className="modal-input" rows={3} value={notes.methodology || ''} onChange={(event) => changeLiterature(source.id, 'methodology', event.target.value)} placeholder="How was the study conducted?" /></label><label>Key findings<textarea className="modal-input" rows={3} value={notes.findings || ''} onChange={(event) => changeLiterature(source.id, 'findings', event.target.value)} placeholder="Evidence and conclusions" /></label><label>Limitations / relevance<textarea className="modal-input" rows={3} value={notes.limitations || ''} onChange={(event) => changeLiterature(source.id, 'limitations', event.target.value)} placeholder="Limitations and how it relates to your question" /></label></div></article>})}</div>}</div>}
        {tab === 'bibliography' && <div className="research-panel"><div className="research-panel-heading"><div><p className="eyebrow">BIBLIOGRAPHY EXPORT</p><h2>{project?.title || 'Project references'}</h2><p className="research-help">APA 7 references from the current project, sorted by author.</p></div><button className="primary-button" onClick={exportBibliography}>Download references</button></div><div className="research-bibliography">{[...sources].sort((a, b) => (a.metadata?.authors || a.title).localeCompare(b.metadata?.authors || b.title)).map((source) => <p key={source.id}>{source.citation || apaCitation(sourceToDraft(source))}</p>)}{!sources.length && <p className="empty-state">Add sources to build your bibliography.</p>}</div></div>}
      </>}
    </section>
  )
}
