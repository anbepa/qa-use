# Arquitectura final: Live Preview + Control Humano Prioritario + Control IA

## 1. Objetivo
Diseñar un sistema donde un único navegador real (Chrome sobre Xvfb) pueda ser controlado prioritariamente por una persona, con asistencia puntual de la IA. La IA solo ejecuta acciones atómicas autorizadas, siempre interrumpibles por interacción humana.

## 2. Principios y restricciones clave
- **Prioridad absoluta del humano**: cualquier movimiento de mouse/teclado del usuario invalida o detiene la acción IA en curso.
- **Navegador visible**: ejecución siempre en modo no headless, expuesta vía VNC/noVNC para el Live Preview.
- **Acciones IA atómicas**: la IA propone y ejecuta un único paso por autorización (sin loops continuos).
- **Cambio dinámico de control**: transición segura HUMAN_CONTROL ⇄ AI_PENDING ⇄ AI_EXECUTING.
- **Una sola sesión de navegador** compartida por humano e IA.
- **Auditoría estructurada** de toda acción (propuesta, autorización, ejecución, interrupción).
- **Interrupción inmediata**: middleware de cancelación que corta la acción Playwright ante input humano.

## 3. Modelo de estados y control
- `HUMAN_CONTROL`: input humano habilitado; IA bloqueada salvo solicitudes de propuesta.
- `AI_PENDING`: IA analiza DOM (read-only) y propone acción; espera aprobación explícita.
- `AI_EXECUTING`: IA ejecuta acción atómica con Playwright MCP; si se detecta evento humano → transición inmediata a `HUMAN_CONTROL`.

Eventos clave: `request_ai`, `propose_action`, `approve_action`, `reject_action`, `human_input`, `action_start`, `action_end`, `action_interrupt`.

## 4. Componentes
### Frontend (React/Next)
- **Live Preview**: iframe noVNC con stream del display Xvfb.
- **Indicador de control**: badge visible 🔴/🤖 sincronizado con estado backend.
- **Botones**: “Tomar control”, “Ceder control a IA”, “Pausar ejecución IA”.
- **Panel de autorización**: muestra acciones propuestas `{id,tipo,selector,descripcion}` con botones Aprobar/Rechazar.
- **Registro visual**: timeline de eventos (propuesta, ejecución, interrupción) sincronizada por WebSocket/SSE.
- **Eventos de interrupción**: listeners a input (mouse/teclado en noVNC) que envían `human_input` al backend.

### Backend Orquestador (Node.js)
- **API WebSocket/SSE** para estado y eventos en tiempo real.
- **Control lock (mutex)** por sesión de navegador; garantiza exclusión en `AI_EXECUTING`.
- **Endpoint REST `/api/live-control`**: expone `GET`/`POST` in-memory para sincronizar el estado `HUMAN_CONTROL → AI_PENDING → AI_EXECUTING` y las acciones prioritarias del humano (takeover/interrupt/reject).
- **State machine** con guardas para transiciones válidas y rollback a `HUMAN_CONTROL` ante interrupción/timeout.
- **Middleware de interrupción**: buffer de eventos de input humano; si llega mientras Playwright ejecuta → cancela paso (AbortController/timeout) y emite `action_interrupt`.
- **Playwright MCP executor**: ejecuta acciones atómicas traducidas desde la propuesta (click, type, fill, press, waitForSelector). Sin bucles; cada acción tiene timeout corto (p.ej. 8–10s).
- **Auditoría**: persiste cada evento con timestamp, actor (humano/IA), selector/URL, resultado, screenshot opcional.
- **API REST**: endpoints `/state`, `/actions/propose`, `/actions/approve`, `/actions/reject`, `/actions/interrupt`, `/log`.

### Contenedor Browser Runtime
- **Chrome real** con Xvfb + VNC + noVNC** (ver `docker-compose.live-preview.yaml`).
- **Sesión única**: un contenedor `browser` expuesto vía puertos 5900 (VNC) y 7900 (noVNC web). 
- **Canal Playwright**: backend conecta vía WebSocket DevTools (`ws://browser:9222`) o lanzando Chrome con `--remote-debugging-port=9222` apuntando al display Xvfb.

### Almacenamiento y logs
- Base de datos relacional para auditoría (acciones, eventos, evidencias).
- Bucket local/S3 para capturas y videos cortos por acción.
- Log estructurado (JSON) con correlación por `session_id` y `action_id`.

## 5. Flujo de ejecución (end-to-end)
1. **Inicio**: estado `HUMAN_CONTROL`. Frontend muestra 🔴 y habilita controles de IA.
2. **Ceder control**: usuario pulsa “Ceder control a IA” → backend `request_ai` → estado `AI_PENDING`.
3. **Análisis DOM**: IA obtiene snapshot del DOM (read-only) vía Playwright MCP; genera propuesta `{id,tipo,selector,descripcion}`.
4. **Autorización**: propuesta enviada al frontend; usuario aprueba/rechaza.
   - Rechazo → estado vuelve a `HUMAN_CONTROL`.
5. **Ejecución**: aprobación → backend toma lock, cambia a `AI_EXECUTING`, ejecuta acción atómica con timeout.
6. **Interrupción**: si el humano mueve mouse/teclea o presiona “Tomar control/Pausar” → middleware aborta acción, libera lock, emite `action_interrupt`, estado `HUMAN_CONTROL`.
7. **Fin de acción**: éxito o error → `action_end`, se libera lock, estado `HUMAN_CONTROL` o `AI_PENDING` según configuración de lote.

## 6. Contratos de datos principales
### Propuesta IA → Frontend
```json
{
  "id": "step-001",
  "tipo": "click" | "fill" | "press" | "wait_for_selector",
  "selector": "#confirm",
  "descripcion": "Click en botón Confirmar"
}
```

### Evento de autorización
`POST /actions/approve { actionId }`
`POST /actions/reject { actionId, reason? }`

### Evento de interrupción
`POST /actions/interrupt { source: "human_input" | "timeout" }`

### Evento de estado (WebSocket/SSE)
```json
{
  "state": "HUMAN_CONTROL" | "AI_PENDING" | "AI_EXECUTING",
  "actionId": "step-001" | null,
  "timestamp": "...",
  "cursor": { "x": 120, "y": 440 },
  "actor": "human" | "ai"
}
```

## 7. Seguridad y gobernanza
- Autenticación en frontend y backend; tokens para API de aprobación.
- Lista blanca de orígenes para WebSocket/SSE.
- Roles: `human_operator`, `ai_executor`, `auditor` (solo lectura de logs).
- Rate limiting para evitar spam de propuestas o interrupciones.

## 8. Observabilidad
- Métricas Prometheus: tiempo de autorización, duración de acciones, ratio de interrupciones, disponibilidad del navegador.
- Tracing (OpenTelemetry) con spans por estado y por acción Playwright.
- Dashboards para auditoría de control y estabilidad del runtime.

## 9. Tareas de implementación por capa
- **Frontend**: 
  - Integrar noVNC iframe; propagar eventos de input → `/actions/interrupt`.
  - Estado global con React Query/SWR suscrito a WebSocket.
  - UI de autorización y timeline de eventos.
- **Backend**:
  - FSM + mutex por sesión; middleware de interrupción.
  - Integración Playwright MCP con AbortController y timeouts cortos.
  - Auditoría persistente y streaming de eventos.
- **Runtime**:
  - Contenedor Chrome con VNC/noVNC, puerto DevTools 9222, volumen para descargas/evidencias.

## 10. Consideraciones de fallo
- Si el contenedor `browser` cae → emitir `degraded` y bloquear IA hasta reconexión.
- Si WebSocket se pierde → UI fuerza estado `HUMAN_CONTROL` y solicita reconectar.
- Timeouts conservadores para evitar bloqueos; reintentos solo bajo aprobación humana.

## 11. Cumplimiento de criterios
La arquitectura garantiza navegación visible, prioridad humana, autorización por paso, ejecución atómica de la IA, y auditoría integral de todas las transiciones y acciones.
