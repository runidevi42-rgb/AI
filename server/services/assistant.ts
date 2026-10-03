import Groq from 'groq-sdk';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { buildProfileResponse, detectProfileIntent, fetchCompleteStructuredAnswer, fetchGeneralCollegeAnswer, findStudent, UNREGISTERED_REPLY, type StudentProfile } from './knowledge.js';
import { detectChatbotIntent, type ChatbotIntent } from './intent.js';
import { normalizePhone } from './whatsapp.js';

const groq = new Groq({ apiKey: config.GROQ_API_KEY });
const AI_FAILURE_REPLY = 'I am temporarily unable to process this question. Please try again.';
const DB_FAILURE_REPLY = 'The college database is temporarily unavailable. Please try again later.';

export function getWhatsAppSessionId(studentId: number) { return `whatsapp-${studentId}`; }

async function logConversation(phone: string, studentId: number | undefined, incoming: string, response: string, intent: ChatbotIntent, sessionId?: string, channel = 'whatsapp', messageId?: string) {
  const storageChannel = channel === 'web' ? 'web_push' : channel;
  const { error } = await supabase.from('message_logs').insert([
    { phone, student_id: studentId, direction: 'inbound', message: incoming, status: 'received', provider_message_id: channel === 'whatsapp' ? messageId : undefined, channel: storageChannel, metadata: { intent, channel, session_id: sessionId } },
    { phone, student_id: studentId, direction: 'outbound', message: response, status: 'generated', channel: storageChannel, metadata: { intent, channel, session_id: sessionId } },
  ]);
  if (error) logger.warn({ message: error.message, code: error.code }, 'Conversation audit log failed');
}

export function getWebSessionId(studentId: number) { return `web-${studentId}`; }

export async function getWebConversation(studentId: number) {
  const sessionId = getWebSessionId(studentId);
  const result = await supabase.from('message_logs').select('direction,message,created_at,metadata').eq('student_id', studentId).eq('channel', 'web_push').eq('metadata->>session_id', sessionId).order('created_at', { ascending: true }).limit(100);
  if (result.error) throw result.error;
  return { sessionId, messages: (result.data ?? []).map((row) => ({ role: row.direction === 'inbound' ? 'user' : 'assistant', text: row.message, createdAt: row.created_at })) };
}

async function answerWithAI(message: string, student: StudentProfile, sessionId?: string) {
  try {
    const history = sessionId ? await supabase.from('message_logs').select('direction,message').eq('student_id', student.student_id).eq('metadata->>session_id', sessionId).order('created_at', { ascending: false }).limit(8) : { data: [] };
    const previous = (history.data ?? []).reverse().map((item) => ({ role: item.direction === 'inbound' ? 'user' as const : 'assistant' as const, content: item.message }));
    const messages = [
      { role: 'system' as const, content: 'You are a concise, friendly college study assistant. Answer greetings and study/general questions only. Never invent official college data, student details, attendance, exams, timetable, assignments, notices, or contacts. Say that official information is unavailable when asked for it.' },
      ...previous,
      { role: 'user' as const, content: message },
    ];
    let completion;
    try {
      completion = await groq.chat.completions.create({ model: config.GROQ_MODEL || 'openai/gpt-oss-120b', temperature: 0.1, max_tokens: 300, messages });
    } catch (error) {
      const candidate = error as { status?: number; error?: { code?: string } };
      if ((candidate.status === 404 || candidate.error?.code === 'model_not_found') && config.GROQ_MODEL !== 'openai/gpt-oss-120b') {
        logger.warn({ configuredModel: config.GROQ_MODEL, fallbackModel: 'openai/gpt-oss-120b' }, 'Configured Groq model unavailable; retrying with fallback');
        completion = await groq.chat.completions.create({ model: 'openai/gpt-oss-120b', temperature: 0.1, max_tokens: 300, messages });
      } else throw error;
    }
    return completion.choices[0]?.message?.content?.trim() || AI_FAILURE_REPLY;
  } catch (error) {
    if (config.NODE_ENV === 'development') {
      const candidate = error as { status?: number; message?: string; error?: unknown; response?: { status?: number; data?: unknown } };
      const body = candidate.error ?? candidate.response?.data;
      logger.error({
        httpStatus: candidate.status ?? candidate.response?.status,
        errorMessage: candidate.message ?? 'Unknown Groq error',
        responseBody: typeof body === 'string' ? body.slice(0, 1000) : body,
        studentId: student.student_id,
      }, 'Groq response failed (development diagnostic)');
    } else {
      logger.error({ studentId: student.student_id }, 'Groq response failed');
    }
    return AI_FAILURE_REPLY;
  }
}

export async function answerStudent(phoneInput: string, message: string, messageId?: string) {
  const phone = normalizePhone(phoneInput);
  let student: StudentProfile | null;
  try { student = await findStudent(phone); } catch (error) {
    logger.error({ err: error, senderSuffix: phone.slice(-4) }, 'Student lookup failed');
    return { authenticated: false, text: DB_FAILURE_REPLY, intent: 'UNKNOWN' as ChatbotIntent };
  }
  if (!student) return { authenticated: false, text: UNREGISTERED_REPLY, intent: 'UNKNOWN' as ChatbotIntent };

  return answerStudentProfile(student, message, getWhatsAppSessionId(student.student_id), 'whatsapp', messageId);
}

export async function answerStudentProfile(student: StudentProfile, message: string, sessionId?: string, channel = 'web', messageId?: string) {
  const phone = normalizePhone(student.whatsapp_number);

  const profileIntent = detectProfileIntent(message);
  if (profileIntent) {
    const text = buildProfileResponse(student, profileIntent);
    await logConversation(phone, student.student_id, message, text, 'GENERAL_COLLEGE', sessionId, channel, messageId);
    return { authenticated: true, text, studentId: student.student_id, intent: 'GENERAL_COLLEGE' as ChatbotIntent };
  }

  let intent = detectChatbotIntent(message);
  let dataQuery = message;
  if (intent === 'UNKNOWN' && sessionId) {
    const previous = await supabase.from('message_logs').select('message,metadata').eq('student_id', student.student_id).eq('channel', channel === 'web' ? 'web_push' : channel).eq('metadata->>session_id', sessionId).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (previous.data?.message) dataQuery = `${previous.data.message} ${message}`;
    const priorIntent = previous.data?.metadata && typeof previous.data.metadata === 'object' && 'intent' in previous.data.metadata ? String((previous.data.metadata as Record<string, unknown>).intent) : '';
    if (['ATTENDANCE', 'TIMETABLE', 'LUNCH_BREAK', 'ASSIGNMENT', 'EXAM', 'NOTICE', 'EMERGENCY_CONTACT', 'FACULTY_CONTACT'].includes(priorIntent)) intent = priorIntent as ChatbotIntent;
  }
  if (intent === 'GREETING') {
    const text = `Hello ${student.full_name} 👋\nWelcome to the College AI Assistant. How can I help you today?`;
    await logConversation(phone, student.student_id, message, text, intent, sessionId, channel, messageId);
    return { authenticated: true, text, studentId: student.student_id, intent };
  }
  if (intent === 'THANKS') {
    const text = 'You\'re welcome! 😊';
    await logConversation(phone, student.student_id, message, text, intent, sessionId, channel, messageId);
    return { authenticated: true, text, studentId: student.student_id, intent };
  }
  if (intent === 'GOODBYE') {
    const text = 'Goodbye! 👋 Have a great day.';
    await logConversation(phone, student.student_id, message, text, intent, sessionId, channel, messageId);
    return { authenticated: true, text, studentId: student.student_id, intent };
  }
  if (intent === 'TIMETABLE' && /don'?t understand|do not understand|confused|samajh nahi/.test(message.toLowerCase())) {
    const text = 'No problem! I can help. Would you like to see your next class or today\'s timetable?';
    await logConversation(phone, student.student_id, message, text, intent, sessionId, channel, messageId);
    return { authenticated: true, text, studentId: student.student_id, intent };
  }
  if (intent === 'GENERAL_COLLEGE') {
    try {
      const text = await fetchGeneralCollegeAnswer();
      await logConversation(phone, student.student_id, message, text, intent, sessionId, channel, messageId);
      return { authenticated: true, text, studentId: student.student_id, intent };
    } catch (error) {
      logger.error({ err: error, studentId: student.student_id, intent }, 'College information query failed');
      return { authenticated: true, text: DB_FAILURE_REPLY, studentId: student.student_id, intent };
    }
  }
  if (['ATTENDANCE', 'TIMETABLE', 'LUNCH_BREAK', 'ASSIGNMENT', 'EXAM', 'NOTICE', 'EMERGENCY_CONTACT', 'FACULTY_CONTACT'].includes(intent)) {
    try {
      const text = await fetchCompleteStructuredAnswer(student, intent as 'ATTENDANCE' | 'TIMETABLE' | 'LUNCH_BREAK' | 'ASSIGNMENT' | 'EXAM' | 'NOTICE' | 'EMERGENCY_CONTACT' | 'FACULTY_CONTACT', dataQuery);
      await logConversation(phone, student.student_id, message, text, intent, sessionId, channel, messageId);
      return { authenticated: true, text, studentId: student.student_id, intent };
    } catch (error) {
      logger.error({ err: error, studentId: student.student_id, intent }, 'Structured chatbot query failed');
      return { authenticated: true, text: DB_FAILURE_REPLY, studentId: student.student_id, intent };
    }
  }
  const text = await answerWithAI(message, student, sessionId);
  await logConversation(phone, student.student_id, message, text, intent, sessionId, channel, messageId);
  return { authenticated: true, text, studentId: student.student_id, intent };
}
