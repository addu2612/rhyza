'use strict';

import { ProcessPreparePacketCmdPayload } from '../commands';
import { InboundPrepareSnapshot } from '../packet';

export function inboundPrepareFrom(
  payload: ProcessPreparePacketCmdPayload
): InboundPrepareSnapshot {
  return {
    destinationIlpAddress: payload.destinationIlpAddress,
    amount: payload.amount,
    expiresAt: payload.expiresAt,
    executionCondition: payload.executionCondition,
    data: payload.data ?? ''
  };
}

export function toIlpPrepare(snapshot: InboundPrepareSnapshot): {
  destination: string;
  amount: string;
  expiresAt: Date;
  executionCondition: Buffer;
  data: Buffer;
} {
  return {
    destination: snapshot.destinationIlpAddress,
    amount: snapshot.amount,
    expiresAt: new Date(snapshot.expiresAt),
    executionCondition: Buffer.from(snapshot.executionCondition, 'base64'),
    data: Buffer.from(snapshot.data, 'base64')
  };
}
