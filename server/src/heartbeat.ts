export interface Peer {
  missedPongs: number;
  readonly socket: { ping(): void; terminate(): void };
}

export const MAX_MISSED_PONGS = 2;

export function startHeartbeat<P extends Peer>(
  peers: () => Iterable<P>,
  intervalMs: number,
  onLost: (peer: P) => void = () => {},
): () => void {
  const timer = setInterval(() => {
    for (const peer of peers()) {
      if (peer.missedPongs >= MAX_MISSED_PONGS) {
        onLost(peer);
        peer.socket.terminate();
        continue;
      }
      peer.missedPongs += 1;
      peer.socket.ping();
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
