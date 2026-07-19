/** Thrown when a value does not conform to the p2p-songs wire contract. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}
