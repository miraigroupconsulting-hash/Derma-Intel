"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  markNotificacionLeida,
  markAllNotificacionesLeidas,
  resolverNotificacion,
} from "./notificaciones-actions";
import { colorPrioridad } from "@/lib/recordatorios";

type Filter = "todas" | "sinLeer" | "urgentes";

interface NotifRow {
  id: string;
  tipo: "recordatorio" | "alerta" | "sistema";
  prioridad: "baja" | "media" | "alta";
  titulo: string;
  mensaje: string | null;
  accion_url: string | null;
  paciente_id: string | null;
  leida: boolean;
  fecha_creacion: string;
}

/**
 * Bell + drawer for the notification center.
 *
 * Server passes the initial unread count for the badge. On open, the
 * drawer fetches the full list client-side (paginated) and renders
 * filters + per-item actions.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [filter, setFilter] = useState<Filter>("todas");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      let q = supabase
        .from("notificaciones")
        .select(
          "id, tipo, prioridad, titulo, mensaje, accion_url, paciente_id, leida, fecha_creacion",
        )
        .eq("medico_id", user.id)
        .eq("resuelta", false)
        .order("fecha_creacion", { ascending: false })
        .limit(50);
      if (filter === "sinLeer") q = q.eq("leida", false);
      if (filter === "urgentes") q = q.eq("prioridad", "alta");
      const { data } = await q;
      setNotifs((data ?? []) as NotifRow[]);
    } finally {
      setLoading(false);
    }
  };

  // Reload when drawer opens or filter changes
  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter]);

  const handleMarcarLeida = (id: string) => {
    startTransition(async () => {
      await markNotificacionLeida(id);
      setNotifs((prev) =>
        prev.map((n) => (n.id === id ? { ...n, leida: true } : n)),
      );
      setUnread((c) => Math.max(0, c - 1));
    });
  };

  const handleResolver = (id: string) => {
    startTransition(async () => {
      await resolverNotificacion(id);
      setNotifs((prev) => prev.filter((n) => n.id !== id));
      setUnread((c) => Math.max(0, c - 1));
      router.refresh();
    });
  };

  const handleMarcarTodas = () => {
    startTransition(async () => {
      await markAllNotificacionesLeidas();
      setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
      setUnread(0);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonVariants({ variant: "outline", size: "sm" }) + " relative"
        }
        aria-label={`Notificaciones (${unread} sin leer)`}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[0.6rem] font-medium text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h2 className="text-base font-semibold">Notificaciones</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-neutral-500 hover:underline"
              >
                Cerrar ×
              </button>
            </header>

            <nav className="flex items-center gap-1 border-b border-neutral-200 px-3 py-2">
              {(["todas", "sinLeer", "urgentes"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={
                    "h-7 rounded-full px-2.5 text-xs transition " +
                    (filter === f
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-100")
                  }
                >
                  {f === "todas" ? "Todas" : f === "sinLeer" ? "Sin leer" : "Urgentes"}
                </button>
              ))}
              <button
                type="button"
                onClick={handleMarcarTodas}
                disabled={pending || unread === 0}
                className="ml-auto text-xs text-neutral-500 underline hover:no-underline disabled:opacity-50"
              >
                Marcar todas leídas
              </button>
            </nav>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="p-4 text-center text-sm text-neutral-500">
                  Cargando…
                </p>
              ) : notifs.length === 0 ? (
                <p className="p-8 text-center text-sm text-neutral-500">
                  No hay notificaciones en este filtro.
                </p>
              ) : (
                <ul>
                  {notifs.map((n) => {
                    const color = colorPrioridad(n.prioridad);
                    return (
                      <li
                        key={n.id}
                        className={`border-b border-neutral-100 px-3 py-3 ${
                          n.leida ? "opacity-70" : "bg-neutral-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium ${color.text}`}>
                            {color.icon} {n.titulo}
                          </p>
                          <span className="text-[0.6rem] text-neutral-400">
                            {new Date(n.fecha_creacion).toLocaleString(
                              "es-VE",
                              { dateStyle: "short", timeStyle: "short" },
                            )}
                          </span>
                        </div>
                        {n.mensaje && (
                          <p className="mt-1 text-xs text-neutral-700">
                            {n.mensaje}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          {n.accion_url && (
                            <Link
                              href={n.accion_url}
                              onClick={() => setOpen(false)}
                              className={buttonVariants({
                                size: "sm",
                                variant: "outline",
                              })}
                            >
                              Ver
                            </Link>
                          )}
                          {!n.leida && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleMarcarLeida(n.id)}
                              disabled={pending}
                            >
                              Leído
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleResolver(n.id)}
                            disabled={pending}
                          >
                            Resolver
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
