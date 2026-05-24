"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthActionResult } from "../actions";
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

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Iniciar sesión</CardTitle>
        <CardDescription>
          Accede al panel clínico de DERMA INTEL Pro.
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
              autoComplete="current-password"
              required
            />
          </div>
          {state.error && (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Ingresando…" : "Ingresar"}
          </Button>
          <p className="text-center text-sm text-neutral-600">
            ¿Aún no tienes cuenta?{" "}
            <Link href="/signup" className="font-medium text-neutral-900 underline">
              Crear una
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
