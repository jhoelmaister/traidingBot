# CLAUDE.md — traidingBot

## Reglas obligatorias de cada sesión

1. Contexto primero
   - Leer `AGENTS.md` y el código existente relevante antes de proponer cualquier cambio.
   - No reinventar patrones ya establecidos (estructura de `src/lib` sin React, componentes,
     estilo del CSS, textos de UI en español).

2. Ejecutar directo en pedidos claros
   - Si el pedido es concreto y acotado (pocos archivos, reversible, sin ambigüedad) o ya está
     cubierto por una regla de este archivo (ej. Reglas de Git): aplicarlo directo, sin pedir
     confirmación antes ni preguntar "¿querés que...?". Avisar después qué se hizo.
   - Mostrar plan y esperar confirmación explícita SOLO en cambios grandes/estructurales: muchos
     archivos, difíciles de revertir, o que tocan arquitectura/diseño ya establecido.

3. Ante la duda real
   - Preguntar solo cuando algo no se pueda resolver con el contexto, el código o las reglas de
     este archivo. Si una regla ya lo dice, no volver a preguntar.

4. Documentación
   - Este repo no tiene `CONTEXT.md`: el estado del proyecto vive en `AGENTS.md` (mapa de
     archivos y convenciones) y en `README.md` (cómo se usa). Ambos se actualizan junto con el
     cambio que los deja desactualizados, no en una pasada aparte al final.

Estas reglas aplican durante toda la sesión, no solo al inicio.

## Reglas de Git

- NUNCA hacer push de ramas `claude/*` al remoto.
- Solo hacer push de `main` (esta es la rama por defecto del repo; equivale a `master` en
  SistemaGestion).
- Las ramas `claude/*` existen únicamente en local.

> **Sesiones remotas/web:** esta regla se cumple literal, sin excepción — tampoco como
> backup intermedio. El contenedor de la sesión es efímero, así que el riesgo es real y
> aceptado: si la sesión se corta antes de pushear a `main`, el trabajo no pusheado se
> pierde sin respaldo. Para acotar esa ventana, pushear a `main` apenas un cambio esté
> confirmado y listo, en vez de acumular varios cambios antes de pushear.

> **Nota sobre el arranque de las sesiones web:** el entorno de Claude Code en la web asigna
> una rama `claude/*` y pide desarrollar ahí. Se puede trabajar en esa rama local, pero el
> push va a `main`: hay que integrar el trabajo a `main` (merge o rebase) y pushear `main`.

## Verificación antes de pushear

Todo cambio en `src/` tiene que pasar, como mínimo:

```bash
npm run lint
npm test
npm run build
```

Si el cambio toca la UI (vistas, gráfico, dibujos, ventanas de configuración), correr también
el end-to-end, que maneja la app real dentro de Electron:

```bash
npm run test:ui
```

No dar por buena una función de UI sin haberla visto funcionar: o con `npm run test:ui`, o
levantando la app. Reportar el resultado tal cual salió, incluidos los fallos.

## Versionado

La versión vive en `version` de `package.json` y es la que usa electron-builder para nombrar
los instalables de `release/`. Este repo **no** tiene workflow de release ni actualizaciones
automáticas: los instalables se generan a mano con `npm run desktop:dist`, y la web se publica
sola en Netlify con cada push a `main`.

**Cuando el usuario pida "subí la versión a X.Y.Z" (o similar), validar el número ANTES de
aplicarlo** (leer la versión actual de `package.json` y comparar):

- **Formato**: debe ser `X.Y.Z` (tres números). Si el usuario da algo incompleto como `1.1`,
  NO asumir: preguntarle si quiere `1.1.0` o `1.0.2`.
- **Debe ser MAYOR** que la actual (semver). Si es igual o menor, NO aplicarla: avisarle
  (ej. "ya estás en 1.0.1, no puedo bajar/repetir").
- **El salto debe ser razonable**: lo normal es el siguiente parche (1.0.1 → 1.0.2), el
  siguiente minor (1.0.1 → 1.1.0) o el siguiente major (1.0.1 → 2.0.0). Si el número pedido
  salta de más (ej. 1.0.1 → 1.5.0, o 1.0.1 → 3.0.0), CONFIRMAR antes de aplicarlo, por si fue
  un error de tecleo.
- Ante cualquier duda con el número, preguntar; nunca aplicar un número raro en silencio.
