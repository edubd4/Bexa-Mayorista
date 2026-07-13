# BEXA

Sistema de gestión integral para BEXA Import — Next.js 14 + Supabase + Vercel.

Nacido del repo maestro **Forja** por copia dirigida (blueprint en `registry/bexa.yaml`).
Protocolo del agente en `CLAUDE.md`. Single-tenant, roles admin/vendedor.

## Desarrollo

```bash
cp env.example .env.local   # completar con las keys de Supabase
npm install
npm run dev
```

Migraciones en `supabase/migrations/` — se aplican en el SQL Editor antes de cada merge.
