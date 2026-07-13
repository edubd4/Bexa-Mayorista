import type { TipoCliente } from "@/lib/validators/cliente"

export const TIPO_CLIENTE_LABEL: Record<TipoCliente, string> = {
  MAYORISTA: "Mayorista",
  MINORISTA: "Minorista",
}

// Variantes admitidas por components/ui/badge.tsx
export const TIPO_CLIENTE_VARIANT: Record<TipoCliente, "accent" | "amber"> = {
  MAYORISTA: "accent",  // naranja marca — es el core del negocio
  MINORISTA: "amber",
}
