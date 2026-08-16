import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * El gate de licencia decide si un médico entra o ve /pausa. Lo que se prueba acá
 * es lo que NO se puede fallar: que un panel caído nunca deje a nadie afuera, y que
 * un suspendido sí quede afuera. El módulo cachea 60 s por tenant, así que cada
 * caso usa un tenant distinto y se reimporta el módulo.
 */
async function fresco() {
  vi.resetModules();
  return (await import("./licencia")).verificarLicencia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verificarLicencia", () => {
  it("deja pasar cuando el panel dice que está activa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ activa: true, mensaje: "" }),
    }));
    const verificar = await fresco();
    await expect(verificar("medico-1")).resolves.toEqual({ activa: true, mensaje: "" });
  });

  it("bloquea cuando el panel la marca suspendida, con su motivo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ activa: false, mensaje: "no pagó agosto" }),
    }));
    const verificar = await fresco();
    await expect(verificar("medico-2")).resolves.toEqual({
      activa: false,
      mensaje: "no pagó agosto",
    });
  });

  it("FAIL-OPEN: si el panel se cae, el médico sigue trabajando", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const verificar = await fresco();
    await expect(verificar("medico-3")).resolves.toEqual({ activa: true, mensaje: "" });
  });

  it("FAIL-OPEN: si la respuesta viene rota, tampoco tumba a nadie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => { throw new Error("not json"); },
    }));
    const verificar = await fresco();
    await expect(verificar("medico-4")).resolves.toEqual({ activa: true, mensaje: "" });
  });

  it("cachea: dos llamadas seguidas del mismo médico pegan una sola vez al panel", async () => {
    const f = vi.fn().mockResolvedValue({ json: async () => ({ activa: true }) });
    vi.stubGlobal("fetch", f);
    const verificar = await fresco();
    await verificar("medico-5");
    await verificar("medico-5");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("manda tenant y nombre para que el panel registre al cliente", async () => {
    const f = vi.fn().mockResolvedValue({ json: async () => ({ activa: true }) });
    vi.stubGlobal("fetch", f);
    const verificar = await fresco();
    await verificar("medico-6", "ana@clinica.com");
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain("tenant=medico-6");
    expect(url).toContain("nombre=ana%40clinica.com");
  });
});
