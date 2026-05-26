/**
 * lib/medicamentos.ts
 *
 * Curated dermatology medication catalogue for the récipe autocomplete.
 * ~70 entries covering the day-to-day prescribing surface of a
 * Venezuelan dermatologist. NOT a full vademecum — it's the working
 * set the design-partner dermatóloga should expand or trim with real
 * use. Adding a new entry is one object below.
 *
 * Categorías:
 *   topico            → cremas, geles, lociones, ungüentos, soluciones
 *   sistemico_oral    → cápsulas, tabletas, jarabes
 *   sistemico_iny     → inyectables (raros en outpatient pero útiles)
 *   procedimiento     → cirugía / dermatoscopia (anestésicos, antisépticos)
 *
 * controlado=true marca fármacos que activan la doble confirmación
 * CONFIRMO al firmar el récipe (CLAUDE.md §2.2 y diseño Día 5).
 */

export type MedicamentoCategoria =
  | "topico"
  | "sistemico_oral"
  | "sistemico_iny"
  | "procedimiento";

export interface MedicamentoCatalogo {
  /** Nombre genérico (DCI). Usado como key del autocomplete. */
  nombre: string;
  /** Nombres comerciales comunes en Venezuela (opcional). */
  comerciales?: string[];
  /** Presentaciones típicas (forma + concentración). */
  presentaciones: string[];
  categoria: MedicamentoCategoria;
  /** Para clasificación visual. */
  via_default: "tópica" | "oral" | "intramuscular" | "subcutánea" | "intravenosa" | "otra";
  /** Si requiere doble confirmación CONFIRMO al firmar. */
  controlado: boolean;
  /** Nota corta para el autocomplete (uso típico). Sirve también
   *  como entrada de busqueda alternativa. */
  uso_comun?: string;
}

export const MEDICAMENTOS: MedicamentoCatalogo[] = [
  // ----- Acné -------------------------------------------------------
  { nombre: "Tretinoína", comerciales: ["Retin-A", "Cordes"], presentaciones: ["Crema 0.025%", "Crema 0.05%", "Crema 0.1%", "Gel 0.025%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Acné, fotoenvejecimiento" },
  { nombre: "Adapaleno", comerciales: ["Differin"], presentaciones: ["Gel 0.1%", "Gel 0.3%", "Crema 0.1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Acné" },
  { nombre: "Peróxido de benzoilo", comerciales: ["Benzac"], presentaciones: ["Gel 2.5%", "Gel 5%", "Gel 10%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Acné inflamatorio" },
  { nombre: "Clindamicina tópica", comerciales: ["Dalacin T"], presentaciones: ["Gel 1%", "Solución 1%", "Loción 1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Acné inflamatorio" },
  { nombre: "Adapaleno + Peróxido de benzoilo", comerciales: ["Epiduo"], presentaciones: ["Gel 0.1% / 2.5%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Acné moderado" },
  { nombre: "Isotretinoína", comerciales: ["Roaccutan", "Isoface"], presentaciones: ["Cápsulas 10 mg", "Cápsulas 20 mg", "Cápsulas 40 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: true, uso_comun: "Acné severo. Teratógeno." },
  { nombre: "Doxiciclina", comerciales: ["Vibramicina"], presentaciones: ["Cápsulas 100 mg", "Tabletas 100 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Acné, rosácea" },
  { nombre: "Minociclina", presentaciones: ["Cápsulas 50 mg", "Cápsulas 100 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Acné" },
  { nombre: "Espironolactona", comerciales: ["Aldactone"], presentaciones: ["Tabletas 25 mg", "Tabletas 100 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Acné hormonal en mujeres" },

  // ----- Rosácea / dermatitis perioral ------------------------------
  { nombre: "Metronidazol tópico", comerciales: ["Rozex"], presentaciones: ["Crema 0.75%", "Gel 0.75%", "Loción 0.75%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Rosácea papulopustular" },
  { nombre: "Ivermectina tópica", comerciales: ["Soolantra"], presentaciones: ["Crema 1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Rosácea papulopustular" },
  { nombre: "Ácido azelaico", comerciales: ["Skinoren"], presentaciones: ["Crema 15%", "Crema 20%", "Gel 15%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Rosácea, hiperpigmentación, acné" },
  { nombre: "Brimonidina tópica", comerciales: ["Mirvaso"], presentaciones: ["Gel 0.33%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Eritema rosácea" },

  // ----- Hiperpigmentación / melasma --------------------------------
  { nombre: "Hidroquinona", presentaciones: ["Crema 2%", "Crema 4%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Melasma, hiperpigmentación" },
  { nombre: "Triple combinación (hidroquinona + tretinoína + fluocinolona)", comerciales: ["Tri-Luma"], presentaciones: ["Crema 4% / 0.05% / 0.01%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Melasma resistente" },
  { nombre: "Ácido kójico", presentaciones: ["Crema 2%", "Crema 4%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Melasma" },
  { nombre: "Ácido tranexámico oral", comerciales: ["Espercil"], presentaciones: ["Tabletas 250 mg", "Tabletas 500 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Melasma resistente" },

  // ----- Psoriasis --------------------------------------------------
  { nombre: "Calcipotriol", comerciales: ["Daivonex"], presentaciones: ["Crema 50 mcg/g", "Pomada 50 mcg/g", "Solución 50 mcg/g"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Psoriasis en placas" },
  { nombre: "Calcipotriol + betametasona", comerciales: ["Daivobet", "Xamiol"], presentaciones: ["Pomada 50 mcg/g + 0.5 mg/g", "Gel 50 mcg/g + 0.5 mg/g"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Psoriasis en placas" },
  { nombre: "Metotrexato", presentaciones: ["Tabletas 2.5 mg", "Inyectable 25 mg/ml"], categoria: "sistemico_oral", via_default: "oral", controlado: true, uso_comun: "Psoriasis severa. Inmunosupresor." },
  { nombre: "Ciclosporina", comerciales: ["Sandimmun Neoral"], presentaciones: ["Cápsulas 25 mg", "Cápsulas 50 mg", "Cápsulas 100 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: true, uso_comun: "Psoriasis severa, dermatitis atópica. Inmunosupresor." },
  { nombre: "Acitretina", comerciales: ["Neotigason"], presentaciones: ["Cápsulas 10 mg", "Cápsulas 25 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: true, uso_comun: "Psoriasis severa. Teratógeno." },

  // ----- Corticoides tópicos ----------------------------------------
  { nombre: "Hidrocortisona", presentaciones: ["Crema 1%", "Crema 2.5%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Eccema leve, dermatitis" },
  { nombre: "Betametasona", presentaciones: ["Crema 0.05%", "Pomada 0.05%", "Loción 0.05%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Eccema moderado, psoriasis" },
  { nombre: "Mometasona", comerciales: ["Elocom"], presentaciones: ["Crema 0.1%", "Pomada 0.1%", "Loción 0.1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Eccema, dermatitis atópica" },
  { nombre: "Fluocinolona", presentaciones: ["Crema 0.025%", "Pomada 0.025%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Eccema, liquen" },
  { nombre: "Clobetasol", comerciales: ["Dermovate"], presentaciones: ["Crema 0.05%", "Pomada 0.05%", "Loción 0.05%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Psoriasis, eccema severo (potente)" },
  { nombre: "Desonida", presentaciones: ["Crema 0.05%", "Loción 0.05%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Eccema en cara y pliegues (baja potencia)" },

  // ----- Inmunomoduladores tópicos ---------------------------------
  { nombre: "Tacrolimus tópico", comerciales: ["Protopic"], presentaciones: ["Pomada 0.03%", "Pomada 0.1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Dermatitis atópica, vitíligo" },
  { nombre: "Pimecrolimus", comerciales: ["Elidel"], presentaciones: ["Crema 1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Dermatitis atópica" },

  // ----- Antifúngicos ----------------------------------------------
  { nombre: "Ketoconazol tópico", presentaciones: ["Crema 2%", "Shampoo 2%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Tiñas, dermatitis seborreica" },
  { nombre: "Clotrimazol", presentaciones: ["Crema 1%", "Solución 1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Tiñas, candidiasis" },
  { nombre: "Miconazol", presentaciones: ["Crema 2%", "Polvo 2%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Tiñas, candidiasis" },
  { nombre: "Terbinafina tópica", presentaciones: ["Crema 1%", "Gel 1%", "Solución 1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Tiñas" },
  { nombre: "Ciclopirox", presentaciones: ["Crema 1%", "Esmalte 8%", "Shampoo 1.5%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Onicomicosis, dermatitis seborreica" },
  { nombre: "Terbinafina oral", comerciales: ["Lamisil"], presentaciones: ["Tabletas 250 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Onicomicosis, tiñas extensas" },
  { nombre: "Itraconazol", comerciales: ["Sporanox"], presentaciones: ["Cápsulas 100 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Onicomicosis, micosis profundas" },
  { nombre: "Fluconazol", presentaciones: ["Cápsulas 150 mg", "Cápsulas 50 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Candidiasis, tiñas" },
  { nombre: "Griseofulvina", presentaciones: ["Tabletas 500 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Tinea capitis (pediátrica)" },

  // ----- Antibióticos tópicos --------------------------------------
  { nombre: "Mupirocina", comerciales: ["Bactroban"], presentaciones: ["Pomada 2%", "Crema 2%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Impétigo, infección bacteriana superficial" },
  { nombre: "Ácido fusídico", comerciales: ["Fucidin"], presentaciones: ["Crema 2%", "Pomada 2%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Infección bacteriana cutánea" },
  { nombre: "Sulfato de neomicina", presentaciones: ["Pomada 0.5%", "Crema 0.5%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Infección bacteriana superficial" },

  // ----- Antibióticos sistémicos -----------------------------------
  { nombre: "Cefalexina", presentaciones: ["Cápsulas 500 mg", "Suspensión 250 mg/5ml"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Celulitis, foliculitis" },
  { nombre: "Amoxicilina + ácido clavulánico", comerciales: ["Augmentin"], presentaciones: ["Tabletas 875/125 mg", "Suspensión 400/57 mg/5ml"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Infecciones cutáneas" },
  { nombre: "Trimetoprim-sulfametoxazol", comerciales: ["Bactrim"], presentaciones: ["Tabletas 800/160 mg", "Suspensión 200/40 mg/5ml"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Foliculitis MRSA, hidradenitis" },
  { nombre: "Eritromicina", presentaciones: ["Tabletas 500 mg", "Suspensión 250 mg/5ml"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Acné, alternativa en embarazo" },

  // ----- Antivirales / verrugas ------------------------------------
  { nombre: "Imiquimod", comerciales: ["Aldara"], presentaciones: ["Crema 5%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Verrugas genitales, queratosis actínica" },
  { nombre: "Podofilotoxina", presentaciones: ["Solución 0.5%", "Crema 0.15%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Verrugas genitales" },
  { nombre: "Aciclovir tópico", presentaciones: ["Crema 5%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Herpes labial" },
  { nombre: "Aciclovir oral", presentaciones: ["Tabletas 400 mg", "Tabletas 800 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Herpes simple, zoster" },
  { nombre: "Valaciclovir", presentaciones: ["Tabletas 500 mg", "Tabletas 1 g"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Herpes simple, zoster" },

  // ----- Antihistamínicos ------------------------------------------
  { nombre: "Loratadina", presentaciones: ["Tabletas 10 mg", "Jarabe 5 mg/5ml"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Urticaria, prurito" },
  { nombre: "Cetirizina", presentaciones: ["Tabletas 10 mg", "Gotas 10 mg/ml"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Urticaria, prurito" },
  { nombre: "Desloratadina", comerciales: ["Aerius"], presentaciones: ["Tabletas 5 mg", "Jarabe 0.5 mg/ml"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Urticaria crónica" },
  { nombre: "Hidroxizina", comerciales: ["Atarax"], presentaciones: ["Tabletas 25 mg", "Jarabe 10 mg/5ml"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Prurito nocturno, ansiedad asociada" },
  { nombre: "Fexofenadina", presentaciones: ["Tabletas 120 mg", "Tabletas 180 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Urticaria" },

  // ----- Corticoides sistémicos (controlados) ----------------------
  { nombre: "Prednisona", presentaciones: ["Tabletas 5 mg", "Tabletas 20 mg", "Tabletas 50 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: true, uso_comun: "Dermatitis aguda severa, autoinmunes. Curso corto." },
  { nombre: "Prednisolona", presentaciones: ["Tabletas 5 mg", "Jarabe 15 mg/5ml"], categoria: "sistemico_oral", via_default: "oral", controlado: true, uso_comun: "Pediátrico, dermatitis severa" },
  { nombre: "Deflazacort", presentaciones: ["Tabletas 6 mg", "Tabletas 30 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: true, uso_comun: "Alternativa a prednisona" },

  // ----- Misceláneos -----------------------------------------------
  { nombre: "Minoxidil tópico", comerciales: ["Rogaine"], presentaciones: ["Solución 2%", "Solución 5%", "Espuma 5%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Alopecia androgénica" },
  { nombre: "Finasteride oral", comerciales: ["Propecia"], presentaciones: ["Tabletas 1 mg", "Tabletas 5 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Alopecia androgénica masculina" },
  { nombre: "Permetrina", presentaciones: ["Crema 5%", "Loción 1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Escabiosis, pediculosis" },
  { nombre: "Ivermectina oral", presentaciones: ["Tabletas 6 mg"], categoria: "sistemico_oral", via_default: "oral", controlado: false, uso_comun: "Escabiosis resistente" },
  { nombre: "Urea", presentaciones: ["Crema 10%", "Crema 20%", "Crema 40%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Xerosis, queratosis" },
  { nombre: "Ácido salicílico tópico", presentaciones: ["Crema 2%", "Crema 6%", "Solución 17%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Queratosis, verrugas, psoriasis" },
  { nombre: "Tazaroteno", comerciales: ["Tazorac"], presentaciones: ["Crema 0.05%", "Gel 0.1%"], categoria: "topico", via_default: "tópica", controlado: false, uso_comun: "Psoriasis, acné" },
  { nombre: "Crioterapia con nitrógeno líquido", presentaciones: ["Spray", "Aplicador"], categoria: "procedimiento", via_default: "tópica", controlado: false, uso_comun: "Verrugas, queratosis actínica" },
  { nombre: "Lidocaína local", presentaciones: ["Inyectable 1%", "Inyectable 2%", "Crema 5%"], categoria: "procedimiento", via_default: "otra", controlado: false, uso_comun: "Anestesia previa a biopsia / cirugía" },
];

/**
 * Filter the catalogue by free-text query. Matches against nombre,
 * comerciales (sinónimos) and uso_comun. Returns the first `limit`
 * results sorted alphabetically. The autocomplete uses limit=8 so
 * the dropdown stays scannable.
 */
export function searchMedicamentos(query: string, limit = 8): MedicamentoCatalogo[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const normalized = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const nq = normalized(q);

  const matches: MedicamentoCatalogo[] = [];
  for (const m of MEDICAMENTOS) {
    const haystack = [
      m.nombre,
      ...(m.comerciales ?? []),
      m.uso_comun ?? "",
    ]
      .map(normalized)
      .join(" ");
    if (haystack.includes(nq)) {
      matches.push(m);
      if (matches.length >= limit) break;
    }
  }
  return matches.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Find a single catalogue entry by exact nombre. Used when the user
 * picks an autocomplete result.
 */
export function findMedicamento(nombre: string): MedicamentoCatalogo | null {
  const trimmed = nombre.trim();
  return MEDICAMENTOS.find((m) => m.nombre === trimmed) ?? null;
}
