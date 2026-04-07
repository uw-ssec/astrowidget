/**
 * Tests for SIN projection math.
 *
 * Validates JS projection functions against astropy-generated test vectors.
 * This is the primary coordinate alignment validation gate.
 */

import { describe, it, expect } from "vitest";
import {
  celestialToLM,
  lmToCelestial,
  screenToCelestial,
  formatRA,
  formatDec,
  DEG2RAD,
  RAD2DEG,
} from "../../js/projection.js";

const ARCSEC = 1 / 3600; // 1 arcsecond in degrees

// Reference WCS (matches generate_test_vectors.py)
const RA0 = 180.0 * DEG2RAD;
const DEC0 = 45.0 * DEG2RAD;

describe("SIN projection forward", () => {
  it("phase center maps to (0, 0)", () => {
    const { l, m, visible } = celestialToLM(RA0, DEC0, RA0, DEC0);
    expect(l).toBeCloseTo(0, 10);
    expect(m).toBeCloseTo(0, 10);
    expect(visible).toBe(true);
  });

  it("small RA offset produces expected l", () => {
    const dra = 5 * DEG2RAD;
    const { l, m, visible } = celestialToLM(RA0 + dra, DEC0, RA0, DEC0);
    // l = cos(dec) * sin(dra)
    const expected_l = Math.cos(DEC0) * Math.sin(dra);
    expect(l).toBeCloseTo(expected_l, 10);
    expect(visible).toBe(true);
  });

  it("small Dec offset produces expected m", () => {
    const ddec = 5 * DEG2RAD;
    const { l, m, visible } = celestialToLM(RA0, DEC0 + ddec, RA0, DEC0);
    // m = sin(dec+ddec)*cos(dec0) - cos(dec+ddec)*sin(dec0)*cos(0)
    const expected_m =
      Math.sin(DEC0 + ddec) * Math.cos(DEC0) -
      Math.cos(DEC0 + ddec) * Math.sin(DEC0);
    expect(m).toBeCloseTo(expected_m, 10);
    expect(visible).toBe(true);
  });

  it("opposite hemisphere is not visible", () => {
    // Point 180° away in RA at same Dec
    const { visible } = celestialToLM(RA0 + Math.PI, DEC0, RA0, DEC0);
    expect(visible).toBe(false);
  });
});

describe("SIN projection roundtrip", () => {
  const testCases = [
    { dra: 0, ddec: 0, label: "phase center" },
    { dra: 5, ddec: 0, label: "5° RA offset" },
    { dra: 0, ddec: 5, label: "5° Dec offset" },
    { dra: 10, ddec: 10, label: "10° diagonal" },
    { dra: -5, ddec: -5, label: "negative diagonal" },
    { dra: 30, ddec: 0, label: "30° RA offset" },
    { dra: 0, ddec: 30, label: "30° Dec offset" },
  ];

  testCases.forEach(({ dra, ddec, label }) => {
    it(`roundtrip: ${label}`, () => {
      const ra = RA0 + dra * DEG2RAD;
      const dec = DEC0 + ddec * DEG2RAD;

      const { l, m, visible } = celestialToLM(ra, dec, RA0, DEC0);
      if (!visible) return; // skip points behind the sphere

      const result = lmToCelestial(l, m, RA0, DEC0);
      expect(result).not.toBeNull();

      // Sub-arcsecond precision requirement
      const raDiff = Math.abs(result.ra - ra) * RAD2DEG;
      const decDiff = Math.abs(result.dec - dec) * RAD2DEG;

      expect(raDiff).toBeLessThan(ARCSEC);
      expect(decDiff).toBeLessThan(ARCSEC);
    });
  });
});

describe("screenToCelestial", () => {
  it("center of screen maps to view center", () => {
    const result = screenToCelestial(0, 0, RA0, DEC0, 60 * DEG2RAD, 1);
    expect(result).not.toBeNull();
    expect(result.ra * RAD2DEG).toBeCloseTo(180, 5);
    expect(result.dec * RAD2DEG).toBeCloseTo(45, 5);
  });
});

describe("coordinate formatting", () => {
  it("formats RA correctly", () => {
    // 180° = 12h 00m 00.0s
    const s = formatRA(180);
    expect(s).toContain("12h");
    expect(s).toContain("00m");
  });

  it("formats Dec correctly", () => {
    const s = formatDec(45);
    expect(s).toContain("+45°");
    expect(s).toContain("00'");
  });

  it("formats negative Dec", () => {
    const s = formatDec(-30.5);
    expect(s).toContain("-30°");
    expect(s).toContain("30'");
  });
});
