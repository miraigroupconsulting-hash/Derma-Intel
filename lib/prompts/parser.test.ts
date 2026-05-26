import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetPromptCache,
  loadPrompts,
  type ClinicalMode,
} from "./parser";
import { buildPrompt, responseHasDisclaimer } from "./builder";

beforeEach(() => _resetPromptCache());

describe("loadPrompts()", () => {
  it("extracts the §2 base prompt with the inviolable principles", async () => {
    const { base } = await loadPrompts();
    expect(base.length).toBeGreaterThan(500);
    expect(base).toMatch(/Eres DERMA INTEL Pro/);
    expect(base).toMatch(/PRINCIPIOS INVIOLABLES/);
    expect(base).toMatch(/Nunca emites diagnóstico definitivo/);
    // The closing fence text must NOT leak into the base.
    expect(base).not.toMatch(/^````$/m);
  });

  it("extracts all six modes", async () => {
    const { modes } = await loadPrompts();
    const required: ClinicalMode[] = [
      "CASO_CLINICO",
      "EXPRESS",
      "BIBLIOGRAFIA",
      "HISTOPATOLOGIA",
      "TERAPEUTICA",
      "DOCENTE",
    ];
    for (const m of required) {
      expect(modes[m].length, `mode ${m} is empty`).toBeGreaterThan(100);
    }
  });

  it("each mode body starts with its 'Cuándo se usa' line", async () => {
    const { modes } = await loadPrompts();
    expect(modes.CASO_CLINICO).toMatch(/Cuándo se usa/);
    expect(modes.EXPRESS).toMatch(/Cuándo se usa/);
    expect(modes.BIBLIOGRAFIA).toMatch(/Cuándo se usa/);
    expect(modes.HISTOPATOLOGIA).toMatch(/Cuándo se usa/);
    expect(modes.TERAPEUTICA).toMatch(/Cuándo se usa/);
    expect(modes.DOCENTE).toMatch(/Cuándo se usa/);
  });

  it("does NOT bleed into the next mode (boundary detection works)", async () => {
    const { modes } = await loadPrompts();
    // Each mode body should not contain another mode's heading.
    expect(modes.CASO_CLINICO).not.toMatch(/Modo EXPRESS/);
    expect(modes.EXPRESS).not.toMatch(/Modo BIBLIOGRAFÍA/);
    expect(modes.BIBLIOGRAFIA).not.toMatch(/Modo HISTOPATOLOGÍA/);
    expect(modes.HISTOPATOLOGIA).not.toMatch(/Modo TERAPÉUTICA/);
    expect(modes.TERAPEUTICA).not.toMatch(/Modo DOCENTE/);
    // Last mode should not bleed into §9 Protocolo de imagen insuficiente.
    expect(modes.DOCENTE).not.toMatch(/Protocolo de imagen insuficiente/);
  });

  it("caches: second call does not re-read the file", async () => {
    const a = await loadPrompts();
    const b = await loadPrompts();
    expect(a).toBe(b); // same object reference
  });
});

describe("buildPrompt()", () => {
  it("composes base + mode body + cierre obligatorio", async () => {
    const prompt = await buildPrompt("CASO_CLINICO");
    expect(prompt).toMatch(/Eres DERMA INTEL Pro/); // base
    expect(prompt).toMatch(/Modo activo: Caso Clínico/); // label
    expect(prompt).toMatch(/Cuándo se usa/); // mode body
    expect(prompt).toMatch(/CIERRE OBLIGATORIO/); // closing reinforcement
    expect(prompt).toMatch(
      /Sugerencia educativa\. La decisión clínica final/,
    );
  });

  it("different modes produce different bodies", async () => {
    const caso = await buildPrompt("CASO_CLINICO");
    const exp = await buildPrompt("EXPRESS");
    expect(caso).not.toEqual(exp);
    expect(caso).toMatch(/Modo activo: Caso Clínico/);
    expect(exp).toMatch(/Modo activo: Express/);
  });
});

describe("responseHasDisclaimer()", () => {
  it("detects the disclaimer in italics", () => {
    const r =
      "Análisis del caso...\n\n_Sugerencia educativa. La decisión clínica final corresponde al médico tratante._";
    expect(responseHasDisclaimer(r)).toBe(true);
  });

  it("detects the disclaimer in bold", () => {
    const r =
      "Texto largo.\n\n**Sugerencia educativa. La decisión clínica final corresponde al médico tratante.**";
    expect(responseHasDisclaimer(r)).toBe(true);
  });

  it("detects the disclaimer plain", () => {
    const r =
      "Texto.\n\nSugerencia educativa. La decisión clínica final corresponde al médico tratante.";
    expect(responseHasDisclaimer(r)).toBe(true);
  });

  it("is case-insensitive and ignores extra whitespace", () => {
    const r =
      "Texto.\n\nsugerencia    EDUCATIVA. La decisión   clínica final\ncorresponde al médico tratante.";
    expect(responseHasDisclaimer(r)).toBe(true);
  });

  it("returns false when the disclaimer is absent", () => {
    expect(responseHasDisclaimer("Análisis sin disclaimer al final.")).toBe(false);
    expect(responseHasDisclaimer("")).toBe(false);
  });
});
