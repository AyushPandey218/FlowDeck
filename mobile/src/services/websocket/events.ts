import { createWSMessage, WSMessageEnvelope, WSMessageType } from '@flowdeck/shared/protocol';

export function createPongMessage(): WSMessageEnvelope<null> {
  return createWSMessage('PONG', null);
}

export function parseWSMessage(data: string): WSMessageEnvelope | null {
  try {
    const envelope = JSON.parse(data) as WSMessageEnvelope;
    if (envelope && typeof envelope.type === 'string') {
      return envelope;
    }
  } catch (e) {
    console.error('[SOCKET] Failed to parse WS message:', e);
  }
  return null;
}
