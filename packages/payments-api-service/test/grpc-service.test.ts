'use strict';

import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { CreatePaymentIntentRequest } from 'payments-public-types-lib';
import { CreatePaymentIntentCmd } from 'payments-domain-lib';
import { PaymentsServiceServer } from '../src/grpc/grpc-service.js';

const noop = () => {};
const logger: any = {
  createChild: () => logger,
  isDebugEnabled: () => false,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop
};

/** Builds a server whose producer records every message sent to it. */
const createServer = () => {
  const sent: any[] = [];
  const producer: any = { send: async (msg: any) => sent.push(msg) };
  const consumer: any = { setBatchCallbackFn: noop };
  // 1ms response timeout so the pending-response timer doesn't hold the test open
  const server = new PaymentsServiceServer(
    'test-instance',
    'localhost:0',
    producer,
    consumer,
    {} as any,
    logger,
    1
  );
  return { server, sent };
};

/** Invokes the private unary handler as gRPC would. */
const callUnary = (server: PaymentsServiceServer, request: unknown) =>
  (server as any)._handleUnary(
    { request, getDeadline: () => Infinity },
    noop
  );

const buildRequest = () => {
  const req = new CreatePaymentIntentRequest();
  req.setId(randomUUID());
  req.setWalletAddressId('wallet-1');
  req.setWalletAddress('https://example.com/alice');
  return req;
};

describe('CreatePaymentIntentRequest handler', () => {
  test('leaves incomingAmount undefined when the request omits it', async () => {
    const { server, sent } = createServer();

    await callUnary(server, buildRequest());

    assert.equal(sent.length, 1);
    assert.ok(sent[0] instanceof CreatePaymentIntentCmd);
    assert.equal(sent[0].payload.incomingAmount, undefined);
  });

  test('passes incomingAmount through when the request sets it', async () => {
    const { server, sent } = createServer();
    const req = buildRequest();
    req.setIncomingAmount(500);

    await callUnary(server, req);

    assert.equal(sent[0].payload.incomingAmount, 500);
  });
});
