import { z } from 'zod';

const assignmentSchema = z.object({
  title: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  department: z.string().trim().min(1),
  semester: z.coerce.number().int().min(1).max(12),
  due_at: z.string().min(1),
});

const examSchema = z.object({
  title: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  department: z.string().trim().min(1),
  semester: z.coerce.number().int().min(1).max(12),
  exam_date: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  instructions: z.string().trim().nullable().optional(),
});

const collegeInfoSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  category: z.string().trim().min(1),
});

const emergencyContactSchema = z.object({
  contact_name: z.string().trim().min(1),
  phone_number: z.string().trim()
    .regex(/^\+?[0-9][0-9\s()-]{1,19}$/, 'Enter a valid phone or short emergency number')
    .refine((value) => value.replace(/\D/g, '').length >= 3, 'Emergency numbers must contain at least three digits'),
  role_or_service: z.string().trim().min(1),
  emergency_type: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priority: z.coerce.number().int().min(1).max(999),
  active: z.boolean(),
  contact_type: z.enum(['faculty', 'public_service']),
});

export function validatedPayload(table: string, body: Record<string, unknown>): Record<string, unknown> {
  if (table === 'assignments') return assignmentSchema.parse(body);
  if (table === 'exams') return examSchema.parse(body);
  if (table === 'college_info') return collegeInfoSchema.parse(body);
  if (table === 'emergency_contacts') return emergencyContactSchema.parse(body);
  return body;
}
