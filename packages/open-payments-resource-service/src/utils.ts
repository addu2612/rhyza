import { OpenPaymentsResourceServerRouteError } from './errors.js';

const DELIMITER = '_';

export function encodeCompoundId(
  paymentIntentId: string,
  resourceId: string
): string {
  return Buffer.from(`${paymentIntentId}${DELIMITER}${resourceId}`).toString(
    'base64url'
  );
}

export function decodeCompoundId(value: string): {
  paymentIntentId: string;
  resourceId: string;
} {
  // accepts either the URL or the bare id
  const compoundId = value.split('/').filter(Boolean).at(-1) ?? '';

  const [paymentIntentId, resourceId] = Buffer.from(compoundId, 'base64url')
    .toString('utf-8')
    .split(DELIMITER);

  if (!paymentIntentId || !resourceId) {
    throw new OpenPaymentsResourceServerRouteError(
      404,
      'Malformed id',
      'invalid_request'
    );
  }

  return { paymentIntentId, resourceId };
}
