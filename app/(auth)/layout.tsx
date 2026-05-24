import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50">
      <header className="px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-900">
          DERMA INTEL <span className="text-neutral-500">Pro</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="px-6 py-4 text-center text-xs text-neutral-500">
        Un producto de Mirai Lab · Sugerencia de apoyo clínico, no reemplaza criterio médico
      </footer>
    </div>
  );
}
