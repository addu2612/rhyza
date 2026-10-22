'use strict';

import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { InvalidCursorError } from 'common-types-lib';
import {
  CursorContext,
  decodeCursor,
  encodeCursor
} from '../src/grpc/cursor.js';

const id = randomUUID();
const ctx: CursorContext = {
  sortOrder: 'asc',
  walletAddressId: 'wallet-1',
  paymentIntentId: 'intent-1'
};

/** Builds a token by hand so tests can control the exact payload shape. */
const rawToken = (payload: unknown) =>
  Buffer.from(JSON.stringify(payload)).toString('base64url');

const rejectsAsDifferentQuery = (cursor: string, ctx: CursorContext) =>
  assert.throws(() => decodeCursor(cursor, ctx), {
    name: 'InvalidCursorError',
    message: /issued for a different query/
  });

const rejectsAsMalformed = (cursor: string) =>
  assert.throws(() => decodeCursor(cursor, ctx), {
    name: 'InvalidCursorError',
    message: /Malformed cursor/
  });

describe('cursor', () => {
  test('round-trips the id when the context matches', () => {
    assert.equal(decodeCursor(encodeCursor(id, ctx), ctx), id);
  });

  test('is opaque: base64url, no raw id visible', () => {
    const cursor = encodeCursor(id, ctx);
    assert.match(cursor, /^[A-Za-z0-9_-]+$/);
    assert.ok(!cursor.includes(id));
  });

  test('rejects a cursor when sortOrder differs', () => {
    rejectsAsDifferentQuery(encodeCursor(id, ctx), {
      ...ctx,
      sortOrder: 'desc'
    });
  });

  test('rejects a cursor when walletAddressId differs, is added, or is removed', () => {
    const cursor = encodeCursor(id, ctx);
    rejectsAsDifferentQuery(cursor, { ...ctx, walletAddressId: 'wallet-2' });
    rejectsAsDifferentQuery(cursor, { ...ctx, walletAddressId: undefined });

    const unscoped = encodeCursor(id, { ...ctx, walletAddressId: undefined });
    rejectsAsDifferentQuery(unscoped, ctx);
  });

  test('rejects a cursor when paymentIntentId differs, is added, or is removed', () => {
    const cursor = encodeCursor(id, ctx);
    rejectsAsDifferentQuery(cursor, { ...ctx, paymentIntentId: 'intent-2' });
    rejectsAsDifferentQuery(cursor, { ...ctx, paymentIntentId: undefined });

    const noIntent = encodeCursor(id, { ...ctx, paymentIntentId: undefined });
    rejectsAsDifferentQuery(noIntent, ctx);
  });

  test('treats an absent optional filter and an undefined one as the same', () => {
    // An intents-page context never sets paymentIntentId at all.
    const intentsCtx: CursorContext = {
      sortOrder: 'desc',
      walletAddressId: 'w'
    };
    const cursor = encodeCursor(id, intentsCtx);
    assert.equal(
      decodeCursor(cursor, { ...intentsCtx, paymentIntentId: undefined }),
      id
    );
    assert.equal(decodeCursor(cursor, intentsCtx), id);
  });

  test('accepts a token regardless of context key order', () => {
    const reordered = rawToken({
      ctx: {
        paymentIntentId: ctx.paymentIntentId,
        walletAddressId: ctx.walletAddressId,
        sortOrder: ctx.sortOrder
      },
      id
    });
    assert.equal(decodeCursor(reordered, ctx), id);
  });

  test('rejects malformed cursors', () => {
    rejectsAsMalformed('not base64url json');
    rejectsAsMalformed(Buffer.from('{"nope"').toString('base64url'));
    rejectsAsMalformed(rawToken('just a string'));
    rejectsAsMalformed(rawToken({ ctx }));
    rejectsAsMalformed(rawToken({ id: 123, ctx }));
    rejectsAsMalformed(rawToken({ id }));
    rejectsAsMalformed(rawToken({ id, ctx: null }));
    rejectsAsMalformed(rawToken({ id, ctx: 'x' }));
    rejectsAsMalformed(rawToken({ id, ctx: 5 }));
    rejectsAsMalformed(rawToken({ id, ctx: [] }));
  });

  test('a bare id (the pre-encoding format) is rejected, not silently accepted', () => {
    assert.throws(() => decodeCursor(id, ctx), InvalidCursorError);
  });
});
