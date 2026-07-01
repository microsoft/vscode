# Mobile Session Layout Controller — Spec

Specifies [`mobileSessionLayoutController.ts`](./mobileSessionLayoutController.ts)
(`MobileLayoutController`), the reduced layout controller used on the **web phone** layout. It extends
[`BaseLayoutController`](./baseSessionLayoutController.md) (rules `B*`).

- **Rules** describe the user-visible behaviour, grouped by scenario. Each rule has a stable reference
  tag (`[M*]`) used by the code and tests; numbering does not imply an order.
- **Implementation notes** describe *how* the rules are realized. Read these only when changing the
  code.

---

## Rules

### Scenario: layout on a phone
The phone layout reuses the shared per-session layout state but suppresses the auxiliary bar, which has
no room on a narrow viewport.

#### M1 — Same per-session layout as every other surface
A session still remembers its panel (B1) and open editors (B2), with the same persistence (B3, B4) and
multiple-session fallback (B5) as everywhere else.

#### M2 — The side pane is never automated
The auxiliary bar (side pane) is never auto-opened, auto-closed or remembered on phones — not when
switching sessions, submitting a new session, or when changes arrive. This avoids disruptively
expanding the secondary side bar on a narrow phone viewport.

---

## Implementation notes

- **Registration** — contributed by `sessions.layout.contribution.ts`
  (`WorkbenchPhase.AfterRestored`) **only** on the web phone layout, i.e. when `isWeb && isMobile`.
  The contribution is imported from `sessions.web.main.ts`.
  Every other layout uses the [desktop controller](./desktopSessionLayoutController.md).
- **No side-pane wiring [M2]** — deliberately does **not** override `_registerViewStateManagement`,
  so none of the desktop auxiliary-bar logic runs.
