import type {
  IInboundPacketReplyHandle,
  IPacketCorrelation
} from '../packet/interfaces';

// ILP peer connector configuration
// The ILP BC only owns the connector configuration needed to exchange packets
// with the peer. `peerId` references the PAL peer.
export interface PeerHttpOutgoingConfig {
  endpoint: string;
  authToken: string;
}

export interface PeerHttpIncomingConfig {
  authToken?: string;
}

export interface PeerHttpConfig {
  outgoing: PeerHttpOutgoingConfig;
  incoming?: PeerHttpIncomingConfig;
}

export interface IPeer {
  peerId: string;
  http: PeerHttpConfig;
  isActive?: boolean;
  packetCorrelations?: IPacketCorrelation[];
}

export interface IPeerReader {
  fetchById(peerId: string): Promise<IPeer | undefined>;
  fetchAll(): Promise<IPeer[]>;
}

export interface IPeerStore extends IPeerReader {
  store(peer: IPeer): Promise<void>;
  update(peer: IPeer): Promise<void>;
  fetchPacketById(packetId: string): Promise<IPacketCorrelation | undefined>;
  storePacket(packet: IPacketCorrelation): Promise<void>;
  updatePacket(packet: IPacketCorrelation): Promise<void>;
}

// Ephemeral transport state, kept separate from the durable store because it
// lives for one packet and is written and read on every inbound prepare.
export interface IInboundReplyHandleStore {
  fetchInboundReplyHandle(
    packetId: string
  ): Promise<IInboundPacketReplyHandle | undefined>;
  storeInboundReplyHandle(handle: IInboundPacketReplyHandle): Promise<void>;
  deleteInboundReplyHandle(packetId: string): Promise<void>;
}

export interface IPeerRepository extends IPeerStore, IInboundReplyHandleStore {}
