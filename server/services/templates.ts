import { config } from '../config.js';

export type WhatsAppTemplateKind = 'timetable' | 'timetable_update' | 'assignment' | 'exam' | 'event' | 'notification';

const definitions: Record<WhatsAppTemplateKind, { environment: keyof typeof config; parameterCount: number }> = {
  timetable: { environment: 'WHATSAPP_TIMETABLE_TEMPLATE', parameterCount: 3 },
  timetable_update: { environment: 'WHATSAPP_TIMETABLE_UPDATE_TEMPLATE', parameterCount: 4 },
  assignment: { environment: 'WHATSAPP_ASSIGNMENT_TEMPLATE', parameterCount: 3 },
  exam: { environment: 'WHATSAPP_EXAM_TEMPLATE', parameterCount: 4 },
  event: { environment: 'WHATSAPP_EVENT_TEMPLATE', parameterCount: 3 },
  notification: { environment: 'WHATSAPP_NOTIFICATION_TEMPLATE', parameterCount: 3 },
};

export class TemplateConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateConfigurationError';
  }
}

export function resolveTemplate(kind: WhatsAppTemplateKind, parameters: string[], source: typeof config = config) {
  const definition = definitions[kind];
  const name = String(source[definition.environment] ?? '').trim();
  if (!name) throw new TemplateConfigurationError(`${definition.environment} is required for ${kind.replace('_', ' ')} WhatsApp alerts`);
  if (!/^[a-z0-9_]+$/.test(name)) throw new TemplateConfigurationError(`${definition.environment} must be an approved Meta template name using lowercase letters, numbers and underscores`);
  if (parameters.length !== definition.parameterCount) {
    throw new TemplateConfigurationError(`${definition.environment} requires exactly ${definition.parameterCount} body parameters`);
  }
  return { kind, name, language: source.WHATSAPP_TEMPLATE_LANGUAGE, parameters: parameters.map((value) => String(value)) };
}

export function templateEnvironmentName(kind: WhatsAppTemplateKind) {
  return definitions[kind].environment;
}
