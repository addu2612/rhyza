'use strict';

import assert from 'node:assert';
import { describe, test } from 'node:test';
import { createFakeResolveStreamCredentials } from '../src/stream/credentials.js';

describe('createFakeResolveStreamCredentials', () => {
  test('issues StreamServer credentials and resolves them by destination', async () => {
    const fake = createFakeResolveStreamCredentials();
    const credentials = fake.issueCredentials('intent-1');

    const resolved = await fake.resolveStreamCredentials(
      credentials.ilpAddress
    );

    assert.ok(resolved);
    assert.equal(resolved!.paymentIntentId, 'intent-1');
    assert.ok(resolved!.sharedSecret.equals(credentials.sharedSecret));
    assert.equal(
      fake.streamServer.decodePaymentTag(credentials.ilpAddress),
      'intent-1'
    );
  });

  test('returns undefined for an unknown destination', async () => {
    const fake = createFakeResolveStreamCredentials();
    const resolved = await fake.resolveStreamCredentials('test.rhyza.unknown');
    assert.equal(resolved, undefined);
  });
});
