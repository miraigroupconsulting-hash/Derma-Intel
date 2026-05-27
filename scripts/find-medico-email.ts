/**
 * Quick helper: list medico emails in the DB so we know which one to
 * use for the seed.
 */
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
  const { data, error } = await supabase
    .from("medicos")
    .select("id, email, nombre, apellido")
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  for (const m of data ?? []) {
    console.log(`${m.email}\t${m.nombre ?? ""} ${m.apellido ?? ""}\t${m.id}`);
  }
})();
