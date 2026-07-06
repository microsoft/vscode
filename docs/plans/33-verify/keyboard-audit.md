# Plan 33 iter 3 - keyboard and menu audit (L3, L6, L7)

Systematic walk of the default IDE chords that survive into the Abstract shell, with a verdict per chord and the neutralisation tier applied.
The audit is source-anchored (the chord's registration site in the fork) and confirmed by a light live pass on the web build (`:8084`).

## Method

- Chord source: each row cites the fork file that registers the default keybinding, so the audit re-pins if upstream moves a chord.
- Classification: **keep** (a typing/product chord, or a first-class product surface), **neutralise** (an IDE affordance with no product meaning on our surfaces), **already-dead** (the target was removed at a prior seam so the chord no longer resolves to anything user-visible).
- Neutralisation tier (cheapest first, per the ledger): a leaking chord is shadowed by the built-in `noop` command via an **additive** `KeybindingsRegistry.registerKeybindingRule` at weight 1000 (above `ExternalExtension` = 400) in `livingDocs.contribution.ts`.
  This is a contribution, not a core patch - it calls a public registry from our own module. **0 new core patches.**
  The palette / quick-open chords were already removed at the core seam in v3 iter 2 (decision-30 pattern) and stay guarded by `scripts/check-seams.sh` (seams 4).

## Verdicts

| Chord (mac) | Command | Source | Verdict | Action |
|---|---|---|---|---|
| `Cmd+Shift+P`, `F1` | `workbench.action.showCommands` | `commandsQuickAccess.ts` (`f1:false`) | already-dead | removed at core seam v3 iter 2; guarded by check-seams |
| `Cmd+P` | `workbench.action.quickOpen` | `quickAccessActions.ts` (`f1:false`) | already-dead | removed at core seam v3 iter 2; guarded by check-seams |
| `Cmd+B` | `workbench.action.toggleSidebarVisibility` | `layoutActions.ts:307` | **keep** | the left tree-rail is a first-class product surface (Files / Context / Outline) and collapsing it is legitimate; `Cmd+B` is also **Bold** inside the ProseMirror writing surface (handled in the editor webview). Kept deliberately. |
| `Cmd+Alt+B` | `workbench.action.toggleAuxiliaryBar` (Secondary Side Bar) | `auxiliaryBarActions.ts:53` | **neutralise** | the L3 tooltip chord ("Toggle Secondary Side Bar (⌥⌘B)"). The review rail is a contextual editor companion (decision 94), so a manual IDE "Secondary Side Bar" toggle is a pure IDE tell. Shadowed with `noop`. |
| `Cmd+J` | `workbench.action.togglePanel` | `panelActions.ts:51` | **neutralise** | there is no bottom panel in the calm shell; toggling would reveal empty IDE chrome. Shadowed with `noop`. |
| `Ctrl+`` ` `` | `workbench.action.terminal.toggleTerminal` | `terminal.contribution.ts:128` (mac `WinCtrl+`` `` `) | **neutralise** | the integrated terminal is a defining IDE tell; not one of the kept escape hatches (decision 42 kept only the native Explorer). Shadowed with `noop`. |
| `Cmd+Shift+E` | open `workbench.view.explorer` | `explorerViewlet.ts:270` | **neutralise** | the Explorer container is deregistered (decision D25-C); the chord would try to reveal a removed container. Shadowed with `noop`. |
| `Cmd+Shift+F` | open `workbench.view.search` | `search.contribution.ts:73` | **neutralise** | the Search container is deregistered; IDE affordance only. Shadowed with `noop`. |
| `Cmd+Ctrl+G` (mac) | open `workbench.view.scm` | `scm.contribution.ts:122` | **neutralise** | the SCM container is deregistered; IDE affordance only. Shadowed with `noop`. |
| `Cmd+Shift+X` | open `workbench.view.extensions` | `extensions.contribution.ts:121` | **neutralise** | the Extensions container is deregistered (and builtins are denylisted); IDE affordance only. Shadowed with `noop`. |
| `Cmd+Shift+M` | `workbench.actions.view.problems` | `markers.contribution.ts:153` | **neutralise** | the Problems panel is IDE-only chrome; no product meaning. Shadowed with `noop`. |
| `Cmd+K` chords, `Cmd+T`, `Cmd+W`, `Cmd+Shift+B/H/U/Y`, `F2`-`F12` | various (go-to-symbol, open-tag, close-editor, build, replace, output, debug) | core | **already-dead / keep** | either resolve against surfaces we do not expose (no build task, no output view, no debugger - the actions no-op) or are standard editor/product chords (close editor, rename). None presented an IDE tell in the live sweep; left untouched to avoid over-neutralising typing chords (the Q3 minimal-footprint rule). |

### Neutralised set (the additive contribution)

Eight chords are shadowed by `noop` in `livingDocs.contribution.ts` (`NEUTRALISED_IDE_CHORDS`): `Cmd+J`, `Ctrl+`` `` `, `Cmd+Alt+B`, `Cmd+Shift+E`, `Cmd+Shift+F`, `Cmd+Ctrl+G` (mac) / `Cmd+Shift+G` (win/linux), `Cmd+Shift+X`, `Cmd+Shift+M`.
Guarded by `scripts/check-seams.sh` seam 8 (fails loud if the neutralisation is dropped in a rebase).

## L7 - context menus on our surfaces

- **Screen surfaces** (Home / Templates / Knowledge / Agents) and the **document editor** are our own webviews (`screenRender` / `livingDocRender`). Right-click inside them shows the webview's own minimal browser context menu (Copy / Paste / spellcheck), not the IDE editor context menu - no IDE items leak. The editor-group context menu (split / IDE actions) is not reachable because the editor-group title bar is hidden by `studio.css` and the layout-control settings (iters 1-2).
- **The rails** (tree-rail, review rail) are real VS Code tree/view surfaces. Their context menus are already scoped to our own view id and the contributed items; the built-in IDE view containers that would add "Open to the Side" / SCM items are deregistered, so those items do not appear.
- **Residue (documented, not fixed):** a right-click on the native title-bar area still offers the OS/window "Command Center" and layout entries at the very edge on desktop. This is desktop-only OS chrome, out of the web design-partner surface, and removing it needs a title-bar core patch that the plan explicitly caps. Recorded here and in the ledger as accepted residue rather than spending the core-patch budget.

## Live confirmation (`:8084`)

- On a screen surface and in the document editor: `Cmd+Alt+B`, `Cmd+J`, `Cmd+Shift+E/F/G/X/M` and `Ctrl+`` `` ` produce no visible effect (no rail toggles, no empty panel, no container reveal) - the chords are swallowed.
- `Cmd+B` still collapses/restores the tree-rail on the editor surface; **Bold** still works inside the writing surface (the chord reaches ProseMirror in the editor webview).
- No IDE context menu appears on right-click of a screen or the document body.
