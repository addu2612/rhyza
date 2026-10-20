# Serialization of Messages

This section covers the serialization strategy and process for messages published to and consumed from the message brokers. It explains how messages are converted into the format transmitted over the network to the broker and the code structure where the multiple parts can be found and should be put.
The serialization process is crucial for ensuring that messages can be reliably transmitted and reconstructed at the receiving end.

# Concepts

Serialization works by transforming the JSON messages we use in our code, which all implement IMessage and inherit from BaseMessage, to IRawMessages that are sent to and received from the broker. This transformation is performed by the serialization framework, which is responsible for converting the message objects into a format that can be transmitted over the network and back again.
The serialization framework is designed to be flexible and extensible, allowing for different serialization strategies to be used depending on the requirements of the application.

Our messages have two distinct blocks of data, one for the actual message content or payload and another for common metadata. The message payload contains the actual data that is being transmitted in the event or command, while the metadata block contains common information about all messages, such as the id, serialization format, timestamp, message type and name.

## Message structure:

- Envelope (all that is sent in binary)
  - Metadata (message type, format, name, etc.)
  - Payload (actual message content)
- Message headers (explained below)

This strategy of separating message content from metadata (enveloping) is a fundamental application of the Separation of Concerns (SoC) principle in our software architecture; this separation of concerns allows for more efficient and flexible message handling, as well as multiple serialization formats. With this separation we can perform routing, filtering, storing or any other tasks on messages without looking at, or understanding, their contents.

# How it works

Serialization happens immediately before sending messages to the broker, the framework uses the `msgDataFormat`, `msgType` and `msgName` properties of the message being serialized to determine the serizalition implementation to use.

Conversely, deserialization happens immediately after receiving messages from the broker and before passing the messages to our consumer code.

Three important fields are added as headers in every message sent to the brokers:

- **msgDataFormat** - which indicates the type of serialization used on the message (JSON, ProtoBuf, etc.);
- **msgType** - which indicates the type of message being sent (command, event, etc.);
- **msgName** - which indicates the name of the message class;

The framework uses the contents of these fields to determine the deserialization implementation to use.

The main component that controls serialization and deserialization of messages is the `MessageSerializationFactory`.
The `MessageSerializationFactory` implements the `IMessageSerializationFactory` interface and employs a singleton pattern, all usage should be performed by accessing its static instance, like so: `MessageSerializationFactory.instance()`.

**Specific serializers must be registered to this factory to become available** using the `MessageSerializationFactory.instance().register(newSerde: IRawMessageSerializer)` method.

## Automatic serialization of JSON data format messages

The default serialization for messages is to convert our JSON objects to strings and then to binary buffers. For this to happen, `msgDataFormat: MessageDataFormats` property of the message should be set to `MessageDataFormats.JSON`.
When the message format is set to `MessageDataFormats.JSON` the framework will perform the serialization automatically without extra code. The `MessageSerializationFactory` already includes serizalization mechanisms for all types of JSON data format messages used.

## Serialization of messages using other formats

For other message serialization formats, like `MessageDataFormats.PROTOBUF`, developers will have to implement part of the serialization logic themselves.

The framework will automatically serialize the metadata portion according to the message type, but the message payload portion requires separate specific serialization code to be written.

For commands, developers have to implement a payload serialization class that implements `IRawMessageSerializer`, for Protocol Buffers data format, developers can extend prebuilt base classes.

For command messages, for example, we can extend the abstract class `ProtoBufBaseCommandSerializer<P>` where `P` is the type of the payload class, located in _implementations-lib/serde/protobuf_, and implement the following members:

```Typescript
class MyProtobufCommandSerde extends ProtoBufBaseCommandSerializer<MyCommandPayload>{
    // typescript class name of the protocol buffers payload definition
    protected _payloadPbClassName: string = "PbMyCommandPayload";
    // message/command name
    abstract readonly msgName: string;
    // function to serialize the payload to bytes
    protected _serializePayload(payload:MyCommandPayload):Uint8Array {...}
    // function to deserialize the payload from bytes
    protected _deserializePayload(pbAny:PbAny, msgName:string):MyCommandPayload {...}
}
```

Once the required serialization classes are implemented, they must be registered in the serialization factory, like so:
`MessageSerializationFactory.instance().register(new MyProtobufCommandSerde())`

# Locations of Serialization Components

## Serialization Components Locations

### Existing Framework

- **Message Serialization Interfaces and Enums**: Located in _common-types-lib_
- **Message Serialization Factory**: Located in _implementations-lib/serde/message-serialization-factory.ts_
- **Automatic JSON Serialization Classes**: Located in _implementations-lib/serde/json_
- **Protocol Buffers Serialization Classes (to be extended)**: Located in _implementations-lib/serde/protobuf_

### Specific message serialization components

Per message serialization implementation should be placed in the correspondent Bounded Context packages; this includes any specific format files, like protocol buffer definition files.

Using the following logic:

- **For private messages (ex: cmds, state evts)** - implementation should be in _bc-implemenations-lib/serde/_
- **For public messages (ex: domain events)** - implementation should be in _bc-public-types-lib/serde/_

# Unit Tests and Serialization

For simpler unit tests, a mock implementation of the `IMessageSerializationFactory` is provided, which ignores messages' data format and always changes them to JSON prior to serialization. This allows unit tests to be executed for non-JSON format messages before specific serialization implementations are ready.

**TBC - TODO add the mock class and examples**
