# Cuentas por proyecto — la fuente de verdad

Este archivo se copia a **todos** los proyectos hijos en el bootstrap. Si estás en un hijo y
esto contradice cualquier otra doc, gana este archivo — y avisá para corregir la otra.

Existe porque el mismo error se cometió **tres veces**: pushear con la identidad de git
equivocada. La tercera fue la peor, porque se cambió una firma que funcionaba y quedaron
todos los deployments en `Blocked` durante un día.

---

## La cadena que Vercel verifica

No alcanza con "usar la cuenta del cliente". Vercel recorre esto, entero:

```
email del commit
  → usuario de GitHub que tiene ese email registrado
    → cuenta de Vercel conectada a ESE usuario de GitHub
      → ¿esa cuenta es miembro del team donde vive el proyecto?
```

Si cualquier eslabón se corta, el deployment sale **Blocked**.

**El error clásico, y es contraintuitivo:** mirar quién es el miembro del team de Vercel y
firmar con SU mail. Falla, porque ese mail puede no corresponder a ningún usuario de GitHub
— y ahí el hover del deployment dice `GitHub user not found`, sin cuenta de Vercel, Blocked.

Lo que importa no es de quién es el mail: es que ese mail **pertenezca a un usuario de
GitHub** que esté **conectado a una cuenta de Vercel del team**. Un mail puede ser del dueño
del team y no servir; otro puede parecer "ajeno" y ser el correcto.

---

## Tabla de identidades

Verificada el 2026-08-10 contra deployments efectivamente en `Ready`.

| Repo | `user.name` | `user.email` | Vercel (cuenta → team) |
|---|---|---|---|
| `argsclubos-dotcom/Forja` | `argsclubos-dotcom` | `argsclubos@gmail.com` | — (el maestro no deploya) |
| `argsclubos-dotcom/Forja-B` | `argsclubos-dotcom` | `argsclubos@gmail.com` | — |
| `argsclubos-dotcom/Inmobiliaria` | `argsclubos-dotcom` | `argsclubos@gmail.com` | `contratistasclubos-8756` → `Contratist-Sclubos` |
| `argsclubos-dotcom/Contratista` | `argsclubos-dotcom` | `argsclubos@gmail.com` | `contratistasclubos-8756` → `Contratist-Sclubos` |
| `argsclubos-dotcom/GranCorte` | `argsclubos-dotcom` | `argsclubos@gmail.com` | cuenta del cliente |
| `edubd4/Bexa-Mayorista` | `Eduardo Barreiro` | `40526032+edubd4@users.noreply.github.com` | cuenta de `edubd4` |
| `edubd4/gojulito` | `Eduardo Barreiro` | `40526032+edubd4@users.noreply.github.com` | cuenta de `edubd4` |
| Cliente nuevo | resolver con el procedimiento de abajo, **antes** del primer commit |

⚠ **`argsclubos-dotcom/Inmobiliaria` NO se firma con `contratistasclubos@gmail.com`.** Ese
mail no existe como usuario de GitHub. Es exactamente el error que costó un día.

### GitHub CLI

Las dos cuentas están en el keyring: `gh auth switch -u <cuenta>`.

| Cuenta `gh` | Repos |
|---|---|
| `argsclubos-dotcom` | Forja, Forja-B, Inmobiliaria, Contratista, GranCorte |
| `edubd4` | Bexa-Mayorista, gojulito |

Devolver la activa a `argsclubos-dotcom` al terminar una tanda con la otra.

---

## Procedimiento — antes del PRIMER commit de cada sesión, en cada repo

**1. Fijar la identidad LOCAL.** Nunca `--global`; los clones nuevos no heredan config local.

```bash
git config user.name "<name>" && git config user.email "<email>"
```

**2. Verificar contra lo que ya funcionó.** Si el repo tiene deployments en Ready, su firma
es la respuesta — y le gana a cualquier razonamiento sobre quién debería ser:

```bash
gh api repos/<owner>/<repo>/commits --jq '.[0:5][].commit.author'
```

**3. Si no hay deploys verdes todavía** (proyecto recién creado), abrí Vercel → Deployments,
pasá el mouse sobre uno y leé las **tres** líneas: *Commit Author*, *GitHub User*, *Vercel
Account*. Las tres tienen que resolver. `GitHub user not found` = ese mail no sirve.

---

## Diagnóstico rápido cuando algo sale Blocked

| Lo que ves en el hover | Qué significa |
|---|---|
| `GitHub user not found` | El mail del commit no pertenece a ningún usuario de GitHub. Firma equivocada. |
| GitHub User resuelve, `Vercel Account: Unavailable` | Ese usuario de GitHub no tiene cuenta de Vercel conectada. |
| Los tres resuelven pero sigue Blocked | La cuenta de Vercel no es miembro del team. Invitarla, o firmar con otra que sí lo sea. |
| Sale Ready al redeployar a mano | **Es la firma.** Un redeploy manual corre bajo la sesión de quien lo aprieta, no bajo el autor del commit — por eso "funciona" y enmascara el problema. |

**Señal de alarma:** si Eduardo tiene que redeployar a mano, la firma está mal. No es
normal ni es un capricho de Vercel.

Para destrabar `main` después de corregir la identidad, un commit vacío alcanza:

```bash
git commit --allow-empty -m "chore: refirmar con la cuenta del proyecto" && git push
```

---

## Otras cuentas del proyecto

**Supabase** — un proyecto por cliente, en la organización del cliente. El `project-ref` va
en `.env.local` y en Vercel (Production **y** Preview). El maestro tiene el suyo, aparte.

**Un solo proyecto de Vercel por repo.** Si un import falla (repo vacío, preset "Other"),
borrar el proyecto zombie antes de reintentar: dos proyectos sobre el mismo repo generan
doble build por push y checks duplicados en cada PR.

**La conexión GitHub↔Vercel es exclusiva y se puede mover.** Si un usuario de GitHub se
reconecta a otra cuenta de Vercel, una firma que era verde se vuelve Blocked **sin que
cambie nada del repo**. Cuando eso pase, el problema no está en el código.
