import assert from 'assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test, describe, before, after } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import path from 'path';
import {
  DockerComposeEnvironment,
  StartedDockerComposeEnvironment,
  Wait
} from 'testcontainers';
import { AdminApiClient, createAdminClient } from 'admin-client-lib';

const ADMIN_API_PORT = 3001;
const ASE_MOCK_PORT = 3000;
const ADMIN_API_URL = 'http://localhost:' + ADMIN_API_PORT;
const COMPOSE_FILE = 'docker-compose.yaml';
const composeDir = path.resolve(__dirname, '../../docker');
const composeOverride = process.env.E2E_COMPOSE_OVERRIDE;
const composeFiles = composeOverride
  ? [COMPOSE_FILE, composeOverride]
  : COMPOSE_FILE;
const composeProject = process.env.E2E_COMPOSE_PROJECT;
const composeLogsPath = process.env.E2E_COMPOSE_LOGS_PATH;

describe('E2E tests', () => {
  let environment: StartedDockerComposeEnvironment;
  let adminClient: AdminApiClient;
  before(async () => {
    let environmentBuilder = new DockerComposeEnvironment(
      composeDir,
      composeFiles
    ).withEnvironment({
      WEBHOOK_URL: 'http://ase-mock-service:3000/webhooks',
      ...(process.env.VERSION ? { VERSION: process.env.VERSION } : {})
    });

    if (composeProject) {
      environmentBuilder = environmentBuilder.withProjectName(composeProject);
    }

    // Release override sets pull_policy: never and clears build, so a missing
    // local image fails instead of building from source or pulling from a registry.
    try {
      environment = await environmentBuilder
        .withWaitStrategy(
          'ase-mock-service',
          Wait.forHttp('/healthz', ASE_MOCK_PORT)
        )
        .up();
    } catch (error) {
      dumpComposeLogs();
      throw error;
    }

    adminClient = createAdminClient(ADMIN_API_URL);
  });

  test('Local', async () => {
    const assetCode = 'USD';
    const asset = await adminClient.assets.createAsset({
      code: assetCode,
      scale: 2
    });
    assert.equal(asset.code, assetCode);

    const senderAddress = 'test.com/sender';
    await createWalletAddress(assetCode, senderAddress, 'test sender');

    const receiverAddress = 'test.com/receiver';
    await createWalletAddress(assetCode, receiverAddress, 'test receiver');

    const paymentIntent = await adminClient.paymentIntents.createPaymentIntent({
      walletAddress: receiverAddress,
      incomingAmount: 100
    });

    assert.ok(paymentIntent.id);
    const paymentIntentId = paymentIntent.id;

    const quote = await adminClient.quotes.createQuote({
      paymentIntentId,
      walletAddress: senderAddress
    });

    assert.ok(quote.id);
    const quoteId = quote.id;

    const payment = await adminClient.payments.createPayment({
      quoteId,
      walletAddress: senderAddress,
      paymentIntentId
    });

    assert.ok(payment.id);
    const paymentId = payment.id;

    // Wait 2 seconds for ase-mock-service to receive the webhook and approve payment
    await setTimeout(2000);

    const paymentFound = await adminClient.payments.getPayment(
      paymentIntentId,
      paymentId
    );
    assert.equal(paymentFound.id, paymentId);
    assert.equal(paymentFound.state, 'COMPLETED');
  });

  const createWalletAddress = async (
    assetCode: string,
    address: string,
    publicName: string
  ) => {
    const walletAddress = await adminClient.walletAddresses.createWalletAddress(
      {
        assetCode,
        address,
        publicName
      }
    );
    assert.ok(walletAddress.id);
    assert.equal(walletAddress.address, address);
    return walletAddress;
  };

  after(async () => {
    dumpComposeLogs();
    await environment?.down();
  });
});

function dumpComposeLogs(): void {
  if (!composeLogsPath || !composeProject) {
    return;
  }

  try {
    const args = ['compose', '-p', composeProject, '-f', COMPOSE_FILE];
    if (composeOverride) {
      args.push('-f', composeOverride);
    }
    args.push('logs', '--no-color');

    const logs = execFileSync('docker', args, {
      cwd: composeDir,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 50 * 1024 * 1024
    });
    writeFileSync(composeLogsPath, logs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeFileSync(composeLogsPath, `Failed to dump compose logs: ${message}\n`);
  }
}
