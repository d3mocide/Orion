/** Space-Track.org client — auth-gated, rate limited (30 req/min, 300 req/hr).
 *  Phase 1 stub: returns empty arrays. Credentials must be supplied via env. */

export interface SpaceTrackCredentials {
  username: string;
  password: string;
}

export class SpaceTrackClient {
  constructor(_credentials: SpaceTrackCredentials) {
    // TODO Phase 4: implement auth + session management
  }

  async login(): Promise<void> {
    // Stub — implement in Phase 4
    throw new Error("SpaceTrack client not yet implemented");
  }

  async getOMMForNoradIds(_ids: string[]): Promise<unknown[]> {
    // Stub
    return [];
  }
}
