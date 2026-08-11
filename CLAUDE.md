# BEXA — Sistema de gestión (hijo de Forja)

Sistema a medida, single-tenant, para BEXA Import (distribuidora mayorista/minorista de
electros, ferretería y hogar). **Nacido del repo maestro Forja por copia dirigida.**

- **Blueprint** (el contrato): `registry/bexa.yaml` (copia local) — canónico en
  `FORJA/registry/blueprints/bexa.yaml`.
- **Plan técnico completo**: `../PLAN-TECNICO.md` (FUERA del repo — roadmap por olas,
  modelo de datos, matriz de permisos). Leerlo al arrancar sesión.
- **La ley del código**: `FORJA/docs/PATRONES.md` · **la memoria del dolor**: `FORJA/docs/GOTCHAS.md`.

## Reglas de oro (heredadas de Forja — no negociables)

1. **Presentación ≠ esquema.** La tabla es `clientes`, el usuario ve lo que dice
   `lib/dominio.ts`. El rol de esquema es `admin | colaborador`; acá "colaborador"
   se muestra "Vendedor" (`ROL_LABEL`). Ningún string de entidad en JSX.
2. **Tokens `app-` + CSS variables.** La identidad naranja industrial de BEXA vive SOLO
   en `app/globals.css`. Jamás tocar tokens en componentes.
3. **Prefijos de id_publico = DATO** (`0002_seeds_proyecto.sql`): CLI, PROV, PROD, VTA,
   COMP, MOV, GST. Los triggers los leen de `configuracion`.
4. **Toda tabla nace con RLS ON + policies + GRANTs + REVOKE anon.**
5. **RPC transaccional para toda acción de 2+ tablas.** La promesa de la propuesta
   ("una venta mueve stock, caja, comisión e historial — automático") es `registrar_venta()`.
6. **Archivos que vinieron de Forja se mantienen byte-idénticos.** Un fix a código-del-maestro
   se aplica PRIMERO en Forja y se propaga (`FORJA/scripts/harvest.md`).

## Permisos (PLAN-TECNICO §6 — decidido, no improvisar)

- **Fila (RLS)**: ventas/comisiones → vendedor solo lo suyo
  (`current_user_rol() = 'admin' or vendedor_id = auth.uid()`).
- **Columna (costos)**: vista `productos_catalogo` SIN costo para el vendedor; selección
  de columnas por rol en server. Si un costo llega al client de un vendedor, está MAL
  aunque la UI no lo muestre.
- Caja, finanzas, configuración, usuarios, listas de precios: admin-only.

## Cosecha (obligación con el maestro)

Al cerrar cada ola: los módulos nuevos o mejorados se cosechan hacia Forja
(`FORJA/scripts/harvest.md`). Los que vienen de Tecnopro se generalizan al pasar.

## Git y proceso

- Branches `feat/<modulo>` · conventional commits · **sin Co-Authored-By** · 1 módulo = 1 PR.
- **Identidad git: `docs/CUENTAS.md` es la fuente de verdad** (tabla por repo, cuenta `gh`,
  cadena que verifica Vercel). Config LOCAL al repo, nunca `--global`, antes del primer commit.
- `npm run build` verde antes de push. Migración SQL leída y aplicada ANTES del merge.
- Preview de Vercel clickeado antes de mergear. `main` = producción.

## Memoria (engram)

`mem_save` con `project: "bexa"` (topic keys `bexa/...`) por cada decisión/gotcha.
Gotchas nuevos se agregan TAMBIÉN a `FORJA/docs/GOTCHAS.md`. `mem_session_summary` al cerrar.
