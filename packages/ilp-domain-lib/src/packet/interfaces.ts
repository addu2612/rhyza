export const PacketState = {
  PENDING: 'PENDING',
  FULFILLED: 'FULFILLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
} as const;
export type PacketState = keyof typeof PacketState;

interface BasePacketCorrelation {
  packetId: string;
  peerId: string;
  paymentIntentId: string;
  expiresAt: Date;
  state: PacketState;
}

interface QuotePacketCorrelation extends BasePacketCorrelation {
  kind: 'QUOTE';
  quoteId: string;
  requestId: string;
  // Outbound quote probes store the STREAM shared secret to decrypt the
  // remote `prepareAmount` from the reject `data`.
  sharedSecret?: string;
}

interface PaymentPacketCorrelation extends BasePacketCorrelation {
  kind: 'PAYMENT';
  paymentId: string;
  requestId: string;
  // Outbound prepares store the base64 execution condition so a later
  // fulfill can be hashed against it.
  executionCondition?: string;
}

export type IPacketCorrelation =
  | QuotePacketCorrelation
  | PaymentPacketCorrelation;

export interface InboundPrepareSnapshot {
  destinationIlpAddress: string;
  amount: string;
  expiresAt: string;
  executionCondition: string;
  data: string;
}

// Connector-issued id for answering an inbound prepare later. Domain stores
// and forwards it and the connector resolves how to deliver on the wire.
export interface IInboundPacketReplyHandle {
  packetId: string;
  peerId: string;
  replyHandle: string;
  inboundPrepare: InboundPrepareSnapshot;
  expiresAt: string;
}

// To be implemented by the adapter for sending packets.
export interface IPeeringClient {
  dispatch(input: PacketDispatch): Promise<void>;
  dispatchReject(input: RejectDispatch): Promise<void>;
  dispatchFulfill(input: FulfillDispatch): Promise<void>;
}

export interface InboundReplyDispatch {
  peerId: string;
  packetId: string;
  replyHandle: string;
}

export interface FulfillDispatch extends InboundReplyDispatch {
  fulfillment: string;
  data?: string;
}

export interface RejectDispatch extends InboundReplyDispatch {
  rejectCode: string;
  rejectMessage?: string;
  triggeredBy?: string;
  data?: string;
}

export type PacketDispatch = QuoteDispatch | PaymentDispatch;

export interface QuoteDispatch {
  type: 'QUOTE';
  peerId: string;
  packetId: string;
  paymentIntentId: string;
  quoteId: string;
  destinationIlpAddress: string;
  sourceAmount: string;
  sourceAssetCode: string;
  sourceAssetScale: number;
  expiresAt: string;
  data: string;
}

export interface PaymentDispatch {
  type: 'PAYMENT';
  peerId: string;
  packetId: string;
  paymentIntentId: string;
  paymentId: string;
  destinationIlpAddress: string;
  amount: string;
  assetCode: string;
  assetScale: number;
  expiresAt: string;
  sharedSecret: string;
  executionCondition: string;
  data: string;
}
