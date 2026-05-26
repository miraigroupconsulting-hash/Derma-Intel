import { describe, it, expect } from "vitest";
import { normalizePhoneForWhatsapp } from "./phone";

describe("normalizePhoneForWhatsapp — Venezuela", () => {
  it("acepta formato local con guión y 0", () => {
    expect(normalizePhoneForWhatsapp("0414-1234567")).toEqual({
      e164NoPlus: "584141234567",
      display: "+58 414 123 4567",
    });
  });

  it("acepta formato local 04xxxxxxxxx sin separadores", () => {
    expect(normalizePhoneForWhatsapp("04141234567").e164NoPlus).toBe(
      "584141234567",
    );
  });

  it("acepta formato internacional con +", () => {
    expect(normalizePhoneForWhatsapp("+58 414 123 4567").e164NoPlus).toBe(
      "584141234567",
    );
  });

  it("acepta formato internacional ya pegado", () => {
    expect(normalizePhoneForWhatsapp("+584141234567").e164NoPlus).toBe(
      "584141234567",
    );
  });

  it("acepta 12 dígitos sin +", () => {
    expect(normalizePhoneForWhatsapp("584141234567").e164NoPlus).toBe(
      "584141234567",
    );
  });

  it("infiere VE cuando faltan el 0 y el código de país (móvil)", () => {
    expect(normalizePhoneForWhatsapp("4141234567").e164NoPlus).toBe(
      "584141234567",
    );
  });

  it("acepta fijo de Caracas con 0", () => {
    expect(normalizePhoneForWhatsapp("0212-9876543").e164NoPlus).toBe(
      "582129876543",
    );
  });

  it("acepta todos los códigos móviles VE", () => {
    for (const a of ["412", "414", "416", "424", "426"]) {
      const r = normalizePhoneForWhatsapp(`0${a}1234567`);
      expect(r.e164NoPlus).toBe(`58${a}1234567`);
    }
  });

  it("rechaza números muy cortos", () => {
    expect(normalizePhoneForWhatsapp("12345").e164NoPlus).toBeNull();
    expect(normalizePhoneForWhatsapp("").e164NoPlus).toBeNull();
  });

  it("rechaza null/undefined", () => {
    expect(normalizePhoneForWhatsapp(null).e164NoPlus).toBeNull();
    expect(normalizePhoneForWhatsapp(undefined).e164NoPlus).toBeNull();
  });

  it("display formatea VE bonito", () => {
    expect(normalizePhoneForWhatsapp("04141234567").display).toBe(
      "+58 414 123 4567",
    );
  });

  it("pasa números internacionales no-VE tal cual", () => {
    // 11 dígitos con prefijo 1 (Estados Unidos)
    expect(normalizePhoneForWhatsapp("12025550100").e164NoPlus).toBe(
      "12025550100",
    );
  });
});
