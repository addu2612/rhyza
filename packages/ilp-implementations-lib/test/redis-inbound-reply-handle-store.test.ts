'use strict';

import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { Redis } from 'ioredis';
import type { IInboundPacketReplyHandle } from 'ilp-domain-lib';
import {
  RedisInboundReplyHandleStore,
  testingInternals
} from '../src/redis/redis-inbound-reply-handle-store.js';

const { ttlMs, TTL_GRACE_MS, KEY_PREFIX } = testingInternals;

// Just the three commands the store uses, recording the TTL so the expiry
// behaviour can be asserted without a live Redis.
class FakeRedis {
  readonly values = new Map<string, string>();
  readonly ttls = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    mode: 'PX',
    ttl: number
  ): Promise<'OK'> {
    assert.equal(mode, 'PX');
    this.values.set(key, value);
    this.ttls.set(key, ttl);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.ttls.delete(key);
    return this.values.delete(key) ? 1 : 0;
  }
}

const handleExpiringIn = (ms: number): IInboundPacketReplyHandle => ({
  packetId: 'packet-1',
  peerId: 'peer-1',
  replyHandle: 'handle-1',
  expiresAt: new Date(Date.now() + ms).toISOString(),
  inboundPrepare: {
    destinationIlpAddress: 'private.rafiki.a.abc',
    amount: '100',
    expiresAt: new Date(Date.now() + ms).toISOString(),
    executionCondition: Buffer.alloc(32, 1).toString('base64'),
    data: Buffer.from('stream-payload').toString('base64')
  }
});

const storeWithFake = () => {
  const redis = new FakeRedis();
  return {
    redis,
    store: new RedisInboundReplyHandleStore(redis as unknown as Redis)
  };
};

describe('RedisInboundReplyHandleStore', () => {
  test('round-trips the handle with its prepare snapshot intact', async () => {
    const { store } = storeWithFake();
    const handle = handleExpiringIn(30_000);

    await store.storeInboundReplyHandle(handle);
    const fetched = await store.fetchInboundReplyHandle('packet-1');

    // The snapshot is the only copy of the prepare, so a lossy round-trip
    // would leave the reply unbuildable.
    assert.deepEqual(fetched, handle);
  });

  test('an unknown packet reads as undefined rather than throwing', async () => {
    const { store } = storeWithFake();
    assert.equal(await store.fetchInboundReplyHandle('nope'), undefined);
  });

  test('the key expires after the prepare deadline, not before it', async () => {
    const { redis, store } = storeWithFake();
    await store.storeInboundReplyHandle(handleExpiringIn(30_000));

    const ttl = redis.ttls.get(`${KEY_PREFIX}packet-1`);
    assert.ok(ttl !== undefined);
    // A late fulfill or reject must still find the handle, so the aggregate
    // can answer packet_expired instead of reply_handle_missing.
    assert.ok(ttl! > 30_000, `expected a grace period past the deadline`);
    assert.ok(ttl! <= 30_000 + TTL_GRACE_MS);
  });

  test('an already-expired prepare still gets a positive TTL', async () => {
    const { redis, store } = storeWithFake();
    await store.storeInboundReplyHandle(handleExpiringIn(-60_000));

    // Redis rejects a non-positive PX, so a clock skew or a slow hop must not
    // be allowed to produce one.
    assert.equal(redis.ttls.get(`${KEY_PREFIX}packet-1`), TTL_GRACE_MS);
  });

  test('an unparseable deadline degrades to the grace period', async () => {
    assert.equal(ttlMs('not a date'), TTL_GRACE_MS);
  });

  test('deleting drops the key so a replay cannot answer twice', async () => {
    const { redis, store } = storeWithFake();
    await store.storeInboundReplyHandle(handleExpiringIn(30_000));

    await store.deleteInboundReplyHandle('packet-1');

    assert.equal(await store.fetchInboundReplyHandle('packet-1'), undefined);
    assert.equal(redis.values.size, 0);
  });
});
