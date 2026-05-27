import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { Database } from "../types/database";
config({ path: ".env.local" });
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
(async () => {
  const { data } = await supabase
    .from("notificaciones")
    .select(
      `id, tipo, prioridad, titulo, leida, resuelta, fecha_creacion,
       medico:medicos(email)`,
    )
    .order("fecha_creacion", { ascending: false })
    .limit(20);
  for (const n of data ?? []) {
    const emoji = n.prioridad === "alta" ? "🔴" : n.prioridad === "media" ? "🟠" : "🟢";
    console.log(
      `${emoji} [${n.tipo}] ${n.titulo}  |  ${n.medico?.email}  |  leida=${n.leida} resuelta=${n.resuelta}`,
    );
  }
})();
