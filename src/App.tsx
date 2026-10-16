import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, AlertTriangle, Bell, BarChart3, CalendarDays, ChevronLeft, ChevronRight,
  CircleHelp, EllipsisVertical, LayoutDashboard, LogOut, Menu, MessageCircle, PhoneCall,
  Plus, Search, Send, Trash2, X, Pencil, Users, ClipboardList, GraduationCap, Radio,
  CheckCircle2, ShieldAlert, UserRound, Sparkles, Check, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, session, studentApi, studentSession } from './lib/api';
import { resources, type Field, type ResourceConfig } from './lib/resources';
import type { ApiList, DashboardStats } from '../shared/types';
import type { EmergencyContact } from '../shared/types';
import ngpLogo from './NGP_Patna13_logo.jpg';
import ngpBackground from './NGP_Patna13_background.jpg';

type Theme = 'dark';
const ThemeContext = createContext<{ theme: Theme }>({ theme: 'dark' });

function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    localStorage.setItem('campusmate-theme', 'dark');
  }, []);
  return <ThemeContext.Provider value={{ theme: 'dark' }}>{children}</ThemeContext.Provider>;
}

function ThemeToggle() {
  useContext(ThemeContext);
  return null;
}

// ==========================================
// 1. SEPARATE ADMIN LOGIN
// ==========================================
function AdminLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Please enter both email and password');
      return;
    }
    setLoading(true);
    try {
      const result = await api<{ token: string }>('/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      session.set(result.token);
      toast.success('Signed in as administrator');
      navigate('/admin');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Admin sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand" style={{ backgroundImage: `linear-gradient(rgba(19,35,29,.38), rgba(19,35,29,.38)), url(${ngpBackground})` }}>
        <div className="brand-mark"><img src={ngpLogo} alt="NGP Patna 13 logo" /></div>
        <div>
          <strong>CampusMate AI</strong>
          <span>Administrator Workspace</span>
        </div>
        <div className="login-quote">
          <p>Manage college operations, timetables, notices, and intelligence in one place.</p>
          <span>Admin Portal</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-theme"><ThemeToggle /></div>
        <form className="login-form" onSubmit={submit}>
          <div className="mobile-logo">
            <MessageCircle />
            <b>CampusMate Admin</b>
          </div>
          <p className="eyebrow">ADMINISTRATOR ACCESS</p>
          <h1>Admin Sign In</h1>
          <p className="muted">Enter your administrative credentials to manage college data.</p>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@college.edu"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
            />
          </label>
          <button className="primary full" disabled={loading}>
            {loading ? 'Verifying credentials...' : 'Sign in to Admin Dashboard'}
          </button>
          <p className="secure-note">
            <a href="/">← Return to Student Portal</a>
          </p>
        </form>
      </section>
    </main>
  );
}

// ==========================================
// 2. WEBSITE FIRST SCREEN: STUDENT LOGIN
// ==========================================
function StudentLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [phone, setPhone] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!studentId.trim() || !phone.trim()) {
      toast.error('Please enter your Student ID and phone number');
      return;
    }
    setLoading(true);
    try {
      const result = await studentApi<{ token: string; user: { name: string; student_id: string | number } }>('/auth/student-login', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId.trim(),
          whatsapp_number: phone.trim(),
        }),
      });
      studentSession.set(result.token);
      toast.success(`Welcome, ${result.user?.name || 'Student'}!`);
      navigate('/chat');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Student login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand" style={{ backgroundImage: `linear-gradient(rgba(19,35,29,.38), rgba(19,35,29,.38)), url(${ngpBackground})` }}>
        <div className="brand-mark"><img src={ngpLogo} alt="NGP Patna 13 logo" /></div>
        <div>
          <strong>CampusMate AI</strong>
          <span>Official College Assistant</span>
        </div>
        <div className="login-quote">
          <p>Your intelligent academic companion, available 24/7 on the website and WhatsApp.</p>
          <span>Student Portal</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-theme"><ThemeToggle /></div>
        <form className="login-form" onSubmit={submit}>
          <div className="mobile-logo">
            <MessageCircle />
            <b>CampusMate AI</b>
          </div>
          <p className="eyebrow">CAMPUSMATE AI · STUDENT ACCESS</p>
          <h1>Welcome to CampusMate</h1>
          <p className="muted">Enter your student ID and registered phone number to open your assistant.</p>
          <label>
            Student ID
            <input
              name="student_id"
              type="text"
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. STU048 or 1001"
            />
          </label>
          <label>
            Registered phone number
            <input
              name="whatsapp_number"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
            />
          </label>
          <button className="primary full" disabled={loading}>
            {loading ? 'Authenticating...' : 'Continue to CampusMate AI'}
          </button>
          <p className="secure-note">
            Staff or administrator? <a href="/admin/login">Admin Sign In</a>
          </p>
        </form>
      </section>
    </main>
  );
}

// ==========================================
// 3. STUDENT CHATBOT PAGE
// ==========================================
type ChatMessage = { role: 'user' | 'assistant'; text: string; createdAt?: string };
type TimetableRow = { day_of_week: string; start_time: string; end_time: string; subject: string; teacher?: string | null; batch_group?: string | null; room?: string | null };

function ChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Hey there! 👋 I am CampusMate AI, your college assistant. Ask me about your timetable, attendance, pending assignments, upcoming exams, faculty, notices, or any study question!', createdAt: new Date().toISOString() }
  ]);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    studentApi<{ messages: ChatMessage[] }>('/chat/history').then((result) => {
      if (active && result.messages.length) setMessages(result.messages);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || loading) return;
    setValue('');
    setError('');
    setMessages((items) => [...items, { role: 'user', text: message, createdAt: new Date().toISOString() }]);
    setLoading(true);
    try {
      const result = await studentApi<{ reply: string }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setMessages((items) => [...items, { role: 'assistant', text: result.reply, createdAt: new Date().toISOString() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach CampusMate AI. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function clearChat() {
    if (clearing) return;
    setClearing(true);
    setError('');
    try {
      await studentApi('/chat/history', { method: 'DELETE' });
      setMessages([
        { role: 'assistant', text: 'Chat cleared. How can I help you today? 👋', createdAt: new Date().toISOString() }
      ]);
      setConfirmClear(false);
      setMenuOpen(false);
      toast.success('Conversation history cleared');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear chat history right now.');
    } finally {
      setClearing(false);
    }
  }

  const quickActions = [
    { label: 'Next Class', icon: CalendarDays, message: 'Which class is next?' },
    { label: "Today's Timetable", icon: CalendarDays, message: "Show today's timetable" },
    { label: 'My Attendance', icon: BarChart3, message: 'What is my attendance?' },
    { label: 'Faculty Contacts', icon: UserRound, message: 'Give me faculty contacts' },
    { label: 'College Notices', icon: Bell, message: 'Show latest college notices' },
    { label: 'Emergency Contacts', icon: ShieldAlert, message: 'Give me emergency contacts' },
  ];

  function send(e?: FormEvent) {
    e?.preventDefault();
    void sendMessage(value);
  }

  function displayTime(val?: string) {
    return val ? new Date(val).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
  }

  return (
    <main className="chat-page">
      <header className="chat-header">
        <div className="chat-brand">
          <div className="brand-mark"><img src={ngpLogo} alt="NGP Patna 13 logo" /></div>
          <div>
            <b>CampusMate AI</b>
            <span className="status-pill"><i></i> Personal college assistant</span>
          </div>
        </div>
        <div className="chat-header-actions">
          <ThemeToggle />
          <button className="secondary" onClick={() => navigate('/timetable')}>Timetable</button>
          <div className="chat-menu">
            <button className="icon" title="Chat options" aria-label="Chat options" onClick={() => setMenuOpen((open) => !open)}>
              <EllipsisVertical size={19} />
            </button>
            {menuOpen && (
              <div className="chat-menu-popover">
                <button type="button" onClick={() => { setConfirmClear(true); setMenuOpen(false); }}>
                  <Trash2 size={15} />Clear Chat
                </button>
              </div>
            )}
          </div>
          <button className="secondary" onClick={() => { studentSession.clear(); navigate('/student-login'); }}>
            Sign out
          </button>
        </div>
      </header>

      <section className="chat-card">
        <div className="chat-messages" style={{ backgroundImage: `linear-gradient(rgba(248,252,249,.22), rgba(244,248,245,.22)), url(${ngpBackground})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
          {messages.map((item, index) => (
            <div className={`chat-row ${item.role}`} key={`${item.role}-${index}`}>
              <div className="chat-bubble">
                {item.text}
                <small>{displayTime(item.createdAt)}</small>
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-row assistant">
              <div className="chat-bubble typing"><i /><i /><i /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && <p className="chat-error">{error}</p>}

        <div className="chat-quick-actions">
          {quickActions.map(({ label, icon: Icon, message }) => (
            <button key={label} type="button" onClick={() => void sendMessage(message)} disabled={loading}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        <form className="chat-composer" onSubmit={send}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(e);
              }
            }}
            placeholder="Ask CampusMate anything about college or your studies..."
            aria-label="Message"
            disabled={loading}
            rows={1}
          />
          <button className="primary" type="submit" disabled={loading || !value.trim()}>
            <Send size={16} />Send
          </button>
        </form>
      </section>

      {confirmClear && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !clearing) setConfirmClear(false); }}>
          <section className="modal clear-chat-dialog">
            <div className="modal-head">
              <div>
                <p className="eyebrow">CONVERSATION</p>
                <h2>Clear chat history?</h2>
              </div>
              <button className="icon" onClick={() => setConfirmClear(false)} disabled={clearing}><X /></button>
            </div>
            <p>This will remove only your chat conversation history. Your profile, attendance, and college records will not be deleted.</p>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setConfirmClear(false)} disabled={clearing}>Cancel</button>
              <button type="button" className="danger-button" onClick={() => void clearChat()} disabled={clearing}>
                {clearing ? 'Clearing...' : 'Clear Chat'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

// ==========================================
// 4. STUDENT TIMETABLE VIEW
// ==========================================
function StudentTimetablePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TimetableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    studentApi<{ timetable: TimetableRow[] }>('/student/timetable')
      .then((result) => setRows(result.timetable))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load timetable.'))
      .finally(() => setLoading(false));
  }, []);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function displayTime(value: string) {
    const [hourText, minute] = value.slice(0, 5).split(':');
    const hour = Number(hourText);
    return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  return (
    <main className="chat-page">
      <header className="chat-header">
        <div className="chat-brand">
          <div className="brand-mark"><img src={ngpLogo} alt="NGP Patna 13 logo" /></div>
          <div>
            <b>Weekly Timetable</b>
            <span>Your authenticated class schedule</span>
          </div>
        </div>
        <div className="chat-header-actions">
          <ThemeToggle />
          <button className="secondary" onClick={() => navigate('/chat')}>Back to chat</button>
          <button className="secondary" onClick={() => { studentSession.clear(); navigate('/student-login'); }}>Sign out</button>
        </div>
      </header>
      <section className="timetable-card">
        {error && <p className="chat-error">{error}</p>}
        {loading ? (
          <div className="timetable-loading">Loading your timetable...</div>
        ) : (
          days.map((day) => {
            const dayRows = rows.filter((r) => r.day_of_week.toLowerCase() === day.toLowerCase());
            return (
              <section className="timetable-day" key={day}>
                <div className="timetable-day-heading">
                  <h2>{day}</h2>
                  <span>{dayRows.length} {dayRows.length === 1 ? 'class' : 'classes'}</span>
                </div>
                {dayRows.length ? (
                  <div className="timetable-list">
                    {dayRows.map((r, i) => (
                      <article className="timetable-slot" key={`${day}-${r.start_time}-${r.subject}-${i}`}>
                        <div className="timetable-time">
                          <b>{displayTime(r.start_time)}</b>
                          <span>{displayTime(r.end_time)}</span>
                        </div>
                        <div className="timetable-subject">
                          <strong>{r.subject}</strong>
                          <span>{r.teacher || 'Teacher not assigned'}{r.room ? ` · ${r.room}` : ''}</span>
                        </div>
                        {r.batch_group && <small>{r.batch_group}</small>}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="timetable-empty">No classes scheduled.</p>
                )}
              </section>
            );
          })
        )}
      </section>
    </main>
  );
}

// ==========================================
// 5. PROMPT-BASED DATA MANAGER COMPONENT
// ==========================================
interface PromptPreviewData {
  operation_id: string;
  action: 'insert' | 'update' | 'delete' | 'clarification_needed';
  target_resource: string;
  resource_label: string;
  summary: string;
  clarification_question?: string;
  target_id?: string | number;
  existing_record?: Record<string, unknown>;
  matching_records?: Record<string, unknown>[];
  proposed_record?: Record<string, unknown>;
  fields: Array<{ key: string; label: string; value: unknown; type?: string; options?: string[]; required?: boolean }>;
  warnings?: string[];
  confidence?: string;
}

function PromptDataManager({ onUpdateSuccess }: { onUpdateSuccess?: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PromptPreviewData | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, unknown>>({});
  const [selectedTargetId, setSelectedTargetId] = useState<string | number | undefined>(undefined);
  const [recentUpdates, setRecentUpdates] = useState<Array<{ id: string; time: string; summary: string; resource: string; action: string }>>([]);

  const examplePrompts = [
    'Add a notice that the fifth-semester CSE students have a Computer Networks test on Monday at 10 AM.',
    'Update the CSE timetable. Computer Networks is now from 10 to 11 AM with Mr Sharma in Room 204.',
    'Add a new college event called Technical Fest, scheduled for 20 November in the main auditorium.',
    "Move tomorrow's Computer Networks class to 11 AM for CSE semester five.",
    'Add an emergency contact for Campus Security at 9876543210 for campus safety issues.',
  ];

  async function handleInterpret(overridePrompt?: string) {
    const textToUse = (overridePrompt ?? prompt).trim();
    if (!textToUse) {
      toast.error('Please enter a natural language instruction');
      return;
    }
    setInterpreting(true);
    setPreview(null);
    try {
      const res = await api<PromptPreviewData>('/admin/interpret-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt: textToUse }),
      });
      setPreview(res);
      setSelectedTargetId(res.target_id);
      // Initialize edited form fields with proposed record values
      const initial: Record<string, unknown> = {};
      res.fields.forEach((f) => { initial[f.key] = f.value; });
      setEditedFields(initial);
      toast.success('Prompt interpreted by AI! Please review the proposed changes below.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not interpret prompt');
    } finally {
      setInterpreting(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setApplying(true);
    try {
      await api('/admin/confirm-changes', {
        method: 'POST',
        body: JSON.stringify({
          action: preview.action,
          target_resource: preview.target_resource,
          target_id: selectedTargetId ?? preview.target_id,
          record: editedFields,
        }),
      });

      toast.success(`Changes applied successfully to ${preview.resource_label}!`);
      setRecentUpdates((prev) => [
        {
          id: preview.operation_id,
          time: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
          summary: preview.summary,
          resource: preview.resource_label,
          action: preview.action,
        },
        ...prev.slice(0, 9),
      ]);
      setPreview(null);
      setPrompt('');
      onUpdateSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply changes');
    } finally {
      setApplying(false);
    }
  }

  function handleFieldChange(key: string, val: unknown) {
    setEditedFields((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <section className="prompt-manager-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">AI DATA MANAGER</p>
          <h2>Manage College Data in Natural Language</h2>
          <p>Type any update, addition, or schedule change. AI will extract and preview the structured database operation for your confirmation.</p>
        </div>
        <Sparkles className="icon-badge" style={{ color: 'var(--green)' }} size={22} />
      </div>

      <div className="prompt-examples">
        <span className="prompt-note">Try an example:</span>
        {examplePrompts.map((example, i) => (
          <button
            key={i}
            type="button"
            className="prompt-chip"
            onClick={() => {
              setPrompt(example);
              void handleInterpret(example);
            }}
          >
            {example.length > 55 ? `${example.slice(0, 52)}...` : example}
          </button>
        ))}
      </div>

      <textarea
        className="prompt-textarea"
        placeholder="Type any instruction naturally... (e.g. 'Add a notice for CSE 5th sem regarding Computer Networks test on Monday at 10 AM' or 'Update CSE timetable: CN is 10 to 11 AM with Mr Sharma in Room 204')"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={interpreting || applying}
      />

      <div className="prompt-actions">
        <span className="prompt-note">AI verifies information and displays a structured preview before anything is written to the database.</span>
        <button
          className="primary"
          type="button"
          onClick={() => void handleInterpret()}
          disabled={interpreting || applying || !prompt.trim()}
        >
          {interpreting ? (
            <><RefreshCw className="animate-spin" size={16} /> Interpreting with AI...</>
          ) : (
            <><Sparkles size={16} /> Interpret & Preview Changes</>
          )}
        </button>
      </div>

      {/* AI CHANGE PREVIEW MODAL / PANEL */}
      {preview && (
        <div className="preview-card">
          <div className="preview-head">
            <div className="preview-badges">
              <span className={`badge-${preview.action}`}>{preview.action}</span>
              <span className="badge-resource">{preview.resource_label}</span>
            </div>
            <button className="icon" title="Dismiss preview" onClick={() => setPreview(null)} disabled={applying}>
              <X size={18} />
            </button>
          </div>

          <div className="preview-summary">
            <strong>Proposed Operation: </strong>
            <span>{preview.summary}</span>
          </div>

          {preview.warnings && preview.warnings.length > 0 && (
            <div className="preview-warning">
              <AlertTriangle size={18} />
              <div>{preview.warnings.map((w, idx) => <p key={idx} style={{ margin: '2px 0' }}>{w}</p>)}</div>
            </div>
          )}

          {/* Clarification Needed */}
          {preview.action === 'clarification_needed' && (
            <div className="preview-clarify-box">
              <b>Clarification Needed:</b>
              <p>{preview.clarification_question}</p>
              <input
                type="text"
                placeholder="Type additional details to clarify..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const newPrompt = `${prompt} ${(e.target as HTMLInputElement).value}`;
                    setPrompt(newPrompt);
                    void handleInterpret(newPrompt);
                  }
                }}
              />
            </div>
          )}

          {/* Multiple Matching Records to Pick From */}
          {preview.matching_records && preview.matching_records.length > 0 && (
            <div className="preview-match-list">
              <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 8px 0' }}>Select the specific record to update/delete:</p>
              {preview.matching_records.map((rec) => {
                const recId = (rec.id ?? rec.student_id) as string | number;
                return (
                  <label key={String(recId)} className={`preview-match-item ${selectedTargetId === recId ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="selected_match"
                      checked={selectedTargetId === recId}
                      onChange={() => setSelectedTargetId(recId)}
                    />
                    <span>
                      <strong>{String(rec.subject || rec.title || rec.full_name || rec.contact_name || recId)}</strong>
                      {rec.day_of_week ? ` · ${String(rec.day_of_week)} (${String(rec.start_time).slice(0, 5)})` : ''}
                      {rec.department ? ` · ${String(rec.department)}` : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Editable Field Inspector */}
          {preview.action !== 'clarification_needed' && preview.fields.length > 0 && (
            <div className="preview-edit-form">
              <div className="preview-edit-title">Review and Edit Extracted Fields Before Applying:</div>
              <div className="preview-form-grid">
                {preview.fields.map((f) => (
                  <label key={f.key} className={f.type === 'textarea' ? 'span' : ''}>
                    <span>{f.label} {f.required && <em style={{ color: 'var(--red)' }}>*</em>}</span>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={String(editedFields[f.key] ?? '')}
                        onChange={(e) => handleFieldChange(f.key, e.target.value)}
                      />
                    ) : f.type === 'select' ? (
                      <select
                        value={String(editedFields[f.key] ?? '')}
                        onChange={(e) => handleFieldChange(f.key, e.target.value)}
                      >
                        <option value="">Select</option>
                        {f.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : f.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(editedFields[f.key])}
                        onChange={(e) => handleFieldChange(f.key, e.target.checked)}
                      />
                    ) : (
                      <input
                        type={f.type ?? 'text'}
                        value={String(editedFields[f.key] ?? '')}
                        onChange={(e) => handleFieldChange(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Action Confirmation Buttons */}
          {preview.action !== 'clarification_needed' && (
            <div className="preview-buttons">
              <button className="secondary" type="button" onClick={() => setPreview(null)} disabled={applying}>
                Discard
              </button>
              <button
                className={preview.action === 'delete' ? 'danger-button' : 'primary'}
                type="button"
                onClick={() => void handleConfirm()}
                disabled={applying}
              >
                {applying ? 'Applying to Database...' : (
                  <><Check size={16} /> Confirm & Apply Changes to {preview.resource_label}</>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* RECENT AI UPDATES AUDIT TRAIL */}
      {recentUpdates.length > 0 && (
        <div style={{ marginTop: '24px', borderTop: '1px solid #edf1ee', paddingTop: '16px' }}>
          <p className="eyebrow">RECENT AI UPDATES</p>
          <div className="activity-list">
            {recentUpdates.map((item) => (
              <div className="activity" key={item.id}>
                <div className="activity-icon"><Sparkles size={16} /></div>
                <div>
                  <b>{item.summary}</b>
                  <span>{item.resource} · {item.action.toUpperCase()} at {item.time}</span>
                </div>
                <i className="success"></i>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ==========================================
// 6. ADMIN SHELL & NAVIGATION
// ==========================================
function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const nav = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard },
    { to: '/admin/prompt-manager', label: 'AI Prompt Manager', icon: Sparkles },
    { to: '/admin/manage/timetables', label: 'Timetable', icon: CalendarDays },
    { to: '/admin/manage/faculty', label: 'Faculty', icon: UserRound },
    { to: '/admin/manage/attendance', label: 'Attendance', icon: BarChart3 },
    { to: '/admin/manage/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/admin/manage/exams', label: 'Examinations', icon: GraduationCap },
    { to: '/admin/manage/notices', label: 'Notices', icon: Bell },
    { to: '/admin/manage/events', label: 'Events', icon: CalendarDays },
    { to: '/admin/manage/emergency_contacts', label: 'Emergency Contacts', icon: ShieldAlert },
    { to: '/admin/manage/students', label: 'Students', icon: Users },
    { to: '/admin/notifications', label: 'Send Notifications', icon: Send },
  ];

  return (
    <div className="app-shell">
      <aside className={open ? 'open' : ''}>
        <div className="sidebar-brand">
          <div className="brand-mark"><img src={ngpLogo} alt="NGP Patna 13 logo" /></div>
          <div>
            <b>CampusMate AI</b>
            <span>ADMIN WORKSPACE</span>
          </div>
          <button className="icon mobile-close" onClick={() => setOpen(false)}><X /></button>
        </div>
        <nav>
          {nav.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              className={(to === '/admin' ? location.pathname === to : location.pathname.startsWith(to)) ? 'active' : ''}
              onClick={() => { navigate(to); setOpen(false); }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="system-live">
            <i></i>
            <div>
              <b>Systems operational</b>
              <span>WhatsApp & AI Connected</span>
            </div>
          </div>
          <button onClick={() => { session.clear(); navigate('/admin/login'); }}>
            <LogOut size={18} />Sign out
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header>
          <button className="icon menu" onClick={() => setOpen(true)}><Menu /></button>
          <div className="header-title"><span>Campus Operations & AI Management</span></div>
          <div className="header-actions">
            <ThemeToggle />
            <button className="icon" title="Help"><CircleHelp /></button>
            <div className="avatar">CA</div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
    </div>
  );
}

// ==========================================
// 7. ADMIN DASHBOARD (OVERVIEW)
// ==========================================
function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardStats | null>(null);

  const loadDashboard = () => {
    api<DashboardStats>('/admin/dashboard').then(setData).catch((e) => toast.error(e.message));
  };

  useEffect(loadDashboard, []);

  const stats = [
    ['Registered students', data?.students ?? '—', Users, 'Across active cohorts'],
    ['Active assignments', data?.activeAssignments ?? '—', ClipboardList, 'Awaiting submission'],
    ['Upcoming exams', data?.upcomingExams ?? '—', GraduationCap, 'From today onward'],
    ['Message delivery', `${data?.deliveryRate ?? '—'}%`, Radio, 'WhatsApp & Web Push'],
  ] as const;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATOR OVERVIEW</p>
          <h1>Campus Overview & Updates</h1>
          <p>Update college data by typing prompts in natural language or using table tools.</p>
        </div>
        <button className="primary" onClick={() => navigate('/admin/notifications')}>
          <Send size={16} />Send broadcast
        </button>
      </div>

      {/* PRIMARY FEATURE: Natural Language Prompt-Based Data Manager */}
      <PromptDataManager onUpdateSuccess={loadDashboard} />

      <div className="stat-grid">
        {stats.map(([label, value, Icon, note]) => (
          <article className="stat" key={label}>
            <div className="stat-icon"><Icon /></div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </div>
          </article>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent communications</h2>
              <p>Latest notifications delivered across channels</p>
            </div>
            <Activity size={20} />
          </div>
          <div className="activity-list">
            {!data ? (
              <Skeleton />
            ) : data.recentActivity.length ? (
              data.recentActivity.map((item) => (
                <div className="activity" key={item.id}>
                  <div className="activity-icon"><Bell size={17} /></div>
                  <div>
                    <b>{item.title}</b>
                    <span>{item.status} · {formatValue(item.created_at)}</span>
                  </div>
                  <i className={item.status === 'sent' ? 'success' : ''}></i>
                </div>
              ))
            ) : (
              <Empty compact text="No communications sent yet." />
            )}
          </div>
        </section>

        <section className="panel quick-panel">
          <div className="panel-head">
            <div>
              <h2>Data Management Modules</h2>
              <p>Review and edit individual tables</p>
            </div>
          </div>
          <div className="quick-grid">
            {resources.slice(0, 6).map((r) => (
              <button key={r.key} onClick={() => navigate(`/admin/manage/${r.key}`)}>
                <r.icon />
                <span>Manage {r.label.toLowerCase()}</span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Skeleton() {
  return <div className="skeleton-lines"><i /><i /><i /></div>;
}

function Empty({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`empty ${compact ? 'compact' : ''}`}>
      <Search />
      <b>Nothing here yet</b>
      <span>{text}</span>
    </div>
  );
}

function formatValue(v: unknown) {
  if (v === true) return 'Active';
  if (v === false) return 'Inactive';
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return s;
}

// ==========================================
// 8. TIMETABLE MANAGEMENT PAGE
// ==========================================
type AdminTimetable = { id: number | string; day_of_week: string; start_time: string; end_time: string; subject: string; teacher: string | null; batch_group: string | null; is_recess: boolean };
const timetableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const clock = (value: string) => new Date(`1970-01-01T${value.slice(0, 5)}:00`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function TimetablePage() {
  const [items, setItems] = useState<AdminTimetable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');
  const [batch, setBatch] = useState('');
  const [editing, setEditing] = useState<AdminTimetable | null>(null);
  const [open, setOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api<ApiList<AdminTimetable>>('/admin/timetables?page=1&pageSize=100')
      .then((r) => setItems(r.data))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const batches = [...new Set(items.map((item) => item.batch_group).filter((value): value is string => Boolean(value)))].sort();
  const visible = items.filter((item) => (!day || item.day_of_week === day) && (!batch || item.batch_group === batch) && (!search || `${item.subject} ${item.teacher ?? ''} ${item.batch_group ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  const grouped = timetableDays.map((name) => ({ name, rows: visible.filter((item) => item.day_of_week === name).sort((a, b) => a.start_time.localeCompare(b.start_time)) })).filter((group) => group.rows.length);

  async function remove(item: AdminTimetable) {
    if (!confirm(`Are you sure you want to delete ${item.subject}?`)) return;
    try {
      await api(`/admin/timetables/${item.id}`, { method: 'DELETE' });
      toast.success('Timetable entry deleted');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACADEMIC DATA</p>
          <h1>Timetable Management</h1>
          <p>{items.length} timetable entries configured across cohorts</p>
        </div>
        <button className="primary" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus size={18} />Add timetable entry
        </button>
      </div>
      <section className="table-panel timetable-admin">
        <div className="table-tools">
          <div className="search">
            <Search />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject, teacher or batch..." />
          </div>
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">All days</option>
            {timetableDays.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">All batches</option>
            {batches.map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        {loading ? (
          <Skeleton />
        ) : grouped.length ? (
          <div className="admin-timetable-groups">
            {grouped.map((group) => (
              <section className="admin-timetable-day" key={group.name}>
                <div className="admin-timetable-day-head">
                  <h2>{group.name}</h2>
                  <span>{group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'}</span>
                </div>
                {group.rows.map((item) => (
                  <article className="admin-timetable-slot" key={String(item.id)}>
                    <div className="admin-timetable-time">
                      <b>{clock(item.start_time)}</b>
                      <span>{clock(item.end_time)}</span>
                    </div>
                    <div className="admin-timetable-main">
                      <strong>{item.is_recess ? '☕ Recess / Break' : item.subject}</strong>
                      <span>{item.teacher || 'No teacher assigned'}{item.batch_group ? ` · ${item.batch_group}` : ''}</span>
                    </div>
                    <div className="row-actions">
                      <button className="icon" title="Edit" onClick={() => { setEditing(item); setOpen(true); }}><Pencil /></button>
                      <button className="icon danger" title="Delete" onClick={() => remove(item)}><Trash2 /></button>
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <Empty text="No timetable entries found." />
        )}
      </section>
      {open && <TimetableModal item={editing} close={() => setOpen(false)} saved={() => { setOpen(false); load(); }} />}
    </>
  );
}

function TimetableModal({ item, close, saved }: { item: AdminTimetable | null; close: () => void; saved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [recess, setRecess] = useState(Boolean(item?.is_recess));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    const body = {
      day_of_week: String(raw.day_of_week),
      start_time: String(raw.start_time),
      end_time: String(raw.end_time),
      subject: String(raw.subject ?? ''),
      teacher: String(raw.teacher ?? ''),
      batch_group: String(raw.batch_group ?? ''),
      is_recess: recess,
    };
    try {
      await api(`/admin/timetables${item ? `/${item.id}` : ''}`, { method: item ? 'PUT' : 'POST', body: JSON.stringify(body) });
      toast.success(`Timetable ${item ? 'updated' : 'added'} successfully`);
      saved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save timetable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">{item ? 'EDIT' : 'NEW'}</p>
            <h2>{item ? 'Edit timetable' : 'Add timetable entry'}</h2>
          </div>
          <button className="icon" onClick={close}><X /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              <span>Day <em>*</em></span>
              <select name="day_of_week" defaultValue={item?.day_of_week || 'Monday'} required>
                {timetableDays.map((v) => <option key={v}>{v}</option>)}
              </select>
            </label>
            <label>
              <span>Start time <em>*</em></span>
              <input name="start_time" type="time" defaultValue={item?.start_time?.slice(0, 5)} required />
            </label>
            <label>
              <span>End time <em>*</em></span>
              <input name="end_time" type="time" defaultValue={item?.end_time?.slice(0, 5)} required />
            </label>
            <label>
              <span>Subject {!recess && <em>*</em>}</span>
              <input name="subject" defaultValue={recess ? 'Recess' : item?.subject || ''} required={!recess} />
            </label>
            <label>
              <span>Teacher {!recess && <em>*</em>}</span>
              <input name="teacher" defaultValue={item?.teacher || ''} required={!recess} />
            </label>
            <label>
              <span>Batch / Group</span>
              <input name="batch_group" defaultValue={item?.batch_group || ''} />
            </label>
            <label className="check span">
              <input name="is_recess" type="checkbox" checked={recess} onChange={(e) => setRecess(e.target.checked)} />
              <span>Recess / break</span>
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={close}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save timetable'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ==========================================
// 9. RESOURCE MANAGEMENT PAGES
// ==========================================
function ResourcePage() {
  const { resource: key } = useParams();
  const config = resources.find((r) => r.key === key);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | null | undefined>(undefined);

  const load = () => {
    if (!config) return;
    setLoading(true);
    api<ApiList>(`/admin/${config.key}?page=${page}&pageSize=15&search=${encodeURIComponent(search)}`)
      .then((r) => { setItems(r.data); setCount(r.total); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [key, page, search, config]);

  if (!config) return <Navigate to="/admin" />;

  const itemKey = (item: Record<string, unknown>) => String(config?.key === 'students' ? item.student_id : item.id);

  async function remove(id: string) {
    if (!confirm(`Delete this ${config!.singular.toLowerCase()}? This cannot be undone.`)) return;
    try {
      await api(`/admin/${config!.key}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACADEMIC DATA</p>
          <h1>{config.label} Management</h1>
          <p>{count} {count === 1 ? config.singular.toLowerCase() : config.label.toLowerCase()} in the system</p>
        </div>
        <button className="primary" onClick={() => setEditing(null)}>
          <Plus size={18} />Add {config.singular.toLowerCase()}
        </button>
      </div>
      <section className="table-panel">
        <div className="table-tools">
          <div className="search">
            <Search />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={`Search ${config.label.toLowerCase()}...`} />
          </div>
          <span>{count} records</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {config.columns.map(([, label]) => <th key={label}>{label}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={config.columns.length + 1}><Skeleton /></td></tr>
              ) : items.map((item) => (
                <tr key={itemKey(item)}>
                  {config.columns.map(([field]) => (
                    <td key={field}>
                      <span className={field === 'active' ? (item[field] ? 'badge success' : 'badge muted') : field === 'priority' ? `badge ${item[field]}` : ''}>
                        {formatValue(item[field])}
                      </span>
                    </td>
                  ))}
                  <td className="row-actions">
                    <button className="icon" title="Edit" onClick={() => setEditing(item)}><Pencil /></button>
                    <button className="icon danger" title="Delete" onClick={() => remove(itemKey(item))}><Trash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !items.length && <Empty text={`Add your first ${config.singular.toLowerCase()} to get started.`} />}
        </div>
        {count > 15 && (
          <div className="pagination">
            <button className="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></button>
            <span>Page {page} of {Math.ceil(count / 15)}</span>
            <button className="icon" disabled={page >= Math.ceil(count / 15)} onClick={() => setPage((p) => p + 1)}><ChevronRight /></button>
          </div>
        )}
      </section>
      {editing !== undefined && (
        <EditModal config={config} item={editing} close={() => setEditing(undefined)} saved={() => { setEditing(undefined); load(); }} />
      )}
    </>
  );
}

function EmergencyContactsPage() {
  const config = resources.find((r) => r.key === 'emergency_contacts')!;
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | null | undefined>(undefined);

  const load = () => {
    setLoading(true);
    api<ApiList<EmergencyContact>>('/admin/emergency_contacts?page=1&pageSize=100&search=')
      .then((r) => setContacts(r.data))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const groups = [
    { type: 'public_service' as const, title: 'Public emergency services', description: 'Direct emergency and public safety numbers.' },
    { type: 'faculty' as const, title: 'College and faculty contacts', description: 'College personnel assigned to student urgent situations.' },
  ];

  async function remove(contact: EmergencyContact) {
    if (!confirm(`Delete ${contact.contact_name}? This cannot be undone.`)) return;
    try {
      await api(`/admin/emergency_contacts/${contact.id}`, { method: 'DELETE' });
      toast.success('Emergency contact deleted');
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  }

  async function toggle(contact: EmergencyContact) {
    try {
      await api(`/admin/emergency_contacts/${contact.id}`, { method: 'PUT', body: JSON.stringify({ ...contact, active: !contact.active }) });
      toast.success(contact.active ? 'Contact deactivated' : 'Contact activated');
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">URGENT SUPPORT</p>
          <h1>Emergency Contacts</h1>
          <p>{contacts.length} emergency contacts configured for urgent campus and medical situations</p>
        </div>
        <button className="primary" onClick={() => setEditing(null)}><Plus />Add emergency contact</button>
      </div>
      <div className="emergency-warning">
        <AlertTriangle />
        <div>
          <b>For urgent or serious situations only</b>
          <span>These contacts are provided by CampusMate AI for safety, medical, academic, or examination emergencies.</span>
        </div>
      </div>
      {loading ? (
        <section className="panel"><Skeleton /></section>
      ) : (
        groups.map((group) => {
          const items = contacts.filter((c) => c.contact_type === group.type).sort((a, b) => a.priority - b.priority);
          return (
            <section className="emergency-section" key={group.type}>
              <div className="emergency-section-head">
                <div><h2>{group.title}</h2><p>{group.description}</p></div>
                <span>{items.length}</span>
              </div>
              {items.length ? (
                <div className="emergency-grid">
                  {items.map((contact) => (
                    <article className={`emergency-contact ${contact.active ? '' : 'inactive'}`} key={contact.id}>
                      <div className="emergency-contact-head">
                        <div className="emergency-symbol"><ShieldAlert /></div>
                        <div>
                          <h3>{contact.contact_name}</h3>
                          <p>{contact.role_or_service}</p>
                        </div>
                        <span className={`badge ${contact.active ? 'success' : 'muted'}`}>{contact.active ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div className="emergency-type">{contact.emergency_type}</div>
                      <p className="emergency-description">{contact.description}</p>
                      <div className="emergency-phone">
                        <span>{contact.phone_number}</span>
                        <small>Priority {contact.priority}</small>
                      </div>
                      <div className="emergency-actions">
                        <a className="call-now" href={`tel:${contact.phone_number.replace(/[^\d+]/g, '')}`}>
                          <PhoneCall />Call now
                        </a>
                        <button className="secondary" onClick={() => toggle(contact)}>{contact.active ? 'Deactivate' : 'Activate'}</button>
                        <button className="icon" title="Edit" onClick={() => setEditing(contact as unknown as Record<string, unknown>)}><Pencil /></button>
                        <button className="icon danger" title="Delete" onClick={() => remove(contact)}><Trash2 /></button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="emergency-empty">No {group.title.toLowerCase()} configured.</div>
              )}
            </section>
          );
        })
      )}
      {editing !== undefined && (
        <EditModal config={config} item={editing} close={() => setEditing(undefined)} saved={() => { setEditing(undefined); load(); }} />
      )}
    </>
  );
}

function EditModal({ config, item, close, saved }: { config: ResourceConfig; item: Record<string, unknown> | null; close: () => void; saved: () => void }) {
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(
      config.fields.map((f) => {
        let value: unknown = f.type === 'checkbox' ? fd.has(f.name) : fd.get(f.name);
        if (f.type === 'number' && value !== '') value = Number(value);
        if (value === '') value = null;
        return [f.name, value];
      })
    );
    const id = item ? String(config.key === 'students' ? item.student_id : item.id) : '';
    try {
      await api(`/admin/${config.key}${item ? `/${encodeURIComponent(id)}` : ''}`, {
        method: item ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      toast.success(`${config.singular} ${item ? 'updated' : 'added'}`);
      saved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">{item ? 'EDIT' : 'NEW'}</p>
            <h2>{item ? `Edit ${config.singular.toLowerCase()}` : `Add ${config.singular.toLowerCase()}`}</h2>
          </div>
          <button className="icon" onClick={close}><X /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {config.fields.map((field) => (
              <FormField key={field.name} field={field} value={item?.[field.name]} />
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={close}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FormField({ field, value }: { field: Field; value: unknown }) {
  let val = value ?? '';
  if (field.type === 'datetime-local' && val) val = String(val).slice(0, 16);
  if (field.type === 'time' && val) val = String(val).slice(0, 5);
  return (
    <label className={`${field.span ? 'span' : ''} ${field.type === 'checkbox' ? 'check' : ''}`}>
      {field.type === 'checkbox' ? (
        <>
          <input name={field.name} type="checkbox" defaultChecked={value === undefined ? (field.defaultChecked ?? true) : Boolean(value)} />
          <span>{field.label}</span>
        </>
      ) : (
        <>
          <span>{field.label}{field.required && <em>*</em>}</span>
          {field.type === 'textarea' ? (
            <textarea name={field.name} defaultValue={String(val)} required={field.required} />
          ) : field.type === 'select' ? (
            <select name={field.name} defaultValue={String(val)} required={field.required}>
              <option value="">Select</option>
              {field.options?.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input name={field.name} type={field.type ?? 'text'} defaultValue={String(val)} required={field.required} />
          )}
        </>
      )}
    </label>
  );
}

// ==========================================
// 10. NOTIFICATIONS DISPATCH
// ==========================================
function Notifications() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [channel, setChannel] = useState('web_push');
  const [timing, setTiming] = useState('now');

  const loadHistory = () => api<ApiList>('/admin/notifications?page=1&pageSize=10').then((r) => setHistory(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { void loadHistory(); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (timing === 'later' && !raw.scheduled_at) throw new Error('Choose a date and time for the scheduled notification');
      const scheduledAt = timing === 'later' ? new Date(String(raw.scheduled_at)).toISOString() : null;
      const studentIds = String(raw.student_ids ?? '').split(',').map((v) => Number(v.trim())).filter((v) => Number.isSafeInteger(v) && v > 0);
      const payload = { ...raw, delivery_channel: channel, semester: raw.semester ? Number(raw.semester) : null, student_ids: studentIds, scheduled_at: scheduledAt };
      const created = await api<{ id: string; status: string }>('/admin/notifications', { method: 'POST', body: JSON.stringify(payload) });
      if (created.status !== 'scheduled') await api(`/admin/notifications/${created.id}/send`, { method: 'POST' });
      setSent(true);
      void loadHistory();
      toast.success(created.status === 'scheduled' ? 'Notification scheduled' : 'Notification sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMMUNICATIONS</p>
          <h1>Send Notification</h1>
          <p>Send instant or scheduled notifications via Web Push, WhatsApp, or both.</p>
        </div>
      </div>
      <div className="compose-layout">
        <form className="panel compose" onSubmit={submit}>
          <div className="panel-head">
            <div><h2>Message Details</h2><p>Deliver timely academic or campus announcements.</p></div>
          </div>
          {sent ? (
            <div className="sent-state">
              <CheckCircle2 />
              <h2>Notification Accepted</h2>
              <p>Sent immediately or queued for scheduled delivery.</p>
              <button type="button" className="secondary" onClick={() => setSent(false)}>Compose another</button>
            </div>
          ) : (
            <>
              <div className="form-grid">
                <label className="span"><span>Title <em>*</em></span><input name="title" required placeholder="e.g. Campus closed tomorrow due to weather" /></label>
                <label className="span"><span>Message <em>*</em></span><textarea name="message" required maxLength={3500} placeholder="Write the update students should receive..." /></label>
                <label><span>Delivery channel</span><select name="delivery_channel" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="web_push">Free Web Push</option><option value="whatsapp">WhatsApp template</option><option value="both">Both channels</option></select></label>
                <label><span>Delivery time</span><select name="delivery_timing" value={timing} onChange={(e) => setTiming(e.target.value)}><option value="now">Send now</option><option value="later">Schedule for later</option></select></label>
                <label><span>Category</span><select name="type"><option>notice</option><option>academic</option><option>emergency</option><option>event</option><option>reminder</option></select></label>
                <label><span>Audience</span><select name="audience"><option value="all">All consented students</option><option value="segment">Class segment</option><option value="selected">Selected student IDs</option></select></label>
                <label><span>Department (optional)</span><input name="department" placeholder="e.g. Computer Science" /></label>
                <label><span>Semester (optional)</span><input name="semester" type="number" min="1" max="12" /></label>
                <label className="span"><span>Selected student IDs (comma separated)</span><input name="student_ids" placeholder="101, 102, 103" /></label>
                {timing === 'later' && <label className="span"><span>Schedule date and time <em>*</em></span><input name="scheduled_at" type="datetime-local" required /></label>}
              </div>
              <div className="modal-actions">
                <span className="muted">Delivers to active students with consent.</span>
                <button className="primary" disabled={busy}><Send />{busy ? 'Processing...' : timing === 'later' ? 'Schedule' : 'Send now'}</button>
              </div>
            </>
          )}
        </form>
        <aside className="panel preview">
          <p className="eyebrow">{channel === 'web_push' ? 'WEB PUSH PREVIEW' : 'WHATSAPP TEMPLATE PREVIEW'}</p>
          <div className="phone-preview">
            <div className="wa-head">
              <MessageCircle />
              <div><b>CampusMate AI</b><span>Official college assistant</span></div>
            </div>
            <div className="chat-bg">
              <div className="bubble">
                <b>Your notification title</b>
                <p>Your message will appear here for consented students.</p>
                <span>10:30 AM</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <section className="table-panel">
        <div className="panel-head">
          <div><h2>Recent Notifications</h2><p>Live status of campus announcements</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Title</th><th>Channel</th><th>Status</th><th>Recipients</th><th>Delivered</th><th>Created</th></tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={String(item.id)}>
                  <td>{formatValue(item.title)}</td>
                  <td>{formatValue(item.delivery_channel)}</td>
                  <td><span className="badge">{formatValue(item.status)}</span></td>
                  <td>{formatValue(item.recipient_count)}</td>
                  <td>{formatValue(item.delivered_count)}</td>
                  <td>{formatValue(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && <Empty text="No notifications have been created yet." />}
        </div>
      </section>
    </>
  );
}

// ==========================================
// 11. DEDICATED PROMPT MANAGER PAGE
// ==========================================
function PromptManagerPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NATURAL LANGUAGE DATA MANAGER</p>
          <h1>AI-Powered College Data Manager</h1>
          <p>Update timetables, publish notices, create events, and configure faculty using plain English.</p>
        </div>
      </div>
      <PromptDataManager />
    </>
  );
}

// ==========================================
// 12. ROUTE GUARDS & APP ROOT
// ==========================================
function AdminProtected() {
  return session.get() ? (
    <AdminShell>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="prompt-manager" element={<PromptManagerPage />} />
        <Route path="manage/emergency_contacts" element={<EmergencyContactsPage />} />
        <Route path="manage/timetables" element={<TimetablePage />} />
        <Route path="manage/:resource" element={<ResourcePage />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/admin" />} />
      </Routes>
    </AdminShell>
  ) : (
    <Navigate to="/admin/login" />
  );
}

function StudentProtected() {
  return studentSession.get() ? <ChatPage /> : <Navigate to="/student-login" />;
}

function StudentTimetableProtected() {
  return studentSession.get() ? <StudentTimetablePage /> : <Navigate to="/student-login" />;
}

export default function App() {
  return (
    <ThemeProvider><Routes>
      {/* 
        First screen when visiting the website: Student Login!
        If already authenticated as student, directs to /chat.
      */}
      <Route
        path="/"
        element={studentSession.get() ? <Navigate to="/chat" /> : <StudentLogin />}
      />
      <Route
        path="/student-login"
        element={studentSession.get() ? <Navigate to="/chat" /> : <StudentLogin />}
      />
      <Route path="/chat" element={<StudentProtected />} />
      <Route path="/timetable" element={<StudentTimetableProtected />} />

      {/* 
        Separate Admin Login:
        Completely separate from student login.
      */}
      <Route
        path="/admin/login"
        element={session.get() ? <Navigate to="/admin" /> : <AdminLogin />}
      />
      <Route
        path="/login"
        element={<Navigate to="/admin/login" />}
      />

      {/* Admin Dashboard Protected Routes */}
      <Route path="/admin/*" element={<AdminProtected />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes></ThemeProvider>
  );
}
