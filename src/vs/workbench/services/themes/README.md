# Semantic size customizations

`workbench.sizeCustomizations` customizes panel, control, and pop-up corners and the space between panels in the editor and Agents windows, independently of the selected color theme. Corner radii are integers from 0 through 8 pixels; inter-panel spacing is an integer from 0 through 16 pixels, defaulting to 4.

```json
{
	"workbench.sizeCustomizations": {
		"panels.cornerRadius": 4,
		"panels.spacing": 8,
		"primarySideBar.cornerRadius": 2,
		"toolsPanel.cornerRadius": 0,
		"agentsWindow.panels.cornerRadius": 2,
		"agentsWindow.panels.spacing": 6,
		"agentsWindow.toolsPanel.cornerRadius": 0,
		"controls.cornerRadius": 3,
		"buttons.cornerRadius": 2,
		"popups.cornerRadius": 6,
		"menus.cornerRadius": 0
	}
}
```

## Resolution layers

1. **Primitives** define the built-in scale, such as `cornerRadius.large`. They are not user-customizable.
2. **Shared defaults** establish a common appearance with `default.cornerRadius` and `panels.cornerRadius`.
3. **Named areas** inherit a shared default and can be overridden independently.

## Names and visible areas

| Name | What it changes | Inherits from |
| --- | --- | --- |
| `default.cornerRadius` | The default corner radius for panel areas; not the app window itself | Built-in radius scale |
| `panels.cornerRadius` | A shared value for all the areas below | `default.cornerRadius` |
| `toolsPanel.cornerRadius` | The panel containing Terminal, Output, Problems, and Debug Console, including when moved to a side | `panels.cornerRadius` |
| `primarySideBar.cornerRadius` | The editor window's Primary Side Bar, where Explorer, Search, and Source Control normally appear | `panels.cornerRadius` |
| `secondarySideBar.cornerRadius` | The Secondary Side Bar, often Chat in the editor window or Files and Changes in the Agents window | `panels.cornerRadius` |
| `editorArea.cornerRadius` | The file editor area, including its tab strip, but not individual tab shapes | `panels.cornerRadius` |
| `activityBar.cornerRadius` | The Activity Bar containing the Explorer, Search, and Source Control icons, but not individual buttons | `primarySideBar.cornerRadius` |
| `agentsWindow.panels.cornerRadius` | A shared corner radius for Agents window areas only | `panels.cornerRadius` |
| `agentsWindow.toolsPanel.cornerRadius` | The Agents window's Terminal, Output, Problems, and Debug Console panel | `agentsWindow.panels.cornerRadius` |
| `agentsWindow.editorArea.cornerRadius` | The Agents window's file editor area | `agentsWindow.panels.cornerRadius` |
| `agentsWindow.secondarySideBar.cornerRadius` | Files, Changes, and other side views in the Agents window | `agentsWindow.panels.cornerRadius` |
| `agentsWindow.chatPanels.cornerRadius` | Outer panel frames containing conversations in the Agents window—not individual messages, message bubbles, or the chat input | `agentsWindow.panels.cornerRadius` |
| `pages.cornerRadius` | Pages such as Automations that open in place of chats in the Agents window | `agentsWindow.panels.cornerRadius` |
| `panels.spacing` | Space between Modern UI editor panel areas; also the default for Agents panel spacing | Built-in spacing scale (4px) |
| `agentsWindow.panels.spacing` | Space between Agents panel areas and between split chats | `panels.spacing` |
| `controls.cornerRadius` | Standard buttons, toolbar/icon actions, inputs, selects, checkboxes, find toggles, radio groups, and segmented controls in both windows | Built-in small radius (4px) |
| `buttons.cornerRadius` | Standard text, toolbar/icon, and split buttons; joined edges remain square | `controls.cornerRadius` |
| `inputs.cornerRadius` | Standard text inputs, find inputs, browser address inputs, and select controls; not the chat composer | `controls.cornerRadius` |
| `popups.cornerRadius` | Custom menus, hovers, dialogs, Command Palette, and Modern UI editor pop-ups in both windows | Built-in large radius (8px) |
| `menus.cornerRadius` | Custom context menus, action pickers, and select-option pop-ups, including background and clipping layers | `popups.cornerRadius` |
| `hovers.cornerRadius` | Editor hovers and workbench tooltips | `popups.cornerRadius` |
| `dialogs.cornerRadius` | Custom in-app dialogs; not native operating system dialogs | `popups.cornerRadius` |

The unprefixed `toolsPanel`, `editorArea`, and `secondarySideBar` corner tokens apply to the editor window; their `agentsWindow` counterparts customize the Agents window independently. For Chat in an editor-window side bar, customize that side bar rather than `agentsWindow.chatPanels.cornerRadius`. Names identify areas, not their current screen positions: moving the tools panel or swapping side bars does not change which name applies.

The initial inheritance graph is:

```text
cornerRadius.large
└── default.cornerRadius
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
            ├── agentsWindow.chatPanels.cornerRadius
            └── pages.cornerRadius
```

An individual area's value wins over a shared default. Removing an override restores inheritance, including any current ancestor customization. For example, setting `panels.cornerRadius` to 4 and `toolsPanel.cornerRadius` to 0 gives panel areas 4px corners except for the square tools panel.

## Control and pop-up families

Controls and pop-ups are independent of panel corners and of `default.cornerRadius`. Their shared family values apply to editor and Agents windows alike, including classic editor windows where the standard widget is used.

```text
cornerRadius.small                  cornerRadius.large
└── controls.cornerRadius           └── popups.cornerRadius
    ├── buttons.cornerRadius           ├── menus.cornerRadius
    └── inputs.cornerRadius            ├── hovers.cornerRadius
                                      └── dialogs.cornerRadius
```

Without a valid customization, widgets keep their current host-specific appearance, such as the Agents window's default dialog radius. Setting a family or leaf explicitly applies the resolved numeric radius; removing it restores the original appearance. Checkbox, toggle, icon-selector, and radio/segmented-control corners follow `controls.cornerRadius`; they are independent of the button and input leaf overrides. Segmented backgrounds and selection indicators follow the same radius, while connected segments retain flat internal seams.

The shared controls and their feature-specific overrides are wired together, including extension installation buttons, Settings checkboxes, Command Palette filters, chat toolbars, and Agents changes/create-pull-request/run-script controls. Input backgrounds and split-button focus outlines track the same corners as their containing controls. The Command Palette follows `popups.cornerRadius` rather than the menus override. Native menus and dialogs, notifications, tabs, list rows, circular or pill-shaped controls (including switches and send buttons), and the chat composer are not restyled.

## Consumers and constraints

The size registry owns token definitions, references, and the customization schema. The workbench size service validates settings and resolves values for both programmatic consumers and the generated workbench and webview CSS variables. Unknown tokens, internal primitives, out-of-range values, fractions, and non-numeric values are rejected with warnings; valid entries in the same object still apply.

Workbench stylesheets propagate to auxiliary windows through the existing shared stylesheet mechanism. Webviews receive resolved size variables and refresh their cached theme data when sizes change. The startup splash saves each visible workbench part's resolved radius and the inter-panel spacing.

Spacing uses the same resolved numeric value in CSS, panel content calculations, session grids, and sash positioning. Changes reapply content layout even when the grid allocations are unchanged. Window-edge gutters retain their default size; compact and phone layouts remain gapless. Agents inset frames reserve no more space than the gap permits.

Resize sashes and hover lines keep their configured thickness. Dividers are centered within their own gap, and their ends extend or retract along the divider to meet adjoining gap midpoints at T-junctions. This applies to top-level and split-chat dividers, including odd-pixel gaps. Compact layouts remove gap-specific endpoint and centering adjustments.

Component geometry remains authoritative: joined edges, inset frame radii, mobile presentation, and native window corners retain their existing rules. Size customization does not inject arbitrary CSS or add blanket content-clipping rules. Widget corner overrides leave hit areas, padding, keyboard behavior, focus indicators, typography, and stroke widths unchanged.

Extension-contributed size themes and other layout-affecting dimensions are not part of this implementation. A layout-affecting token must have a common numeric source of truth for CSS and layout calculations before it can be exposed.
