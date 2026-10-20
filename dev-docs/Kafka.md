# Kafka in Rhyza

This document describes the structure and usage of Kafka in Rhyza: how topics are organized, and how partitioning is used to ensure message ordering.

## Basic Structure

Kafka is used as an event streaming platform and messaging backbone for communication between and within bounded contexts (BCs).

- **Topics**: Logical channels to which messages are published.
- **Partitions**: Each topic is divided into one or more partitions. Partitions allow for horizontal scaling and provide ordering guarantees within the partition.
- **Producers**: Send messages to Kafka topics.
- **Consumers**: Read messages from Kafka topics.

## Topic Organization

Topics in Rhyza are organized by their purpose and the bounded context they belong to. We primarily distinguish between **Commands** and **Events**.

### Event Topics

Events represent things that have already happened in a bounded context. Most events are public and can be consumed by other bounded contexts, but [some](#message-types) (such as state and snapshot events for aggregates using event sourcing) are private to the bounded context.

- **Naming Convention**: `{bc}-domain-events`
- **Example**: `payment-domain-events`, `auth-domain-events`
- **Usage**: Use events to notify other parts of the system about state changes (e.g., `PaymentIntentCreated`) or for internal state management.

### Command Topics

Commands represent a request for a bounded context to perform an action. They are scoped/internal to the target bounded context.

- **Naming Convention**: `{bc}-commands`
- **Example**: `payment-commands`, `auth-commands`
- **Usage**: Use commands to trigger actions within a bounded context (e.g., `CreatePaymentIntent`).

## Partitioning & Message Keys

Kafka guarantees the order of messages **only within a single partition**. To ensure that messages related to the same entity (e.g., a specific Payment Intent) are processed in the correct order, we use **Message Keys**.

### Proper Use of Keys

Usually, we will use the **Aggregate ID** as the `msgKey` to ensure Kafka routes all related messages to the same partition. This configuration guarantees sequential processing by a single consumer, which maintains data consistency and optimizes performance. By targeting the same consumer for a specific entity/aggregate, we can heavily leverage caching and avoiding unnecessary database lookups.

```typescript
// Example Payment Command
this.aggregateId = this.msgKey = payload.paymentIntentId;
```

Sometimes, we will have exceptions, where the `msgKey` will be a `requestId` for cases where the consumers are holding on to gRPC or HTTP requests. Alternatively, setting the key to null enables random partition distribution, which balances the load for workloads where strict ordering is unnecessary.

## Message Types

We use a structured message hierarchy to standardize communication:

1. **DomainMsg**: The base class for all messages.
2. **CommandMsg**: Used for commands. Includes a `requestId` for tracing.
3. **DomainEventMsg**: Used for public domain events.
4. **StateEventMsg**: Used for private, internal events (e.g., in event-sourcing scenarios).

Each message contains metadata like `msgId`, `msgTimestamp`, `msgTopic`, and `msgKey` to facilitate routing and processing.
