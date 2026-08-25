'use strict';

import assert from 'node:assert';
import { randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  ConnectionAssetDetailsFrame,
  ConnectionNewAddressFrame,
  Packet,
  StreamMoneyFrame
} from 'ilp-protocol-stream/dist/src/packet.js';
import {
  decodeInboundStreamPrepare,
  decodeStreamPrepareAmount,
  decodeStreamReply,
  ENCRYPTION_KEY_STRING,
  hmacSha256
} from '../src/stream/decode.js';
import {
  encodeOutgoingStreamPrepare,
  encodeStreamQuoteReply
} from '../src/stream/encode.js';

describe('STREAM outgoing encode', () => {
  test('produces a fulfillable condition that round-trips through decode', () => {
    const sharedSecret = randomBytes(32);
    const encoded = encodeOutgoingStreamPrepare({
      sharedSecret,
      minDestinationAmount: '100'
    });

    assert.equal(encoded.executionCondition.length, 32);
    assert.equal(encoded.fulfillment.length, 32);
    assert.ok(encoded.data.length > 0);

    const decoded = decodeInboundStreamPrepare({
      sharedSecret,
      executionCondition: encoded.executionCondition,
      data: encoded.data
    });

    assert.equal(decoded.fulfillable, true);
    assert.ok(decoded.fulfillment);
    assert.ok(decoded.fulfillment!.equals(encoded.fulfillment));
    assert.ok(decoded.plaintext);
  });

  test('encrypt/decrypt yields a STREAM packet with StreamMoney for the amount', () => {
    const sharedSecret = randomBytes(32);
    const encoded = encodeOutgoingStreamPrepare({
      sharedSecret,
      minDestinationAmount: '250',
      sequence: 7
    });

    const decrypted = decodeInboundStreamPrepare({
      sharedSecret,
      executionCondition: encoded.executionCondition,
      data: encoded.data
    });
    assert.ok(decrypted.plaintext);

    const streamPacket = Packet._deserializeUnencrypted(decrypted.plaintext!);
    assert.equal(streamPacket.sequence.toString(), '7');
    assert.equal(streamPacket.prepareAmount.toString(), '250');

    const money = streamPacket.frames.find(
      (frame): frame is StreamMoneyFrame => frame instanceof StreamMoneyFrame
    );
    assert.ok(money);
    assert.equal(money!.streamId.toString(), '1');

    const encryptionKey = hmacSha256(sharedSecret, ENCRYPTION_KEY_STRING);
    assert.equal(encryptionKey.length, 32);
  });

  test('the prepare asks for asset details so the reply amount has a unit', () => {
    const sharedSecret = randomBytes(32);
    const encoded = encodeOutgoingStreamPrepare({
      sharedSecret,
      minDestinationAmount: '0'
    });

    const decrypted = decodeInboundStreamPrepare({
      sharedSecret,
      executionCondition: encoded.executionCondition,
      data: encoded.data
    });
    const streamPacket = Packet._deserializeUnencrypted(decrypted.plaintext!);

    assert.ok(
      streamPacket.frames.some(
        (frame) => frame instanceof ConnectionNewAddressFrame
      ),
      'expected ConnectionNewAddress to trigger the receiver asset reply'
    );
  });

  test('each encode uses fresh ciphertext so conditions differ', () => {
    const sharedSecret = Buffer.alloc(32, 3);
    const a = encodeOutgoingStreamPrepare({
      sharedSecret,
      minDestinationAmount: '42'
    });
    const b = encodeOutgoingStreamPrepare({
      sharedSecret,
      minDestinationAmount: '42'
    });

    // Nonce in encrypt makes ciphertext (and thus condition) differ.
    assert.notEqual(a.data.toString('base64'), b.data.toString('base64'));
    assert.notEqual(
      a.executionCondition.toString('base64'),
      b.executionCondition.toString('base64')
    );

    for (const encoded of [a, b]) {
      assert.equal(
        decodeInboundStreamPrepare({
          sharedSecret,
          executionCondition: encoded.executionCondition,
          data: encoded.data
        }).fulfillable,
        true
      );
    }
  });

  test('quote reply carries destination amount in STREAM prepareAmount', () => {
    const sharedSecret = randomBytes(32);
    const prepare = encodeOutgoingStreamPrepare({
      sharedSecret,
      minDestinationAmount: '0'
    });

    const replyData = encodeStreamQuoteReply({
      sharedSecret,
      prepareData: prepare.data,
      prepareAmount: '95'
    });
    assert.ok(replyData);

    assert.equal(decodeStreamPrepareAmount(sharedSecret, replyData!), '95');
    assert.equal(
      decodeStreamPrepareAmount(sharedSecret, Buffer.from('not-stream')),
      undefined
    );
  });

  test('quote reply names the asset the amount is denominated in', () => {
    const sharedSecret = randomBytes(32);
    const prepare = encodeOutgoingStreamPrepare({
      sharedSecret,
      minDestinationAmount: '0'
    });

    const replyData = encodeStreamQuoteReply({
      sharedSecret,
      prepareData: prepare.data,
      prepareAmount: '95',
      assetCode: 'EUR',
      assetScale: 2
    });
    assert.ok(replyData);

    const decoded = decodeStreamReply(sharedSecret, replyData!);
    assert.equal(decoded?.prepareAmount, '95');
    assert.equal(decoded?.assetCode, 'EUR');
    assert.equal(decoded?.assetScale, 2);
    assert.equal(decoded?.connectionClosed, false);

    const reply = Packet._deserializeUnencrypted(
      decodeInboundStreamPrepare({
        sharedSecret,
        executionCondition: Buffer.alloc(32),
        data: replyData!
      }).plaintext!
    );
    assert.ok(
      reply.frames.some((frame) => frame instanceof ConnectionAssetDetailsFrame)
    );
  });

  test('undecryptable probe data yields no reply instead of throwing', () => {
    assert.equal(
      encodeStreamQuoteReply({
        sharedSecret: randomBytes(32),
        prepareData: Buffer.alloc(0),
        prepareAmount: '95'
      }),
      undefined
    );
  });
});
