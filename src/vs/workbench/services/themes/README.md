# Semantic size customizations

`workbench.sizeCustomizations` customizes panel corners and the space between panels in the editor and Agents windows, independently of the selected color theme. Corner radii are integers from 0 through 8 pixels; inter-panel spacing is an integer from 0 through 16 pixels, defaulting to 4.

```json
{
	"workbench.sizeCustomizations": {
		"panels.cornerRadius": 4,
		"panels.spacing": 8,
		"primarySideBar.cornerRadius": 2,
		"toolsPanel.cornerRadius": 0,
		"agentsWindow.panels.cornerRadius": 2,
		"agentsWindow.panels.spacing": 6,
		"agentsWindow.toolsPanel.cornerRadius": 0
	}
}
```

## Resolution layers

1. **Primitives** define the built-in scale, such as `cornerRadius.large`. They are not user-customizable.
2. **Shared defaults** establish a common panel appearance with `panels.cornerRadius` and `agentsWindow.panels.cornerRadius`.
3. **Named areas** inherit a shared default and can be overridden independently.

## Names and visible areas

| Name | What it changes | Inherits from |
| --- | --- | --- |
| `panels.cornerRadius` | A shared value for all panel areas; not controls, pop-ups, or the app window itself | Built-in large radius (8px) |
| `toolsPanel.cornerRadius` | The panel containing Terminal, Output, Problems, and Debug Console, including when moved to a side | `panels.cornerRadius` |
| `primarySideBar.cornerRadius` | The editor window's Primary Side Bar, where Explorer, Search, and Source Control normally appear | `panels.cornerRadius` |
| `secondarySideBar.cornerRadius` | The Secondary Side Bar, often Chat in the editor window or Files and Changes in the Agents window | `panels.cornerRadius` |
| `editorArea.cornerRadius` | The file editor area, including its tab strip, but not individual tab shapes | `panels.cornerRadius` |
| `activityBar.cornerRadius` | The Activity Bar containing the Explorer, Search, and Source Control icons, but not individual buttons | `primarySideBar.cornerRadius` |
| `agentsWindow.panels.cornerRadius` | A shared corner radius for Agents window areas only, including pages such as Automations | `panels.cornerRadius` |
| `agentsWindow.toolsPanel.cornerRadius` | The Agents window's Terminal, Output, Problems, and Debug Console panel | `agentsWindow.panels.cornerRadius` |
| `agentsWindow.editorArea.cornerRadius` | The Agents window's file editor area | `agentsWindow.panels.cornerRadius` |
| `agentsWindow.secondarySideBar.cornerRadius` | Files, Changes, and other side views in the Agents window | `agentsWindow.panels.cornerRadius` |
| `agentsWindow.chatPanels.cornerRadius` | Outer panel frames containing conversations in the Agents window—not individual messages, message bubbles, or the chat input | `agentsWindow.panels.cornerRadius` |
| `panels.spacing` | Space between Modern UI editor panel areas; also the default for Agents panel spacing | Built-in spacing scale (4px) |
| `agentsWindow.panels.spacing` | Space between Agents panel areas and between split chats | `panels.spacing` |

The unprefixed `toolsPanel`, `editorArea`, and `secondarySideBar` corner tokens apply to the editor window; their `agentsWindow` counterparts customize the Agents window independently. For Chat in an editor-window side bar, customize that side bar rather than `agentsWindow.chatPanels.cornerRadius`. Names identify areas, not their current screen positions: moving the tools panel or swapping side bars does not change which name applies.

The initial inheritance graph is:

```text
cornerRadius.large
└── panels.cornerRadius
    ├── toolsPanel.cornerRadius
    ├── primarySideBar.cornerRadius
    │   └── activityBar.cornerRadius
    ├── secondarySideBar.cornerRadius
    ├── editorArea.cornerRadius
    └── agentsWindow.panels.cornerRadius
        ├── agentsWindow.toolsPanel.cornerRadius
        ├── agentsWindow.editorArea.cornerRadius
        ├── agentsWindow.secondarySideBar.cornerRadius
        └── agentsWindow.chatPanels.cornerRadius
```

An individual area's value wins over a shared default. Removing an override restores inheritance, including any current ancestor customization. For example, setting `panels.cornerRadius` to 4 and `toolsPanel.cornerRadius` to 0 gives panel areas 4px corners except for the square tools panel.

## Consumers and constraints

The size registry owns token definitions, references, and the customization schema. The workbench size service validates settings and resolves values for both programmatic consumers and the generated workbench and webview CSS variables. Unknown tokens, internal primitives, out-of-range values, fractions, and non-numeric values are rejected with warnings; valid entries in the same object still apply.

Workbench stylesheets propagate to auxiliary windows through the existing shared stylesheet mechanism. Notebook and webview clipping refreshes after those cloned styles arrive, without requiring a resize. Webviews receive resolved size variables and refresh their cached theme data when sizes change. The startup splash saves each visible workbench part's resolved radius and the inter-panel spacing.

Main and detached Agents windows use the resolved inter-panel spacing beside the Activity Bar strip, while keeping their exterior gutters fixed. Detached connected-tab cards limit their reserved frame insets to the available gap, including 0px and 1px gaps. The detached strip uses the same effective frame inset so it remains inside its column and preserves the visible gap. Their chat, editor, and terminal cards follow the corresponding Agents corner tokens. Notebook overlays clip only exposed outer editor corners, inside the frame border; tab and split-editor seams stay square, and modal notebook editors keep their existing appearance. Native browser canvases follow their component editor's inner frame radius and refresh their native layout when sizes change.

Spacing uses the same resolved numeric value in CSS, panel content calculations, session grids, and sash positioning. Changes reapply content layout even when the grid allocations are unchanged. Window-edge gutters retain their default size; compact and phone layouts remain gapless. Pane-internal bottom padding remains density-dependent and does not grow with inter-panel spacing. Agents inset frames reserve no more space than the gap permits.

Resize sashes and hover lines keep their configured thickness. Three-dot grippers retain their dot size and spacing when panel gaps change. Dividers are centered within their own gap, and their ends extend or retract along the divider to meet adjoining gap midpoints at T-junctions. Panel alignment and position changes refresh endpoints immediately, without waiting for a window resize. This applies to top-level and split-chat dividers, including odd-pixel gaps. Compact layouts remove gap-specific endpoint and centering adjustments.

Component geometry remains authoritative: joined edges, inset frame radii, mobile presentation, and native window corners retain their existing rules. Size customization does not inject arbitrary CSS or add blanket content-clipping rules. Controls, pop-ups, tabs, list rows, the chat composer, hit areas, padding, keyboard behavior, focus indicators, typography, and stroke widths retain their built-in appearance and behavior.

Extension-contributed size themes and other layout-affecting dimensions are not part of this implementation. A layout-affecting token must have a common numeric source of truth for CSS and layout calculations before it can be exposed.
