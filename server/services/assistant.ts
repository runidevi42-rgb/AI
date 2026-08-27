import Groq from 'groq-sdk';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { buildProfileResponse, detectProfileIntent, fetchGeneralCollegeAnswer, fetchStructuredAnswer, findStudent, UNREGISTERED_REPLY, type StudentProfile } from './knowledge.js';
import { detectChatbotIntent, type ChatbotIntent } from './intent.js';
import { normalizePhone } from './whatsapp.js';

const groq = new Groq({ apiKey: config.GROQ_API_KEY });
const AI_FAILURE_REPLY = 'I am temporarily unable to process this question. Please try again.';
const DB_FAILURE_REPLY = 'The college database is temporarily unavailable. Please try again later.';

function logConversation(phone: string, studentId: number | undefined, incoming: string, response: string, intent: ChatbotIntent, messageId?: string) {
  void supabase.from('message_logs').insert([
    { phone, student_id: studentId, direction: 'inbound', message: incoming, status: 'received', provider_message_id: messageId, channel: 'whatsapp', metadata: { intent } },
    { phone, student_id: studentId, direction: 'outbound', message: response, status: 'generated', channel: 'whatsapp', metadata: { intent } },
  ]).then(({ error }) => { if (error) logger.warn({ message: error.message, code: error.code }, 'Conversation audit log failed'); });
}

async function answerWithAI(message: string, student: StudentProfile) {
  try {
    const completion = await groq.chat.completions.create({
      model: config.GROQ_MODEL, temperature: 0.1, max_tokens: 300,
      messages: [
        { role: 'system', content: 'You are a concise, friendly college study assistant. Answer greetings and study/general questions only. Never invent official college data, student details, attendance, exams, timetable, assignments, notices, or contacts. Say that official information is unavailable when asked for it.' },
        { role: 'user', content: message },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || AI_FAILURE_REPLY;
  } catch (error) {
    logger.error({ err: error, studentId: student.student_id }, 'Groq response failed');
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

  const profileIntent = detectProfileIntent(message);
  if (profileIntent) {
    const text = buildProfileResponse(student, profileIntent);
    logConversation(phone, student.student_id, message, text, 'GENERAL_COLLEGE', messageId);
    return { authenticated: true, text, studentId: student.student_id, intent: 'GENERAL_COLLEGE' as ChatbotIntent };
  }

  const intent = detectChatbotIntent(message);
  if (intent === 'GREETING') {
    const text = `Hello ${student.full_name} 👋\nWelcome to the College AI Assistant. How can I help you today?`;
    logConversation(phone, student.student_id, message, text, intent, messageId);
    return { authenticated: true, text, studentId: student.student_id, intent };
  }
  if (intent === 'GENERAL_COLLEGE') {
    try {
      const text = await fetchGeneralCollegeAnswer();
      logConversation(phone, student.student_id, message, text, intent, messageId);
      return { authenticated: true, text, studentId: student.student_id, intent };
    } catch (error) {
      logger.error({ err: error, studentId: student.student_id, intent }, 'College information query failed');
      return { authenticated: true, text: DB_FAILURE_REPLY, studentId: student.student_id, intent };
    }
  }
  if (['ATTENDANCE', 'TIMETABLE', 'ASSIGNMENT', 'EXAM', 'NOTICE', 'EMERGENCY_CONTACT'].includes(intent)) {
    try {
      const text = await fetchStructuredAnswer(student, intent as 'ATTENDANCE' | 'TIMETABLE' | 'ASSIGNMENT' | 'EXAM' | 'NOTICE' | 'EMERGENCY_CONTACT');
      logConversation(phone, student.student_id, message, text, intent, messageId);
      return { authenticated: true, text, studentId: student.student_id, intent };
    } catch (error) {
      logger.error({ err: error, studentId: student.student_id, intent }, 'Structured chatbot query failed');
      return { authenticated: true, text: DB_FAILURE_REPLY, studentId: student.student_id, intent };
    }
  }
  const text = await answerWithAI(message, student);
  logConversation(phone, student.student_id, message, text, intent, messageId);
  return { authenticated: true, text, studentId: student.student_id, intent };
}
