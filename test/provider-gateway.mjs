import { Gateway } from "../server/gateway.mjs";

// Provider protocol tests isolate their existing behavior from the timestamp
// system. The real gate and cryptographic verifier have separate integration tests.
export class ProviderTestGateway extends Gateway {
  constructor(store, options = {}) {
    super(store, {
      ...options,
      timestamps: {
        requireReady: () => ({
          receiptId: "ISOLATED-PROVIDER-TEST-ONLY",
          synthetic: true,
        }),
        status: () => ({
          ready: true,
          proof: {
            synthetic: true,
            authority: "Offline provider-only fixture",
          },
          paths: [],
          lastAttempt: null,
        }),
      },
    });
  }
}
