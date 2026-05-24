"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type AuthActionResult } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: AuthActionResult = { error: null };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Crear cuenta</CardTitle>
        <CardDescription>
          Acceso reservado a dermatólogos licenciados en ejercicio.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="medico@consulta.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="text-xs text-neutral-500">Mínimo 8 caracteres.</p>
          </div>
          {state.error && (
            <p className="text-sm text-neutral-700" role="status">
              {state.error}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
          <p className="text-center text-sm text-neutral-600">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-neutral-900 underline">
              Inicia sesión
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
