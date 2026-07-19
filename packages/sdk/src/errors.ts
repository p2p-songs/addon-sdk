/** Errors thrown by the SDK during addon construction. */
export class AddonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddonError";
  }
}
