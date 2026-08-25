import { Redis } from 'ioredis';
import {
  IInboundPacketReplyHandle,
  IInboundReplyHandleStore
} from 'ilp-domain-lib';

const KEY_PREFIX = 'ilp:inbound-reply-handle:';

// Keep the handle readable a little past the prepare's deadline. A fulfill or
// reject that arrives just late should still find it, so the aggregate can
// answer with packet_expired rather than reply_handle_missing.
const TTL_GRACE_MS = 60_000;

function ttlMs(expiresAt: string): number {
  const remaining = Date.parse(expiresAt) - Date.now();
  return (Number.isNaN(remaining) ? 0 : Math.max(remaining, 0)) + TTL_GRACE_MS;
}

export class RedisInboundReplyHandleStore implements IInboundReplyHandleStore {
  constructor(private readonly _redis: Redis) {}

  async fetchInboundReplyHandle(
    packetId: string
  ): Promise<IInboundPacketReplyHandle | undefined> {
    const raw = await this._redis.get(`${KEY_PREFIX}${packetId}`);
    return raw ? (JSON.parse(raw) as IInboundPacketReplyHandle) : undefined;
  }

  async storeInboundReplyHandle(
    handle: IInboundPacketReplyHandle
  ): Promise<void> {
    await this._redis.set(
      `${KEY_PREFIX}${handle.packetId}`,
      JSON.stringify(handle),
      'PX',
      ttlMs(handle.expiresAt)
    );
  }

  async deleteInboundReplyHandle(packetId: string): Promise<void> {
    await this._redis.del(`${KEY_PREFIX}${packetId}`);
  }
}

export const testingInternals = { ttlMs, TTL_GRACE_MS, KEY_PREFIX };
