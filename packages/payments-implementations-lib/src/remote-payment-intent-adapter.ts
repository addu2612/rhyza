'use strict';

import {
  IRemotePaymentIntentService,
  IRemotePaymentIntentDetails
} from 'payments-domain-lib';

// TODO: Consider replacing fetch with the open-payments-node client.
// That would require either: (a) key pair initialization for authenticated
// requests, or (b) the remote server exposing asset details on the public
// incoming payment endpoint (e.g., excluding only receiver wallet address).
// Ideally we shouldn't need to make an authenticated request for this.
export class RemotePaymentIntentAdapter implements IRemotePaymentIntentService {
  async fetchPaymentIntent(url: string): Promise<IRemotePaymentIntentDetails> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch remote incoming payment at ${url}: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      walletAddress: string;
      incomingAmount?: { value: string; assetCode: string; assetScale: number };
      receivedAmount: { value: string; assetCode: string; assetScale: number };
      expiresAt?: string;
      methods?: {
        type: string;
        ilpAddress?: string;
        sharedSecret?: string;
      }[];
    };

    const ilpMethod = data.methods?.find((method) => method.type === 'ilp');
    if (!ilpMethod?.sharedSecret) {
      throw new Error(
        `Remote incoming payment ${url} response missing ILP sharedSecret`
      );
    }

    if (!ilpMethod.ilpAddress) {
      throw new Error(
        `Remote incoming payment ${url} response missing ILP ilpAddress`
      );
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
}
