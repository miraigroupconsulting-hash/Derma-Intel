// vitest.setup.ts
// Runs once before the test suite. Use it to register polyfills, mock
// browser APIs, or extend global expectations.

import { vi } from "vitest";

// jsdom does not implement window.SpeechRecognition / webkitSpeechRecognition.
// Tests that want to exercise lib/voice.ts can stub them on a per-test basis;
// here we just ensure the globals are undefined by default so isSupported()
// returns false in CI without surprises.
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).SpeechRecognition ??= undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).webkitSpeechRecognition ??= undefined;
}

// Silence noisy console.error during expected error paths in tests.
// (We re-enable per-test if a test wants to assert on a console.error.)
const origError = console.error;
vi.spyOn(console, "error").mockImplementation((...args) => {
  if (process.env.VITEST_VERBOSE) origError(...args);
});
