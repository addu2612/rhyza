import type { components } from 'open-payments-resource-service/dist/types/generated/resource-server-types.js';
import {
  IRemotePaymentIntentService,
  IRemotePaymentIntentDetails
} from '../../src/payment-intent/interfaces';

type IncomingPaymentWithMethods =
  components['schemas']['incoming-payment-with-methods'];

export function toIncomingPaymentWithMethods(
  overrides: Partial<IncomingPaymentWithMethods> &
    Partial<{
      assetCode: string;
      assetScale: number;
      ilpAddress: string;
      sharedSecret: string;
      receivedAmountValue: string;
      incomingAmountValue: string;
    }> = {}
): IncomingPaymentWithMethods {
  const assetCode = overrides.assetCode ?? 'USD';
  const assetScale = overrides.assetScale ?? 2;
  const receivedAmountValue = overrides.receivedAmountValue ?? '0';

  const response: IncomingPaymentWithMethods = {
    id: overrides.id ?? crypto.randomUUID(),
    completed: overrides.completed ?? false,
    walletAddress: overrides.walletAddress ?? 'remote.domain.com/alice',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    receivedAmount: overrides.receivedAmount ?? {
      value: receivedAmountValue,
      assetCode,
      assetScale
    },
    expiresAt:
      overrides.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
    methods: overrides.methods ?? [
      {
        type: 'ilp',
        ilpAddress: overrides.ilpAddress ?? 'g.peer.123',
        sharedSecret: overrides.sharedSecret ?? 'stub-shared-secret'
      }
    ]
  };

  if (overrides.incomingAmount) {
    response.incomingAmount = overrides.incomingAmount;
  } else if (overrides.incomingAmountValue !== undefined) {
    response.incomingAmount = {
      value: overrides.incomingAmountValue,
      assetCode,
      assetScale
    };
  }

  return response;
}

// mirrors RemotePaymentIntentAdapter return data structure
export function toRemotePaymentIntentDetails(
  data: IncomingPaymentWithMethods
): IRemotePaymentIntentDetails {
  const ilpMethod = data.methods.find((method) => method.type === 'ilp');
  if (!ilpMethod?.sharedSecret) {
    throw new Error(
      'Remote incoming payment response missing ILP sharedSecret'
    );
  }
  if (!ilpMethod.ilpAddress) {
    throw new Error('Remote incoming payment response missing ILP ilpAddress');
  }

  return {
    walletAddress: data.walletAddress,
    assetCode: data.receivedAmount.assetCode,
    assetScale: data.receivedAmount.assetScale,
    incomingAmount: data.incomingAmount
      ? BigInt(data.incomingAmount.value)
      : undefined,
    receivedAmount: BigInt(data.receivedAmount.value),
    expiresAt: data.expiresAt,
    destinationIlpAddress: ilpMethod.ilpAddress,
    sharedSecret: ilpMethod.sharedSecret
  };
}

export class MockRemotePaymentIntentService
  implements IRemotePaymentIntentService
{
  private response: IncomingPaymentWithMethods | null = null;

  setIncomingPaymentResponse(
    response: IncomingPaymentWithMethods | null
  ): void {
    this.response = response;
  }

  async fetchPaymentIntent(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _url: string
  ): Promise<IRemotePaymentIntentDetails> {
    if (!this.response) {
      throw new Error('Not implemented');
    }
    return toRemotePaymentIntentDetails(this.response);
  }
}
