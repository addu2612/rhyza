import {
  IInboundPacketReplyHandle,
  IInboundReplyHandleStore,
  IPacketCorrelation,
  IPeer,
  IPeerRepository,
  IPeerStore
} from 'ilp-domain-lib';

// Joins the two halves the aggregate sees as one repository: durable peer and
// packet state in MongoDB, per-packet transport state in an expiring store.
export class PeerRepository implements IPeerRepository {
  constructor(
    private readonly _peers: IPeerStore,
    private readonly _replyHandles: IInboundReplyHandleStore
  ) {}

  fetchById(peerId: string): Promise<IPeer | undefined> {
    return this._peers.fetchById(peerId);
  }

  fetchAll(): Promise<IPeer[]> {
    return this._peers.fetchAll();
  }

  store(peer: IPeer): Promise<void> {
    return this._peers.store(peer);
  }

  update(peer: IPeer): Promise<void> {
    return this._peers.update(peer);
  }

  fetchPacketById(packetId: string): Promise<IPacketCorrelation | undefined> {
    return this._peers.fetchPacketById(packetId);
  }

  storePacket(packet: IPacketCorrelation): Promise<void> {
    return this._peers.storePacket(packet);
  }

  updatePacket(packet: IPacketCorrelation): Promise<void> {
    return this._peers.updatePacket(packet);
  }

  fetchInboundReplyHandle(
    packetId: string
  ): Promise<IInboundPacketReplyHandle | undefined> {
    return this._replyHandles.fetchInboundReplyHandle(packetId);
  }

  storeInboundReplyHandle(handle: IInboundPacketReplyHandle): Promise<void> {
    return this._replyHandles.storeInboundReplyHandle(handle);
  }

  deleteInboundReplyHandle(packetId: string): Promise<void> {
    return this._replyHandles.deleteInboundReplyHandle(packetId);
  }
}
