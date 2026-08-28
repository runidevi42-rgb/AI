import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { asyncHandler } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { answerStudent } from '../services/assistant.js';
import { hasProcessedMessage, normalizePhone, recordMessageStatus, sendText } from '../services/whatsapp.js';

export const webhookRouter = Router();
const inFlightMessageIds = new Set<string>();

webhookRouter.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (typeof signature !== 'string' || !rawBody) return res.sendStatus(401);
  const expected = `sha256=${crypto.createHmac('sha256', config.WHATSAPP_APP_SECRET).update(rawBody).digest('hex')}`;
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return res.sendStatus(401);
  next();
});

webhookRouter.get('/', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(req.query['hub.challenge']);
  return res.sendStatus(403);
});

webhookRouter.post('/', asyncHandler(async (req, res) => {
  res.sendStatus(200);
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;

  const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
  if (statuses.length) {
    await Promise.allSettled(statuses.map((status: { id?: string; status?: string; timestamp?: string; errors?: unknown }) => recordMessageStatus(status)));
  }

  const messages = Array.isArray(value?.messages) ? value.messages : [];
  if (!messages.length) {
    logger.debug({ eventType: value?.statuses ? 'message_status' : 'non_message' }, 'Ignored WhatsApp webhook event');
    return;
  }

  await Promise.allSettled(messages.map(async (item: { id?: string; from?: string; type?: string; timestamp?: string; text?: { body?: string } }) => {
    if (item.type !== 'text' || !item.from || typeof item.text?.body !== 'string') {
      logger.debug({ messageId: item.id, messageType: item.type }, 'Ignored non-text WhatsApp message');
      return;
    }

    if (!item.id) return;
    if (inFlightMessageIds.has(item.id)) return;
    if (await hasProcessedMessage(item.id)) {
      logger.debug({ messageId: item.id }, 'Ignored duplicate WhatsApp message');
      return;
    }
    inFlightMessageIds.add(item.id);
    const senderNumber = normalizePhone(item.from);
    logger.info({ senderSuffix: senderNumber.slice(-4), messageId: item.id, timestamp: item.timestamp }, 'Incoming WhatsApp text message');

    try {
      const reply = await answerStudent(senderNumber, item.text.body, item.id);
      await sendText(senderNumber, reply.text, { studentId: 'studentId' in reply ? reply.studentId : undefined });
    } catch (error) {
      logger.error({ err: error, messageId: item.id }, 'Could not process incoming message');
      await sendText(senderNumber, 'I am temporarily unable to process this question. Please try again.');
    } finally {
      inFlightMessageIds.delete(item.id);
    }
  }));
}));
