'use strict';

import assert from 'node:assert';
import { createHash, randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  ConsoleLogger,
  IMessage,
  IMessageConsumer,
  IMessageProducer,
  IMessageProducerAcks
} from 'common-types-lib';
import {
  DispatchRejectPacketCmd,
  encryptStreamData,
  createFakeResolveStreamCredentials,
  hmacSha256,
  IlpPeerAggregate,
  IPeer,
  ENCRYPTION_KEY_STRING,
  FULFILLMENT_GENERATION_STRING,
  ProcessPreparePacketCmd,
  ILPPaymentFailedEvent,
  ILPQuoteRequestReceivedEvent,
  ILPPaymentReceivedEvent,
  ILPPaymentFulfillmentSentEvent,
  ILPPaymentFulfillmentFailedEvent,
  FulfillInboundPaymentCmd,
  DispatchFulfillPacketCmd,
  RespondToRemoteQuoteCmd,
  RejectInboundPaymentCmd
} from 'ilp-domain-lib';
import {
  InMemoryPeerRepository,
  KafkaPeeringClient
} from 'ilp-implementations-lib';
import { IlpCommandHandler } from '../src/cmd-handler';

class MockProducer implements IMessageProducer {
  readonly sent: IMessage[] = [];
  async send(message: IMessage | IMessage[]): Promise<IMessageProducerAcks[]> {
    this.sent.push(...(Array.isArray(message) ? message : [message]));
    return [];
  }
  async sendWithoutAcks(message: IMessage | IMessage[]): Promise<void> {
    await this.send(message);
  }
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async destroy(): Promise<void> {}
}

class MockConsumer implements IMessageConsumer {
  private _batchCb?: (messages: IMessage[]) => Promise<void>;
  setCallbackFn(): void {}
  setBatchCallbackFn(cb: (messages: IMessage[]) => Promise<void>): void {
    this._batchCb = cb;
  }
  setFilteringFn(): void {}
  setTopics(): void {}
  setBatchSize(): void {}
  async destroy(): Promise<void> {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async start(): Promise<void> {}
  async startAndWaitForRebalance(): Promise<void> {}
  async stop(): Promise<void> {}
  async deliver(messages: IMessage[]): Promise<void> {
    await this._batchCb?.(messages);
  }
}

const PEER: IPeer = {
  peerId: 'peer-1',
  http: { outgoing: { endpoint: 'https://peer.example/ilp', authToken: 't' } },
  isActive: true
};

const TEST_REPLY_HANDLE = 'reply-handle-inbound-1';
const PAYMENT_INTENT_ID = 'intent-1';

function fulfillablePrepareData(sharedSecret: Buffer): {
  data: string;
  executionCondition: string;
  fulfillment: Buffer;
} {
  const encryptionKey = hmacSha256(sharedSecret, ENCRYPTION_KEY_STRING);
  const dataBuf = encryptStreamData(encryptionKey, Buffer.from('stream-money'));
  const fulfillmentKey = hmacSha256(
    sharedSecret,
    FULFILLMENT_GENERATION_STRING
  );
  const fulfillment = hmacSha256(fulfillmentKey, dataBuf);
  const executionCondition = createHash('sha256').update(fulfillment).digest();
  return {
    data: dataBuf.toString('base64'),
    executionCondition: executionCondition.toString('base64'),
    fulfillment
  };
}

async function startedHandler(
  seedPeers: IPeer[] = [PEER],
  fake = createFakeResolveStreamCredentials(),
  paymentIntentId: string | null = PAYMENT_INTENT_ID
) {
  const credentials =
    paymentIntentId !== null
      ? fake.issueCredentials(paymentIntentId)
      : undefined;
  const producer = new MockProducer();
  const consumer = new MockConsumer();
  const repo = new InMemoryPeerRepository(seedPeers);
  const peeringClient = new KafkaPeeringClient(producer, new ConsoleLogger());
  const aggregate = new IlpPeerAggregate(
    repo,
    peeringClient,
    fake.resolveStreamCredentials
  );
  const handler = new IlpCommandHandler(
    consumer,
    producer,
    aggregate,
    new ConsoleLogger()
  );
  await handler.start();
  return { producer, consumer, repo, credentials, fake };
}

const inboundProbe = (
  destinationIlpAddress: string,
  overrides: Record<string, unknown> = {}
) =>
  new ProcessPreparePacketCmd({
    peerId: 'peer-1',
    packetId: 'packet-in-1',
    destinationIlpAddress,
    amount: '100',
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    replyHandle: TEST_REPLY_HANDLE,
    executionCondition: Buffer.alloc(32).toString('base64'),
    ...overrides
  });

const rejectFor = (producer: MockProducer): DispatchRejectPacketCmd =>
  producer.sent.find(
    (m) => m.msgName === DispatchRejectPacketCmd.name
  ) as DispatchRejectPacketCmd;

describe('IlpCommandHandler — remote quote receiving', () => {
  test('an inbound probe publishes a ILPQuoteRequestReceivedEvent with paymentIntentId', async () => {
    const { producer, consumer, credentials } = await startedHandler();
    assert.ok(credentials);
    await consumer.deliver([inboundProbe(credentials!.ilpAddress)]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
    ) as ILPQuoteRequestReceivedEvent;
    assert.ok(event, 'expected a ILPQuoteRequestReceivedEvent');
    assert.equal(event.msgTopic, 'ilp-domain-events');
    assert.equal(event.payload.peerId, 'peer-1');
    assert.equal(event.payload.packetId, 'packet-in-1');
    assert.equal(event.payload.incomingAmount, '100');
    assert.equal(event.payload.paymentIntentId, PAYMENT_INTENT_ID);
    assert.equal(
      (event.payload as { destinationIlpAddress?: string })
        .destinationIlpAddress,
      undefined
    );

    assert.equal(
      producer.sent.filter((m) => m.msgName === DispatchRejectPacketCmd.name)
        .length,
      0
    );
  });

  test('a calculated quote produces a reject carrying the amount', async () => {
    const { producer, consumer, credentials } = await startedHandler();
    await consumer.deliver([inboundProbe(credentials.ilpAddress)]);
    await consumer.deliver([
      new RespondToRemoteQuoteCmd({
        peerId: 'peer-1',
        packetId: 'packet-in-1',
        destinationAmount: '95'
      })
    ]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a DispatchRejectPacketCmd');
    assert.equal(reject.msgTopic, 'ilp-connector-commands');
    assert.equal(reject.msgKey, 'peer-1');
    assert.equal(reject.payload.peerId, 'peer-1');
    assert.equal(reject.payload.packetId, 'packet-in-1');
    assert.equal(reject.payload.replyHandle, TEST_REPLY_HANDLE);
    assert.equal(reject.payload.rejectCode, 'F99');
    assert.ok(reject.payload.data, 'expected the destination amount in data');
    const decoded = JSON.parse(
      Buffer.from(reject.payload.data as string, 'base64').toString()
    );
    assert.equal(decoded.destinationAmount, '95');
  });

  test('an invalid amount yields F03 and no event', async () => {
    const { producer, consumer, credentials } = await startedHandler();
    await consumer.deliver([
      inboundProbe(credentials.ilpAddress, { amount: '' })
    ]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected an F03 reject');
    assert.equal(reject.payload.rejectCode, 'F03');
    assert.equal(reject.payload.data, undefined, 'must not leak detail');
    assert.equal(
      producer.sent.filter(
        (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
      ).length,
      0
    );
  });

  test('an unresolved destination yields F06', async () => {
    const { producer, consumer } = await startedHandler(
      [PEER],
      createFakeResolveStreamCredentials(),
      null
    );
    await consumer.deliver([inboundProbe('test.rhyza.unknown-token')]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected an F06 reject');
    assert.equal(reject.payload.rejectCode, 'F06');
    assert.equal(reject.payload.data, undefined);
    assert.equal(
      producer.sent.filter(
        (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
      ).length,
      0
    );
  });

  test('an unresolved peer yields a generic T00 reject', async () => {
    const { producer, consumer, credentials } = await startedHandler();
    await consumer.deliver([
      inboundProbe(credentials.ilpAddress, { peerId: 'peer-unknown' })
    ]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a generic reject');
    assert.equal(reject.payload.peerId, 'peer-unknown');
    assert.equal(reject.payload.rejectCode, 'T00');
    assert.equal(
      producer.sent.filter(
        (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
      ).length,
      0
    );
  });

  test('an inactive peer yields a generic T00 reject', async () => {
    const { producer, consumer, credentials } = await startedHandler([
      { ...PEER, isActive: false }
    ]);
    await consumer.deliver([inboundProbe(credentials.ilpAddress)]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a generic reject');
    assert.equal(reject.payload.rejectCode, 'T00');
  });

  test('a missing calculated quote yields a generic reject', async () => {
    const { producer, consumer, credentials } = await startedHandler();
    await consumer.deliver([inboundProbe(credentials.ilpAddress)]);
    await consumer.deliver([
      new RespondToRemoteQuoteCmd({
        peerId: 'peer-1',
        packetId: 'packet-in-1'
      })
    ]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a generic reject');
    assert.equal(reject.payload.rejectCode, 'T00');
    assert.equal(reject.payload.data, undefined);
  });

  test('the receiving path never touches payment-receiving liquidity logic', async () => {
    const { producer, consumer, credentials } = await startedHandler();
    await consumer.deliver([inboundProbe(credentials.ilpAddress)]);
    await consumer.deliver([
      new RespondToRemoteQuoteCmd({
        peerId: 'peer-1',
        packetId: 'packet-in-1',
        destinationAmount: '95'
      })
    ]);

    assert.equal(
      producer.sent.filter((m) => m.msgName === ILPPaymentFailedEvent.name)
        .length,
      0
    );
  });

  test('a verified STREAM payment stores PAYMENT correlation and emits ILPPaymentReceivedEvent', async () => {
    const { producer, consumer, repo, credentials, fake } =
      await startedHandler();
    const resolved = await fake.resolveStreamCredentials(
      credentials.ilpAddress
    );
    assert.ok(resolved);
    const { data, executionCondition, fulfillment } = fulfillablePrepareData(
      resolved!.sharedSecret
    );

    const prepare = inboundProbe(credentials.ilpAddress, {
      packetId: 'packet-pay-1',
      data,
      executionCondition
    });
    await consumer.deliver([prepare]);

    assert.equal(
      producer.sent.filter(
        (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
      ).length,
      0
    );
    assert.equal(
      producer.sent.filter((m) => m.msgName === DispatchRejectPacketCmd.name)
        .length,
      0
    );

    const received = producer.sent.find(
      (m) => m.msgName === ILPPaymentReceivedEvent.name
    ) as ILPPaymentReceivedEvent;
    assert.ok(received);
    assert.equal(received.payload.packetId, 'packet-pay-1');
    assert.equal(received.payload.paymentIntentId, PAYMENT_INTENT_ID);
    assert.equal(received.payload.sourceAmount, '100');
    assert.equal(received.payload.peerId, 'peer-1');
    assert.equal(received.payload.expiresAt, prepare.payload.expiresAt);

    const stored = await repo.fetchPacketById('packet-pay-1');
    assert.ok(stored);
    assert.equal(stored!.kind, 'PAYMENT');
    assert.equal(stored!.paymentIntentId, PAYMENT_INTENT_ID);
    assert.equal(stored!.fulfillment, fulfillment.toString('base64'));
    assert.equal(stored!.paymentId, received.payload.paymentId);
  });

  test('STREAM verification failure with resolved destination stays on quote path', async () => {
    const { producer, consumer, credentials, fake } = await startedHandler();
    const resolved = await fake.resolveStreamCredentials(
      credentials.ilpAddress
    );
    assert.ok(resolved);
    const encryptionKey = hmacSha256(
      resolved!.sharedSecret,
      ENCRYPTION_KEY_STRING
    );
    const data = encryptStreamData(
      encryptionKey,
      Buffer.from('quote-frames')
    ).toString('base64');

    await consumer.deliver([
      inboundProbe(credentials.ilpAddress, {
        data,
        executionCondition: randomBytes(32).toString('base64')
      })
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
    ) as ILPQuoteRequestReceivedEvent;
    assert.ok(event);
    assert.equal(event.payload.paymentIntentId, PAYMENT_INTENT_ID);
    assert.equal(
      producer.sent.filter((m) => m.msgName === DispatchRejectPacketCmd.name)
        .length,
      0
    );
  });

  test('fulfillable inbound payment dispatches stored fulfillment and emits sent event', async () => {
    const { producer, consumer, credentials, fake } = await startedHandler();
    const resolved = await fake.resolveStreamCredentials(
      credentials.ilpAddress
    );
    assert.ok(resolved);
    const { data, executionCondition, fulfillment } = fulfillablePrepareData(
      resolved!.sharedSecret
    );

    await consumer.deliver([
      inboundProbe(credentials.ilpAddress, {
        packetId: 'packet-pay-2',
        data,
        executionCondition
      })
    ]);

    const received = producer.sent.find(
      (m) => m.msgName === ILPPaymentReceivedEvent.name
    ) as ILPPaymentReceivedEvent;
    assert.ok(received);
    producer.sent.length = 0;

    await consumer.deliver([
      new FulfillInboundPaymentCmd({
        peerId: 'peer-1',
        packetId: 'packet-pay-2',
        paymentIntentId: PAYMENT_INTENT_ID,
        inboundPaymentId: 'rp-1',
        requestId: received.payload.requestId
      })
    ]);

    const fulfillCmd = producer.sent.find(
      (m) => m.msgName === DispatchFulfillPacketCmd.name
    ) as DispatchFulfillPacketCmd;
    assert.ok(fulfillCmd);
    assert.equal(fulfillCmd.payload.packetId, 'packet-pay-2');
    assert.equal(fulfillCmd.payload.replyHandle, TEST_REPLY_HANDLE);
    assert.equal(
      fulfillCmd.payload.fulfillment,
      fulfillment.toString('base64')
    );

    const sent = producer.sent.find(
      (m) => m.msgName === ILPPaymentFulfillmentSentEvent.name
    ) as ILPPaymentFulfillmentSentEvent;
    assert.ok(sent);
    assert.equal(sent.payload.inboundPaymentId, 'rp-1');
    assert.equal(sent.payload.packetId, 'packet-pay-2');
  });

  test('fulfill inbound payment fails when packet correlation is missing', async () => {
    const { producer, consumer } = await startedHandler();

    await consumer.deliver([
      new FulfillInboundPaymentCmd({
        peerId: 'peer-1',
        packetId: 'missing-packet',
        paymentIntentId: PAYMENT_INTENT_ID,
        inboundPaymentId: 'rp-missing',
        requestId: crypto.randomUUID()
      })
    ]);

    const failed = producer.sent.find(
      (m) => m.msgName === ILPPaymentFulfillmentFailedEvent.name
    ) as ILPPaymentFulfillmentFailedEvent;
    assert.ok(failed);
    assert.equal(failed.payload.reason, 'packet_not_found');
    assert.equal(
      producer.sent.filter((m) => m.msgName === DispatchFulfillPacketCmd.name)
        .length,
      0
    );
  });

  test('reject inbound payment dispatches T00 and clears reply handle', async () => {
    const { producer, consumer, repo, credentials, fake } =
      await startedHandler();
    const resolved = await fake.resolveStreamCredentials(
      credentials.ilpAddress
    );
    assert.ok(resolved);
    const { data, executionCondition } = fulfillablePrepareData(
      resolved!.sharedSecret
    );

    await consumer.deliver([
      inboundProbe(credentials.ilpAddress, {
        packetId: 'packet-pay-reject',
        data,
        executionCondition
      })
    ]);

    assert.ok(await repo.fetchInboundReplyHandle('packet-pay-reject'));
    producer.sent.length = 0;

    await consumer.deliver([
      new RejectInboundPaymentCmd({
        peerId: 'peer-1',
        packetId: 'packet-pay-reject',
        paymentIntentId: PAYMENT_INTENT_ID,
        inboundPaymentId: 'rp-fail-1',
        requestId: crypto.randomUUID(),
        rejectMessage: 'Ledger transfer failed'
      })
    ]);

    const reject = producer.sent.find(
      (m) => m.msgName === DispatchRejectPacketCmd.name
    ) as DispatchRejectPacketCmd;
    assert.ok(reject);
    assert.equal(reject.payload.packetId, 'packet-pay-reject');
    assert.equal(reject.payload.replyHandle, TEST_REPLY_HANDLE);
    assert.equal(reject.payload.rejectCode, 'T00');
    assert.equal(
      await repo.fetchInboundReplyHandle('packet-pay-reject'),
      undefined
    );

    const stored = await repo.fetchPacketById('packet-pay-reject');
    assert.ok(stored);
    assert.equal(stored.state, 'REJECTED');
  });
});
