import Groq from 'groq-sdk';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { getCurrentCollegeDateTime } from '../utils/college-time.js';

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

export interface ExtractedField {
  key: string;
  label: string;
  value: unknown;
  type?: string;
  options?: string[];
  required?: boolean;
}

export interface PromptInterpretationResult {
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
  fields: ExtractedField[];
  warnings?: string[];
  confidence: 'high' | 'medium' | 'low';
}

const RESOURCE_LABELS: Record<string, string> = {
  timetables: 'Timetable',
  notices: 'Notices',
  events: 'Events',
  assignments: 'Assignments',
  exams: 'Examinations',
  faculty: 'Faculty',
  attendance: 'Attendance',
  emergency_contacts: 'Emergency Contacts',
  college_info: 'College Information',
  faqs: 'FAQs',
  students: 'Students',
};

const SYSTEM_PROMPT = `You are CampusMate AI's administrative data assistant for a college ERP system.
Your job is to analyze natural language instructions from college administrators and translate them into structured database operations.

Supported tables:
- timetables: day_of_week ('Monday'..'Sunday'), start_time (HH:MM:SS), end_time (HH:MM:SS), subject, teacher, room, batch_group, department, semester, is_recess (boolean)
- notices: title, content, category ('general'|'academic'|'placement'|'internship'|'holiday'|'emergency'), priority ('low'|'normal'|'high'|'urgent'), department, semester, expires_at (ISO datetime)
- events: title, description, event_type ('event'|'holiday'|'workshop'|'seminar'|'placement'), start_at (ISO datetime), end_at (ISO datetime), venue, department
- assignments: title, subject, description, department, semester (number), due_at (ISO datetime)
- exams: title, subject, department, semester (number), exam_date (YYYY-MM-DD), start_time (HH:MM:SS), end_time (HH:MM:SS), instructions
- faculty: full_name, designation, department, email, phone, office, office_room, subjects
- emergency_contacts: contact_name, phone_number, role_or_service, emergency_type, description, priority (number), contact_type ('faculty'|'public_service'), active (boolean)
- college_info: title, content, category
- faqs: question, answer, category
- attendance: student_id, subject, attendance_date (YYYY-MM-DD), status ('present'|'absent'|'late'|'excused')

Available actions:
- 'insert': adding a new record
- 'update': modifying an existing record (e.g. moving a class time, changing a room, editing details)
- 'delete': removing a record
- 'clarification_needed': if vital fields are missing or the command is too ambiguous to identify what to do

Current college timezone: Asia/Kolkata.
Resolve relative dates (e.g. "tomorrow", "this Friday", "next week", "20 November") based on current context.

Respond ONLY with valid JSON with this schema:
{
  "action": "insert" | "update" | "delete" | "clarification_needed",
  "target_resource": string,
  "summary": string,
  "clarification_question": string | null,
  "extracted_data": Record<string, any>,
  "match_criteria": Record<string, any>,
  "confidence": "high" | "medium" | "low"
}`;

/**
 * Fallback deterministic extractor in case Groq is unavailable or fails.
 */
function fallbackInterpret(prompt: string, contextDate: { date: string; weekday: string }): {
  action: 'insert' | 'update' | 'delete' | 'clarification_needed';
  target_resource: string;
  summary: string;
  clarification_question?: string;
  extracted_data: Record<string, unknown>;
  match_criteria: Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
} {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  // 1. Notices
  if (lower.includes('notice') || lower.includes('announcement')) {
    const isDelete = /\b(delete|remove)\b/.test(lower);
    const semMatch = lower.match(/(\d+)(?:st|nd|rd|th)?\s*(?:sem|semester)/i) || lower.match(/(?:sem|semester)\s*(\d+)/i);
    const deptMatch = lower.match(/\b(cse|ece|mech|civil|it|bca|mca|btech|mba)\b/i);
    const dept = deptMatch ? deptMatch[1].toUpperCase() : undefined;
    const sem = semMatch ? Number(semMatch[1]) : undefined;

    if (isDelete) {
      return {
        action: 'delete',
        target_resource: 'notices',
        summary: `Delete notice matching "${p}"`,
        extracted_data: {},
        match_criteria: { search: p.replace(/^(delete|remove)\s*(notice|announcement)?\s*/i, '') },
        confidence: 'medium',
      };
    }

    return {
      action: 'insert',
      target_resource: 'notices',
      summary: `Publish new notice${dept ? ` for ${dept}` : ''}${sem ? ` Sem ${sem}` : ''}`,
      extracted_data: {
        title: p.length > 50 ? `${p.slice(0, 47)}...` : p,
        content: p,
        category: lower.includes('test') || lower.includes('exam') ? 'academic' : 'general',
        priority: lower.includes('urgent') || lower.includes('important') ? 'high' : 'normal',
        department: dept ?? null,
        semester: sem ?? null,
      },
      match_criteria: {},
      confidence: 'medium',
    };
  }

  // 2. Events
  if (lower.includes('event') || lower.includes('fest') || lower.includes('workshop') || lower.includes('seminar')) {
    const isDelete = /\b(delete|remove)\b/.test(lower);
    if (isDelete) {
      return {
        action: 'delete',
        target_resource: 'events',
        summary: `Delete event matching "${p}"`,
        extracted_data: {},
        match_criteria: { search: p.replace(/^(delete|remove)\s*(event)?\s*/i, '') },
        confidence: 'medium',
      };
    }

    const titleMatch = p.match(/(?:called|named|titled)\s+["']?([^"']+)["']?/i) || p.match(/(?:event)\s+["']?([^"',.]+)/i);
    const title = titleMatch ? titleMatch[1].trim() : 'College Event';
    const venueMatch = p.match(/(?:in|at)\s+(?:the\s+)?([A-Za-z0-9\s]+(?:auditorium|hall|ground|lab|room|campus))/i);
    const venue = venueMatch ? venueMatch[1].trim() : 'Main Campus';

    const now = new Date();
    const startAt = new Date(now.getTime() + 7 * 86400000).toISOString();
    const endAt = new Date(now.getTime() + 7 * 86400000 + 4 * 3600000).toISOString();

    return {
      action: 'insert',
      target_resource: 'events',
      summary: `Create college event: ${title}`,
      extracted_data: {
        title,
        description: p,
        event_type: lower.includes('workshop') ? 'workshop' : lower.includes('seminar') ? 'seminar' : 'event',
        start_at: startAt,
        end_at: endAt,
        venue,
      },
      match_criteria: {},
      confidence: 'medium',
    };
  }

  // 3. Timetable
  if (lower.includes('timetable') || lower.includes('class') || lower.includes('lecture')) {
    const isUpdate = /\b(update|change|move|reschedule|shift)\b/.test(lower);
    const isDelete = /\b(delete|cancel|remove)\b/.test(lower);
    const dayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const day = dayMatch ? dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase() : contextDate.weekday;

    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    let start_time = '10:00:00';
    let end_time = '11:00:00';
    if (timeMatch) {
      let h1 = parseInt(timeMatch[1], 10);
      const m1 = timeMatch[2] || '00';
      const p1 = (timeMatch[3] || '').toLowerCase();
      if (p1 === 'pm' && h1 < 12) h1 += 12;
      start_time = `${String(h1).padStart(2, '0')}:${m1}:00`;

      let h2 = parseInt(timeMatch[4], 10);
      const m2 = timeMatch[5] || '00';
      const p2 = (timeMatch[6] || p1).toLowerCase();
      if (p2 === 'pm' && h2 < 12) h2 += 12;
      end_time = `${String(h2).padStart(2, '0')}:${m2}:00`;
    } else {
      const singleTimeMatch = lower.match(/(?:at|to|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (singleTimeMatch) {
        let h = parseInt(singleTimeMatch[1], 10);
        const m = singleTimeMatch[2] || '00';
        const meridian = (singleTimeMatch[3] || '').toLowerCase();
        if (meridian === 'pm' && h < 12) h += 12;
        start_time = `${String(h).padStart(2, '0')}:${m}:00`;
        end_time = `${String((h + 1) % 24).padStart(2, '0')}:${m}:00`;
      }
    }

    const teacherMatch = p.match(/(?:with|by|prof|mr|ms|dr)\.?\s+([A-Za-z\s]+?)(?:\s+in|\s+at|\s+room|$)/i);
    const teacher = teacherMatch ? teacherMatch[1].trim() : null;

    const roomMatch = p.match(/(?:room|hall|lab)\s*[:#-]?\s*([A-Za-z0-9-]+)/i);
    const room = roomMatch ? `Room ${roomMatch[1]}` : null;

    const subjectMatch =
      p.match(/(?:timetable[.:,\s]+)([A-Za-z\s]+?)(?:\s+is|\s+at|\s+from|\s+in|$)/i) ||
      p.match(/([A-Z][A-Za-z\s]+?)\s+is\s+(?:now\s+)?(?:from|at)/i) ||
      p.match(/(?:class of|lecture of|subject|for|class|lecture)\s+([A-Za-z\s]+?)(?:\s+is|\s+at|\s+from|\s+in|$)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : 'Academic Lecture';

    if (isUpdate) {
      return {
        action: 'update',
        target_resource: 'timetables',
        summary: `Update timetable entry for ${subject} on ${day}`,
        extracted_data: { day_of_week: day, start_time, end_time, subject, ...(teacher ? { teacher } : {}), ...(room ? { room } : {}) },
        match_criteria: { day_of_week: day, subject },
        confidence: 'medium',
      };
    }

    if (isDelete) {
      return {
        action: 'delete',
        target_resource: 'timetables',
        summary: `Delete class ${subject} on ${day}`,
        extracted_data: {},
        match_criteria: { day_of_week: day, subject },
        confidence: 'medium',
      };
    }

    return {
      action: 'insert',
      target_resource: 'timetables',
      summary: `Add ${subject} class on ${day} (${start_time} - ${end_time})`,
      extracted_data: {
        day_of_week: day,
        start_time,
        end_time,
        subject,
        teacher,
        room,
        is_recess: false,
      },
      match_criteria: {},
      confidence: 'medium',
    };
  }

  // 4. Emergency Contacts
  if (lower.includes('emergency') || lower.includes('ambulance') || lower.includes('police') || lower.includes('helpline')) {
    const isDelete = /\b(delete|remove)\b/.test(lower);
    const phoneMatch = p.match(/\b(?:\+?\d{1,3}[- ]?)?\d{3,12}\b/);
    const phone = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : '112';

    if (isDelete) {
      return {
        action: 'delete',
        target_resource: 'emergency_contacts',
        summary: `Remove emergency contact matching "${p}"`,
        extracted_data: {},
        match_criteria: { search: p.replace(/^(delete|remove)\s*(emergency|contact)?\s*/i, '') },
        confidence: 'medium',
      };
    }

    return {
      action: 'insert',
      target_resource: 'emergency_contacts',
      summary: 'Add emergency contact',
      extracted_data: {
        contact_name: p.slice(0, 30),
        phone_number: phone,
        role_or_service: 'Emergency support',
        emergency_type: 'Other urgent situation',
        description: p,
        priority: 10,
        active: true,
        contact_type: 'public_service',
      },
      match_criteria: {},
      confidence: 'medium',
    };
  }

  // Default clarification needed if ambiguous
  return {
    action: 'clarification_needed',
    target_resource: 'timetables',
    summary: 'Clarification required',
    clarification_question: 'Could you please specify whether this update is for Timetables, Notices, Events, Assignments, Exams, or Faculty?',
    extracted_data: {},
    match_criteria: {},
    confidence: 'low',
  };
}

/**
 * Main function: interprets an administrator's prompt and generates a structured preview.
 */
export async function interpretAdminPrompt(prompt: string): Promise<PromptInterpretationResult> {
  const now = new Date();
  const collegeTime = getCurrentCollegeDateTime(now);
  const contextDate = { date: collegeTime.date, weekday: collegeTime.weekday, time: collegeTime.time };

  let parsed: {
    action: 'insert' | 'update' | 'delete' | 'clarification_needed';
    target_resource: string;
    summary: string;
    clarification_question?: string | null;
    extracted_data: Record<string, unknown>;
    match_criteria: Record<string, unknown>;
    confidence: 'high' | 'medium' | 'low';
  };

  try {
    const userMessage = `Context: Today is ${contextDate.weekday}, ${contextDate.date} at ${contextDate.time} (Asia/Kolkata).
Admin instruction: "${prompt.trim()}"`;

    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: config.GROQ_MODEL || 'openai/gpt-oss-120b',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }, { timeout: 3000 });
    } catch (apiErr) {
      const candidate = apiErr as { status?: number; error?: { code?: string } };
      if ((candidate.status === 404 || candidate.error?.code === 'model_not_found') && config.GROQ_MODEL !== 'openai/gpt-oss-120b') {
        completion = await groq.chat.completions.create({
          model: 'openai/gpt-oss-120b',
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }, { timeout: 3000 });
      } else {
        throw apiErr;
      }
    }

    const rawContent = completion.choices[0]?.message?.content?.trim() ?? '{}';
    parsed = JSON.parse(rawContent);
  } catch (err) {
    logger.warn({ err }, 'AI prompt interpretation failed; using heuristic fallback');
    parsed = fallbackInterpret(prompt, contextDate);
  }

  const targetResource = parsed.target_resource?.toLowerCase() || 'timetables';
  const action = parsed.action || 'insert';
  const summary = parsed.summary || `Process ${action} for ${targetResource}`;

  // If clarification needed
  if (action === 'clarification_needed') {
    return {
      operation_id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'clarification_needed',
      target_resource: targetResource,
      resource_label: RESOURCE_LABELS[targetResource] || targetResource,
      summary: parsed.clarification_question || 'Additional details are needed to perform this change.',
      clarification_question: parsed.clarification_question || 'Please provide more details.',
      fields: [],
      confidence: parsed.confidence || 'low',
    };
  }

  // Look up candidate records in Supabase for update / delete
  let matchingRecords: Record<string, unknown>[] = [];
  let existingRecord: Record<string, unknown> | undefined;
  let targetId: string | number | undefined;
  const warnings: string[] = [];

  if (action === 'update' || action === 'delete') {
    try {
      let query = supabase.from(targetResource).select('*').limit(10);
      const criteria = parsed.match_criteria || {};

      if (targetResource === 'timetables') {
        if (criteria.day_of_week) query = query.ilike('day_of_week', String(criteria.day_of_week));
        if (criteria.subject) query = query.ilike('subject', `%${String(criteria.subject).replace(/[%(),]/g, '')}%`);
        if (criteria.teacher) query = query.ilike('teacher', `%${String(criteria.teacher).replace(/[%(),]/g, '')}%`);
      } else if (targetResource === 'notices') {
        const search = criteria.title || criteria.search || criteria.subject;
        if (search) query = query.ilike('title', `%${String(search).replace(/[%(),]/g, '')}%`);
      } else if (targetResource === 'events') {
        const search = criteria.title || criteria.search;
        if (search) query = query.ilike('title', `%${String(search).replace(/[%(),]/g, '')}%`);
      } else if (targetResource === 'faculty') {
        const search = criteria.full_name || criteria.search || criteria.subject;
        if (search) query = query.ilike('full_name', `%${String(search).replace(/[%(),]/g, '')}%`);
      } else if (targetResource === 'emergency_contacts') {
        const search = criteria.contact_name || criteria.search;
        if (search) query = query.ilike('contact_name', `%${String(search).replace(/[%(),]/g, '')}%`);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        matchingRecords = data as Record<string, unknown>[];
        if (matchingRecords.length === 1) {
          existingRecord = matchingRecords[0];
          targetId = (existingRecord.id ?? existingRecord.student_id) as string | number;
        } else {
          warnings.push(`Found ${matchingRecords.length} candidate records matching this prompt. Select the intended record below.`);
        }
      } else {
        warnings.push(`No existing record found matching the criteria in ${RESOURCE_LABELS[targetResource] || targetResource}. Please review or edit.`);
      }
    } catch (e) {
      logger.warn({ e }, 'Database lookup for prompt match criteria failed');
    }
  }

  // Build proposed record
  const proposedRecord: Record<string, unknown> = {
    ...(existingRecord ?? {}),
    ...(parsed.extracted_data ?? {}),
  };

  // Convert proposed record into editable field definitions
  const fields = buildFieldDefinitions(targetResource, proposedRecord);

  return {
    operation_id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action,
    target_resource: targetResource,
    resource_label: RESOURCE_LABELS[targetResource] || targetResource,
    summary,
    target_id: targetId,
    existing_record: existingRecord,
    matching_records: matchingRecords.length > 1 ? matchingRecords : undefined,
    proposed_record: proposedRecord,
    fields,
    warnings: warnings.length > 0 ? warnings : undefined,
    confidence: parsed.confidence || 'high',
  };
}

/**
 * Converts a table record into editable form fields with labels and input types.
 */
function buildFieldDefinitions(resource: string, record: Record<string, unknown>): ExtractedField[] {
  const result: ExtractedField[] = [];
  const entries = Object.entries(record);

  for (const [key, val] of entries) {
    if (['id', 'created_at', 'updated_at'].includes(key)) continue;

    let type = 'text';
    let options: string[] | undefined;

    if (typeof val === 'boolean') {
      type = 'checkbox';
    } else if (typeof val === 'number') {
      type = 'number';
    } else if (key.endsWith('_time')) {
      type = 'time';
    } else if (key.endsWith('_date')) {
      type = 'date';
    } else if (key.endsWith('_at')) {
      type = 'datetime-local';
    } else if (['content', 'description', 'instructions'].includes(key)) {
      type = 'textarea';
    } else if (key === 'day_of_week') {
      type = 'select';
      options = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    } else if (key === 'priority') {
      type = 'select';
      options = ['low', 'normal', 'high', 'urgent'];
    } else if (key === 'category' && resource === 'notices') {
      type = 'select';
      options = ['general', 'academic', 'placement', 'internship', 'holiday', 'emergency'];
    } else if (key === 'event_type') {
      type = 'select';
      options = ['event', 'holiday', 'workshop', 'seminar', 'placement'];
    } else if (key === 'status' && resource === 'attendance') {
      type = 'select';
      options = ['present', 'absent', 'late', 'excused'];
    }

    result.push({
      key,
      label: formatFieldLabel(key),
      value: val ?? '',
      type,
      options,
      required: ['title', 'subject', 'day_of_week', 'start_time', 'end_time', 'full_name', 'department'].includes(key),
    });
  }

  return result;
}

function formatFieldLabel(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
