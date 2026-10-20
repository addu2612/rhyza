# Architectural differences from Rafiki

This document outlines the major architectural changes in Rhyza in comparison to Rafiki. The transition focuses on moving from a monolithic backend to a decoupled, event-driven architecture that prioritizes horizontal scalability, simplified liquidity management, and improved developer experience.

## Core Architectural Shifts

### Bounded Contexts & Services

For better decoupling and horizontal scalability, Rhyza is divided into five distinct system modules (bounded contexts). Instead of `backend` and `auth` services, functionality is split as follows:

- **Payments**: Stores, initiates, and receives payments.
- **ILP**: Handles sending and receiving ILP packets between peers.
- **PAL (Peers, Accounts, Ledger)**: Manages assets, wallet addresses, peers, and all ledger/liquidity functionality.
- **Auth**: Manages Open Payments Auth grants and access tokens.
- **Notifications**: Communicates system events to the ASE via webhook events.

![Simplified architecture](./diagrams/architecture-simplified.png)

In this architecture, the Open Payments & Admin API servers act as stateless layers that translate external requests into internal commands for the relevant modules.

### Simplified Liquidity

One of the most significant shifts for ASEs is how liquidity is managed:

- **Rafiki**: Liquidity was tracked for every payment, asset, peer, and wallet address.
- **Rhyza**: Liquidity is only tracked for **peering relationships**. There are no longer payment-specific or wallet-address-specific liquidity accounts.

If an ASE only uses Open Payments functionality (and not ILP peering), they no longer need to manage liquidity via the Admin API requests or handle liquidity-specific webhook events.

### Simplified Assets

In Rhyza, assets have been simplified: instead of assets being unique by both `code` and `scale`, they are now unique by their `code` only (e.g. USD). The `scale` is now a display property. This is enabled by the fact that the ledger operates at a fixed high precision (scale 20). All accounting entries are stored at this scale, regardless of the display scale of the asset, payment, or peer.

## Infrastructure & Implementation

### MongoDB as Default Database

Our persistence layer has shifted to use MongoDB as a default to support high write throughput, and native horizontal scalability. The code remains structured to allow for alternative persistence implementations (e.g. PostgreSQL) if required.

### Kafka & Event Streaming

The event streaming platform Kafka is the foundation for our event-driven architecture. In addition to powering our custom event-sourced ledger, it enables asynchronous command-based communication across all system modules, supporting horizontal scalability and the ability to replay event streams for recovery or auditing.

### Custom Accounting Ledger

Unlike Rafiki, which often relied on external databases or TigerBeetle for ledgering, Rhyza uses a **custom event-sourced ledger** built directly on Kafka. This provides a highly performant, auditable accounting system without requiring additional infrastructure dependencies.

## Integration & Lifecycle

### Payment Concept Changes

The Rafiki payment entities has been renamed & restructured for better performance and clarity:

- **Incoming Payments** have been renamed to **Payment Intents**. This better reflects that the resources represent an intention to receive funds rather than the payments themselves.
- **Outgoing Payments** have been renamed simply to **Payments**. Given that Incoming Payments are renamed to Payment Intents, the "Outgoing" prefix is no longer necessary.
- In Rhyza, both **Quotes** and **Payments** are now child resources of a **Payment Intent**. This architectural shift was made primarily for internal performance reasons, allowing for more efficient data handling and state management within the system.

This naming change impacts the language used in the Admin API and webhook events.

### Opaque Identifiers

In Rafiki, many externally visible identifiers were the underlying database ids, and clients could construct or reinterpret them. In Rhyza, some identifiers and tokens handed to clients are **opaque**: an encoded value that only Rhyza knows how to interpret. Clients must treat them as-is, passing them back exactly as received. What is encoded inside is an internal detail and may change without notice.

This lets Rhyza bundle whatever context it needs to resolve a value (for example, a parent resource or the query that produced it) without exposing that context or relying on the client to supply it correctly.

In general, clients should treat all identifiers Rhyza returns as opaque, even when they look like plain UUIDs. Use them exactly as given and never construct, parse, or compare them structurally.

Used for:

- **Pagination cursors** in the Open Payments and Admin APIs. A cursor is only valid for the query that produced it, and Rhyza rejects it if the filters or sort order changes.
- **Open Payments resource ids** for child resources of a payment intent, such as quotes and payments.
- **Open Payments grant and access token identifiers** issued by the auth server, such as grant tokens.

### Unified Admin API

Instead of two separate GraphQL Admin APIs for `auth` and `backend`, Rhyza has a single REST Admin API server which covers all of the possible functionality for managing it. This simplifies ASE integration (+ documentation tooling) while also providing us the ability to automatically generate client libraries/SDKs.

**Spec**: [Admin API OpenAPI Specification](../docs/openapi/admin/admin-api.yaml)

### Webhook Events

While Rhyza continues to use webhooks for ASE notifications, the payload structure and event types have been updated to reflect the [new naming](#payment-concept-changes) in the system modules.

**Spec**: [Webhook OpenAPI Specification](../docs/openapi/webhooks.yaml).

### Multi-tenancy

Rhyza is currently not multi-tenanted. A single Rhyza instance is intended to serve a single ASE, simplifying the security and resource isolation model compared to the multi-tenant approach of Rafiki.
