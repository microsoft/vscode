# Modern UI theming

CSS selector performance requirements, audit scope, and the repeatable workbench
benchmark are documented in [CSS_PERFORMANCE.md](./CSS_PERFORMANCE.md).

Modern UI uses the standard workbench color theme system. Theme authors can use these color IDs in a theme's `colors` object, and users can use them in `workbench.colorCustomizations`.

The Modern UI colors below are experimental and require a build that supports them. Enable `workbench.experimental.modernUI` to use them in the main workbench. The shared `modernTab.*` and `modernEditorTab.*` colors also apply to the modern tab style in the Agents window. `statusBar.inactiveBackground` works in both classic and Modern UI layouts.

## Layout density

With Modern UI enabled, `window.density.layout` set to `default` keeps the workbench's floating cards, outer gutters, and rounded corners. In `compact` density, the main editor window's panels meet each other and the surrounding window chrome without outer spacing or corner radii. Internal separators and control padding remain intact; status bar items stay centered and keep their own horizontal inset. This perimeter treatment does not change modal editors, auxiliary editor windows, or the Agents window.

## Editor tab style

`workbench.experimental.modernUIEditorTabStyle` chooses the editor tab treatment when `workbench.experimental.modernUI` is enabled:

- `connected` (default): the bottom tab row spans the strip height without gaps. Its active tab joins the editor surface with an outside stroke and curved shoulders. First tabs and wrapped-row starts omit their own left stroke and outside shoulder; the editor frame paints that edge once. Upper wrapped rows and a separate pinned row retain rounded pills. An active tab on the outermost row reuses the editor frame's top stroke. In high-contrast themes, one rounded editor-group frame continuously encloses the title and editor surface on all four sides.
- `pill`: separate rounded tabs, without the connected stroke or shoulders.

Changes apply immediately, including in auxiliary editor windows. The Agents window follows the same setting for chat and side-panel tabs, independently of the broader Modern UI setting. Connected tabs are the default in both windows; select `pill` to restore the separate rounded tabs.

The connected root marker is defined with the editor control constants and shared by editor layout, the Modern UI and Sessions contributions, and theming. Each contribution owns toggling the marker on its workbench containers. Core editor-tab behavior depends on the connected marker independently of the broader Modern UI marker. `connectedEditorTabs.css` owns marker-gated geometry shared by Modern UI and Agents tabs, while `connectedEditorTabs.ts` owns marker-gated theme derivations. Core editor-tab code only handles behavior that CSS cannot provide: row classification, label compression, shoulder-aware reveal, and viewport clipping.

Connected tabs preserve at least the first basename character, an ellipsis, the extension, any decoration badge, and the action column when shrinking. File icons collapse first and return when the editor is widened; full names remain available in the hover and accessible label. Default `fit` sizing remains content-sized: the measured minimum is a compression safeguard, not a preferred tab width. Active close actions and dirty indicators remain visible, while clean inactive close actions appear on hover or keyboard focus. The final tab and the right viewport boundary keep an inset curved shoulder instead of a straight clipped edge. Explicit compact pinned tabs retain their icon-only sizing.

The bottom shoulders and freestanding caps share the same control radius plus the outside stroke (5px with the default tokens), including at clipped viewport edges. The outermost connected row shares the editor's top stroke without squaring its free corners. Only corners adjoining the left frame are straight; the editor's own clipping supplies its outer corner radius. Upper wrapped rows use the original control radius on their free corners and align to the same left edge as the bottom row. Wrapped fills occupy equal-height row hit boxes (28px normally, 24px compact), without horizontal gutters between their painted surfaces, with spacing only between rows and no extra gutter below the final row. Hover does not change their geometry.

Close-action clearance is derived from the existing tab height and row gutters, independently of the shoulder radius. The same clearance reserves label space and positions the 20px hover target. Painted borders are excluded from the available content area: a wrapped connected row centers its action below the cap's top stroke, while a single standard row uses the shared frame. Stroke clearance is reserved in inactive tabs too, so selecting a tab never moves its close target. Separate pinned-row pills add their horizontal fill inset to the reservation. Left and right actions use the same centered action surface. High-contrast hover and focus indicators belong to the close target, not a second border around its action container.

Wrapped tabs reserve the same action space before and after row classification; upper-row markers and row-end markers must not trigger another fit-tab reflow. Selection must not change a tab's width or margin. Shoulder space is reserved only after the final tab, independently of selection; intermediate shoulders paint over adjacent tab surfaces without inserting a gap.

Automatic reveal includes the complete shoulder and rounds fractional layout bounds outward so the selected action is not clipped. Manual scrolling can still move part of the selected tab, including its action, offscreen. In that case a stationary cap and shoulder finish the visible outline; their stroke is aligned with the document separator, and the clipping mask falls back to `editor.background` when the theme does not define a tab-strip background.

The connected design uses `editor.background` for the active tab; its action container is transparent so it cannot cover the cap stroke in compact rows. The selected tab and editor body read as one document well. Its outside stroke, shoulders, and strip separator use `editorGroupHeader.tabsBorder`, falling back to `tab.border`. Upper wrapped and separate pinned rows change only the tab shape, not its selected background. The strip and inactive tabs use `editorGroupHeader.connectedTabsBackground`, and their hover fill is derived from `foreground` over that background. Existing tab foreground customizations continue to apply. `modernEditorTab.activeBackground` remains available to the pill style.

Agents chat tabs use the same connected shape, strip colors, and theme-aware stroke as side-panel tabs, with the selected tab joining the active or inactive session's background instead of `editor.background`. Overflowing chat tabs expose a thin, draggable horizontal scrollbar on hover without increasing the tab-row height. Tab selection, close actions, status indicators, inline renaming, drag and drop, and keyboard navigation retain their existing behavior.

`editorGroupHeader.connectedTabsBackground` defaults to `editorGroupHeader.tabsBackground`, so themes can keep their established strip palette without customization. The bundled connected palettes are Dark 2026 `#202122`, Light 2026 `#EAEAEA`, Dark Modern `#2B2B2B`, Light Modern `#E5E5E5`, the classic dark themes `#303031`, the classic light themes `#E8E8E8`, and Quiet Light `#E4E4E4`. Their original global `editorGroupHeader.tabsBackground` and `tab.inactiveBackground` values remain unchanged. Shared connected theme derivations, including Agents-window tabs, use `editorGroupHeader.tabsBackground` outside Modern UI; only Modern UI editor tabs adopt the dedicated connected-strip palette.

Connected tabs use `tab.inactiveForeground` rather than dimming the general foreground to 50% opacity. The default palettes pair these fills with readable inactive text (at least 4.5:1), including in inactive editor groups. Light Modern and the classic light themes use the existing neutral `#616161`; the classic dark themes use `#A6A6A6`. Explicit legacy foreground customizations still take precedence. HC styling and the original pill label defaults are unchanged.

In high contrast, the connected boundary uses `focusBorder` for the active editor group and `contrastBorder` for other groups. One rounded group frame encloses the title, breadcrumbs, editor header, and document body, including docked Details in the Agents window. With multiple tabs, the surrounding editor-area card stroke is transparent in HC, including in compact layout, so it does not create a second frame. Single and hidden-tab modes retain their original editor-card outline. Keyboard focus and multi-selection indicators remain visible. The frame's inside paint layer does not change editor dimensions when switching themes or active groups.

## Frosted glass overlays

`workbench.modernUIFrostedGlass` is enabled by default in desktop editor and Agents
windows. Editor windows require `workbench.experimental.modernUI`; the Agents
window already uses its own modern design. The treatment applies to quick input
(including the Command Palette), custom menus and pickers, hovers, custom dialogs,
the notification center, and settled notification toasts. It also applies in
auxiliary editor windows. Native OS menus/dialogs, rich quick-input overlays,
editor backgrounds, panels, session cards, chat inputs, and web windows are unchanged.

`workbench.modernUIFrostedGlassOpacity` controls the background tint
as a percentage from **50 to 100**, with **80** as the default.
Lower values reveal more of the blurred backdrop; **100** retains the full theme
background color. Changes apply immediately across all supported overlays,
including shadow-root menus and auxiliary editor windows, without fading text
or controls. The Agents window uses the same preferences and fallbacks, keeping
its existing panel-derived colors for menus and pickers. For a more visible
effect, try:

```json
{
	"workbench.experimental.modernUI": true,
	"workbench.modernUIFrostedGlass": true,
	"workbench.modernUIFrostedGlassOpacity": 75
}
```

The minimum retains a background tint, but lower values can reduce contrast over
busy content. Increase opacity if needed. This setting does not override any
accessibility or GPU fallback.

Both settings use the existing configuration telemetry: explicitly configured
values and their configuration source are reported at workbench startup, subject
to the normal telemetry controls, including application preferences shared with
non-default profiles. Defaults are not reported as explicit choices.
Desktop windows migrate existing preferences from the former experimental setting
names; values explicitly set using the new names take precedence. Web windows
leave the legacy preferences unchanged because these settings are desktop-only.

The normal theme backgrounds remain the fallback. Glass is enabled only after
Electron reports hardware-accelerated GPU compositing, and only where CSS supports
both backdrop filtering and color mixing. Pending, failed, disabled, or software
compositing state reads retain solid surfaces. A shared main-process service owns
GPU lifecycle monitoring for both crash telemetry and all windows. GPU-process
exits invalidate its cached capabilities until a fresh GPU information update
arrives. Each renderer reads the initial state once and subscribes to changes,
including while glass is disabled, without reloading or polling. The effect does
not bypass Chromium's GPU blocklist or change native window transparency.

High-contrast themes, forced colors, OS reduced transparency, and
`workbench.reduceTransparency: "on"` retain the normal backgrounds. OS reduced
transparency is respected even when the workbench setting is `"off"`.
Set `workbench.modernUIFrostedGlass` to `false` to immediately restore
the original presentation if a driver reports acceleration but still renders
incorrectly or performs poorly. Capability reporting cannot detect every driver
or compositor defect.

Each surface uses its existing theme color with the configured tint over one
decorative blur layer. Blur is not applied to the interactive container,
so it does not introduce a containing block for fixed-position child widgets.
Menus install their material through the shared menu stylesheet, including
menus hosted in shadow roots. Context menus, dropdowns, and submenus scale their
glass background, shadow, and contents together without fading. This keeps the selected
tint and real backdrop blur continuous from the first visible frame, including
in nested submenus. Opening a submenu completes any active glass entrance before
positioning it, so the submenu does not jump when the scale animation ends.
Action-list dropdowns use the same scale-only entrance in both window types,
including plain, tabbed, and submenu popups. Their shared renderers enable motion
after measuring the popup, without requiring each trigger to opt in. Updating
items or switching tabs does not replay the entrance. This covers task, provider,
agent, model, workspace, branch, and permission pickers.
Menus and dropdown pickers share closing-motion eligibility: Modern UI or an
active glass root, with motion enabled on that same root. This includes Agents
glass overlays without the editor-only Modern UI class and preserves immediate
dismissal when motion is reduced.
The glass layer also follows the closing scale without fading. Submenus use the
full theme tint while an ancestor's closing fade isolates their backdrops;
closing pickers use the same fallback. Glass menus do not
retain opacity compositor hints after motion finishes.
Controls, selection/focus indicators, sticky headings, and embedded
editor backgrounds stay solid. Quick input opens and dismisses without its opacity
animation in glass mode because that animation isolates the backdrop; toasts retain their
animation and switch to glass only after it finishes. With reduced motion,
toasts apply glass immediately without waiting for a transition event.

## Colors

| Color ID | Purpose | Default |
| --- | --- | --- |
| `modernUI.shellBackground` | Background of the shell gutters around floating workbench surfaces in an active window | `titleBar.activeBackground` |
| `modernUI.inactiveShellBackground` | Background of the shell gutters in an inactive window | `titleBar.inactiveBackground` |
| `surface.background` | Background of framed container surfaces used by the modern layout | `sideBar.background` in dark and high contrast themes; `editor.background` in light themes |
| `surface.foreground` | Foreground of framed container surfaces | `sideBar.foreground` |
| `surface.border` | Shared frame border and default for region-specific frame borders | `foreground` at 15% alpha composited over `surface.background`, producing an opaque color in dark and light themes; `contrastBorder` in high contrast themes |
| `editor.border` | Border of the editor surface in the modern layout | `surface.border` |
| `modernPanel.border` | Outer border of the floating panel surface | `surface.border` |
| `modernSash.gripForeground` | Color of the resting resize grip dots between top-level workbench parts | `foreground` at 40% alpha in dark and light themes; opaque `foreground` in high contrast themes |
| `modernTab.activeBackground` | Background of active Modern UI tabs | `list.inactiveSelectionBackground` |
| `modernTab.activeForeground` | Foreground of active Modern UI tabs | `list.inactiveSelectionForeground`, then `foreground` |
| `modernTab.hoverBackground` | Background of hovered Modern UI tabs | `list.hoverBackground` |
| `modernTab.hoverForeground` | Foreground of hovered Modern UI tabs | `list.hoverForeground`, then `foreground` |
| `editorGroupHeader.connectedTabsBackground` | Background of connected tabs in editor group title headers | `editorGroupHeader.tabsBackground` |
| `modernEditorTab.activeBackground` | Background of active Modern UI editor tabs | `modernTab.activeBackground` |
| `modernEditorTab.activeActionBackground` | Opaque background of actions on active Modern UI editor tabs | `modernEditorTab.activeBackground` composited over `editor.background` |
| `modernEditorTab.activeForeground` | Foreground of active Modern UI editor tabs | `modernTab.activeForeground` |
| `modernEditorTab.activeHoverBackground` | Background of active Modern UI editor tabs when hovered | `modernEditorTab.hoverBackground` |
| `modernEditorTab.activeHoverActionBackground` | Opaque background of actions on active Modern UI editor tabs when hovered | `modernEditorTab.activeHoverBackground` composited over `editor.background` |
| `modernEditorTab.inactiveBackground` | Background of inactive Modern UI editor tabs | Transparent |
| `modernEditorTab.hoverBackground` | Background of hovered Modern UI editor tabs | `modernTab.hoverBackground` |
| `modernEditorTab.hoverActionBackground` | Opaque background of actions on hovered Modern UI editor tabs | `modernEditorTab.hoverBackground` composited over `editor.background` |
| `modernEditorTab.hoverForeground` | Foreground of hovered Modern UI editor tabs | `modernTab.hoverForeground` |
| `modernEditorTab.selectedActionBackground` | Opaque background of actions on selected Modern UI editor tabs | `tab.selectedBackground` composited over `editor.background` |
| `modernActivityBar.background` | Background of the Modern UI activity bar in the default side position | `activityBar.background` |
| `modernActivityBar.inactiveBackground` | Background of the Modern UI activity bar in the default side position in an inactive window | `modernActivityBar.background` |
| `modernActivityBar.border` | Frame border of the Modern UI activity bar in the default side position | `surface.border` |
| `modernActivityBarItem.activeBackground` | Background of active Modern UI activity bar items in the default side position | `modernTab.activeBackground` |
| `modernActivityBarItem.activeForeground` | Foreground of active Modern UI activity bar items in the default side position | `modernTab.activeForeground` |
| `modernActivityBarItem.hoverBackground` | Background of hovered Modern UI activity bar items in the default side position | `modernTab.hoverBackground` |
| `modernActivityBarItem.hoverForeground` | Foreground of hovered Modern UI activity bar items in the default side position | `modernTab.hoverForeground` |
| `statusBar.inactiveBackground` | Resting status bar background in an inactive window with a workspace or folder open | Unset (`null`), retaining `statusBar.background` |

## Roles and precedence

Customize both shell colors when changing the shell palette. `modernUI.inactiveShellBackground` defaults to `titleBar.inactiveBackground`, not to `modernUI.shellBackground`. Only when the inactive shell color resolves to no value does the active shell color take over.

Shell colors with alpha are composited over the workbench background to produce an opaque backdrop. The title bar itself continues to use `titleBar.*`, falling back to `titleBar.activeBackground` when its inactive background is absent.

The `surface.*` colors provide shared framing defaults, not a replacement for every region's semantic colors. Side bars, the panel, and the editor retain `sideBar.background`, `panel.background`, and `editor.background`. Override `editor.border`, `modernPanel.border`, or `modernActivityBar.border` to distinguish a frame from the shared `surface.border`.

Inside the panel, the existing `panelSection.border` separates horizontally arranged views and `panelSectionHeader.border` separates vertically stacked views. Neither controls the outer floating frame. Side bar section dividers use `sideBarSectionHeader.border`. High contrast border defaults use `contrastBorder`, but explicit theme overrides remain effective.

Resize grip dots mark only boundaries between top-level parts, not editor splits or view resizers. They appear with `window.density.layout` set to `default` and are hidden in `compact` density. On hover or drag, the dots yield to the sash highlight controlled by `sash.hoverBorder`.

Activity bar items in non-default top or bottom positions use the `modernTab.*` colors because they share the pane tab presentation.

`statusBar.inactiveBackground` only changes the resting background in an inactive window with a workspace or folder open. Debugging and other status bar background overrides take precedence. Empty windows continue to use `statusBar.noFolderBackground`. Leaving the inactive color unset preserves the existing status bar behavior.

## Examples

Use hexadecimal color values, not color ID strings. The defaults in the table describe fallback relationships, not valid JSON values.

In a color theme file:

```json
{
  "colors": {
    "modernUI.shellBackground": "#181818",
    "modernUI.inactiveShellBackground": "#202020",
    "surface.background": "#181818",
    "surface.foreground": "#cccccc",
    "surface.border": "#3a3a3a",
    "editor.border": "#505050",
    "modernPanel.border": "#505050",
    "modernSash.gripForeground": "#cccccc66",
    "modernTab.activeBackground": "#3d3d3d",
    "modernTab.activeForeground": "#f0f0f0",
    "modernTab.hoverBackground": "#292929",
    "modernTab.hoverForeground": "#f0f0f0",
    "modernEditorTab.activeBackground": "#454545",
    "modernEditorTab.activeActionBackground": "#454545",
    "modernEditorTab.activeForeground": "#ffffff",
    "modernEditorTab.activeHoverBackground": "#505050",
    "modernEditorTab.activeHoverActionBackground": "#505050",
    "modernEditorTab.inactiveBackground": "#242424",
    "modernEditorTab.hoverBackground": "#323232",
    "modernEditorTab.hoverActionBackground": "#323232",
    "modernEditorTab.hoverForeground": "#ffffff",
    "modernEditorTab.selectedActionBackground": "#454545",
    "modernActivityBar.background": "#181818",
    "modernActivityBar.inactiveBackground": "#202020",
    "modernActivityBar.border": "#3a3a3a",
    "modernActivityBarItem.activeBackground": "#3d3d3d",
    "modernActivityBarItem.activeForeground": "#f0f0f0",
    "modernActivityBarItem.hoverBackground": "#292929",
    "modernActivityBarItem.hoverForeground": "#f0f0f0",
    "statusBar.inactiveBackground": "#202020"
  }
}
```

To try a smaller set of overrides in `settings.json`:

```json
{
  "workbench.experimental.modernUI": true,
  "window.density.layout": "default",
  "workbench.colorCustomizations": {
    "modernUI.shellBackground": "#181818",
    "modernUI.inactiveShellBackground": "#202020",
    "modernPanel.border": "#505050",
    "modernSash.gripForeground": "#cccccc66",
    "statusBar.inactiveBackground": "#202020"
  }
}
```

CSS custom properties prefixed with `--modern-ui-` are internal implementation details, not public theme APIs. Use the registered color IDs above instead.

The color registrations and canonical descriptions are defined in `src/vs/workbench/common/theme.ts`.
