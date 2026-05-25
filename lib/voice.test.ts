/**
 * lib/voice.test.ts
 *
 * Unit tests for the Web Speech wrapper. We stub the browser API on the
 * jsdom window so the module under test sees a controllable
 * SpeechRecognition implementation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We re-import the module under test in beforeEach so module state
// (activeRecognition) is reset between tests.
type VoiceModule = typeof import("./voice");

class FakeRecognition extends EventTarget {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onend: ((ev: Event) => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  startCallCount = 0;
  static instances: FakeRecognition[] = [];

  constructor() {
    super();
    FakeRecognition.instances.push(this);
  }

  start() {
    this.startCallCount += 1;
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onend?.(new Event("end"));
  }
  abort() {
    this.aborted = true;
    this.onend?.(new Event("end"));
  }

  // helpers for tests
  emitTranscript(text: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: {
          isFinal,
          length: 1,
          0: { transcript: text, confidence: 0.9 },
        },
      },
    });
  }
  emitError(code: string) {
    this.onerror?.({ error: code });
  }
}

let voice: VoiceModule;

beforeEach(async () => {
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
    FakeRecognition;
  vi.resetModules();
  voice = await import("./voice");
});

afterEach(() => {
  voice.abortDictation();
  delete (window as unknown as { SpeechRecognition?: unknown })
    .SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
});

describe("isSupported()", () => {
  it("returns true when SpeechRecognition exists on window", () => {
    expect(voice.isSupported()).toBe(true);
  });

  it("returns true when only the webkit-prefixed variant exists", async () => {
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
    (
      window as unknown as { webkitSpeechRecognition?: unknown }
    ).webkitSpeechRecognition = FakeRecognition;
    vi.resetModules();
    voice = await import("./voice");
    expect(voice.isSupported()).toBe(true);
  });

  it("returns false when no implementation is present", async () => {
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
    vi.resetModules();
    voice = await import("./voice");
    expect(voice.isSupported()).toBe(false);
  });
});

describe("startDictation()", () => {
  it("starts the recognizer with es-VE by default", () => {
    voice.startDictation({ onTranscript: () => undefined });
    const rec = FakeRecognition.instances[0]!;
    expect(rec.lang).toBe("es-VE");
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.startCallCount).toBe(1);
  });

  it("passes interim and final transcripts to the callback", () => {
    const segments: Array<{ text: string; final: boolean }> = [];
    voice.startDictation({
      onTranscript: (text, final) => segments.push({ text, final }),
    });
    const rec = FakeRecognition.instances[0]!;
    rec.emitTranscript("paciente femenina", false);
    rec.emitTranscript("paciente femenina de 34 años", true);
    expect(segments).toEqual([
      { text: "paciente femenina", final: false },
      { text: "paciente femenina de 34 años", final: true },
    ]);
  });

  it("falls back to es-ES when es-VE is rejected", () => {
    voice.startDictation({ onTranscript: () => undefined });
    const first = FakeRecognition.instances[0]!;
    expect(first.lang).toBe("es-VE");
    first.emitError("language-not-supported");

    // A new recognizer should be created with the fallback language.
    expect(FakeRecognition.instances.length).toBe(2);
    const second = FakeRecognition.instances[1]!;
    expect(second.lang).toBe("es-ES");
    expect(second.startCallCount).toBe(1);
  });

  it("surfaces not-allowed (mic denied) without retrying language", () => {
    const errors: Array<{ code: string }> = [];
    voice.startDictation({
      onTranscript: () => undefined,
      onError: (e) => errors.push(e),
    });
    const rec = FakeRecognition.instances[0]!;
    rec.emitError("not-allowed");
    expect(errors).toEqual([
      expect.objectContaining({ code: "not-allowed" }),
    ]);
    // No fallback recognizer should have been created.
    expect(FakeRecognition.instances.length).toBe(1);
  });

  it("aborts a previous session if start is called twice", () => {
    voice.startDictation({ onTranscript: () => undefined });
    voice.startDictation({ onTranscript: () => undefined });
    const [first, second] = FakeRecognition.instances;
    expect(first?.aborted).toBe(true);
    expect(second?.started).toBe(true);
  });

  it("returns not-supported when window has neither API", async () => {
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
    vi.resetModules();
    voice = await import("./voice");

    const errors: Array<{ code: string }> = [];
    voice.startDictation({
      onTranscript: () => undefined,
      onError: (e) => errors.push(e),
    });
    expect(errors).toEqual([
      expect.objectContaining({ code: "not-supported" }),
    ]);
  });
});

describe("stopDictation() and abortDictation()", () => {
  it("stop fires onEnd", () => {
    const onEnd = vi.fn();
    voice.startDictation({ onTranscript: () => undefined, onEnd });
    voice.stopDictation();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("abort suppresses onEnd", () => {
    const onEnd = vi.fn();
    voice.startDictation({ onTranscript: () => undefined, onEnd });
    voice.abortDictation();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("isActive reflects current session state", () => {
    expect(voice.isActive()).toBe(false);
    voice.startDictation({ onTranscript: () => undefined });
    expect(voice.isActive()).toBe(true);
    voice.stopDictation();
    expect(voice.isActive()).toBe(false);
  });
});

describe("dictationErrorMessage()", () => {
  it("returns Spanish copy for each known code", () => {
    expect(voice.dictationErrorMessage("not-allowed")).toMatch(/micrófono/i);
    expect(voice.dictationErrorMessage("no-speech")).toMatch(/voz/i);
    expect(voice.dictationErrorMessage("network")).toMatch(/conexión|internet/i);
    expect(voice.dictationErrorMessage("not-supported")).toMatch(/Chrome|Edge|Safari/i);
  });
});
