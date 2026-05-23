import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOMMGroup, RateLimitError } from "../clients/celestrak";

const MOCK_OMM = [
  {
    OBJECT_NAME: "ISS (ZARYA)",
    OBJECT_ID: "1998-067A",
    EPOCH: "2024-01-01T00:00:00",
    MEAN_MOTION: 15.48919802,
    ECCENTRICITY: 0.0002536,
    INCLINATION: 51.6416,
    RA_OF_ASC_NODE: 247.4627,
    ARG_OF_PERICENTER: 130.536,
    MEAN_ANOMALY: 325.0288,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: "U",
    NORAD_CAT_ID: "25544",
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 43525,
    BSTAR: 0.00015311,
    MEAN_MOTION_DOT: 0.00016717,
    MEAN_MOTION_DDOT: 0,
  },
];

describe("CelesTrak client", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_OMM,
      }),
    );
  });

  it("parses OMM JSON and returns typed records", async () => {
    const records = await fetchOMMGroup("active", { bypassRateLimit: true });
    expect(records).toHaveLength(1);
    expect(records[0].OBJECT_NAME).toBe("ISS (ZARYA)");
  });

  it("preserves NORAD_CAT_ID as string", async () => {
    const records = await fetchOMMGroup("active", { bypassRateLimit: true });
    expect(typeof records[0].NORAD_CAT_ID).toBe("string");
    expect(records[0].NORAD_CAT_ID).toBe("25544");
  });

  it("throws RateLimitError if called within 2-hour window", async () => {
    // First call succeeds (forceRefresh)
    await fetchOMMGroup("starlink", { bypassRateLimit: true });

    // Second call without forceRefresh should be rate-limited
    await expect(fetchOMMGroup("starlink")).rejects.toThrow(RateLimitError);
  });

  it("rejects if API returns non-array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: "not an array" }),
      }),
    );
    await expect(fetchOMMGroup("geo", { bypassRateLimit: true })).rejects.toThrow(
      "expected JSON array",
    );
  });
});
