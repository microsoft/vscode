---
name: VS Code
description: Source-derived component catalog for the standard workbench and Agents Window, with Light Modern and Dark Modern previews.
colors:
  foreground: "#3B3B3B"
  description: "#3B3B3B"
  editor: "#FFFFFF"
  chrome: "#F8F8F8"
  border: "#E5E5E5"
  focus: "#0069CC"
  button: "#0069CC"
  buttonText: "#FFFFFF"
  buttonHover: "#0063C1"
  buttonBorder: "#0069CC"
  switchTrack: "#3B3B3B5C"
  secondary: "#E5E5E5"
  secondaryText: "#3B3B3B"
  secondaryHover: "#CCCCCC"
  secondaryBorder: "#3B3B3B26"
  input: "#FFFFFF"
  inputText: "#3B3B3B"
  inputBorder: "#CECECE"
  placeholder: "#767676"
  badge: "#CCCCCC"
  badgeText: "#3B3B3B"
  link: "#005FB8"
  error: "#F85149"
  quickInput: "#F8F8F8"
  quickInputSelection: "#0069CC"
  quickInputSelectionText: "#FFFFFF"
  tab: "#F8F8F8"
  tabText: "#616161"
  tabStrip: "#F8F8F8"
  tabStripBorder: "#E5E5E5"
  tabBorder: "#E5E5E5"
  tabActive: "#FFFFFF"
  tabActiveText: "#3B3B3B"
  tabActiveTop: "#005FB8"
  tabActiveBottom: "#F8F8F8"
  tabHover: "#FFFFFF"
  activeContrast: "#00000000"
  sectionHeader: "#F8F8F8"
  sectionHeaderText: "#3B3B3B"
  sectionHeaderBorder: "#E5E5E5"
  listHover: "#F2F2F2"
  listSelection: "#E8E8E8"
  listSelectionText: "#000000"
  listSelectionInactive: "#E4E6F1"
  setiBlue: "#498BA7"
  setiYellow: "#B7B73B"
  agentsShell: "#F8F8F8"
  agentsPanel: "#FFFFFF"
typography:
  heading1: { fontFamily: '"Segoe UI", sans-serif', fontSize: 26px, fontWeight: 600 }
  heading2: { fontFamily: '"Segoe UI", sans-serif', fontSize: 18px, fontWeight: 600 }
  heading3: { fontFamily: '"Segoe UI", sans-serif', fontSize: 13px, fontWeight: 600 }
  body1: { fontFamily: '"Segoe WPC", "Segoe UI", sans-serif', fontSize: 13px, fontWeight: 400 }
  body2: { fontFamily: '"Segoe UI", sans-serif', fontSize: 11px, fontWeight: 400 }
  label1: { fontFamily: '"Segoe UI", sans-serif', fontSize: 12px, fontWeight: 400 }
  label2: { fontFamily: '"Segoe UI", sans-serif', fontSize: 11px, fontWeight: 400 }
  label3: { fontFamily: '"Segoe UI", sans-serif', fontSize: 10px, fontWeight: 400 }
  button: { fontFamily: '"Segoe UI", sans-serif', fontSize: 12px, lineHeight: 16px, fontWeight: 400 }
  code: { fontFamily: 'Consolas, "Courier New", monospace', fontSize: 14px, lineHeight: 19px, fontWeight: 400 }
spacing:
  "0": 0px
  "2": 2px
  "4": 4px
  "6": 6px
  "8": 8px
  "10": 10px
  "12": 12px
  "16": 16px
  "20": 20px
  "24": 24px
  "28": 28px
  "32": 32px
  "36": 36px
  "40": 40px
rounded:
  square: 0px
  xSmall: 2px
  control: 4px
  inner: 6px
  outer: 8px
  xLarge: 12px
  circle: 9999px
x-colophon:
  version: 1
  tokens:
    authority:
      designSource: VS Code shipping source and .github/skills/design-philosophy/SKILL.md
      owner: VS Code contributors
      port:
        authoritySource: TypeScript DOM widgets, Monaco, CSS theme variables, and Electron
        syncSource: src/vs/base/browser/ui; src/vs/platform/theme/common; src/vs/workbench; src/vs/sessions
        owner: VS Code contributors
      syncProcess: Update source-derived previews when their owning controls change. Compare identical theme, density, state, fonts, viewport, and device scale before accepting screenshot parity. Shipping code wins over this catalog.
      portOverrides: []
    brand:
      tagline: Calm, focused tools for editing and agent work.
      voice: Plain-spoken, concise, precise. Preserve existing product labels.
      antiReferences: [marketing landing pages, oversized web form controls, decorative gradients, Northlight starter styling]
    colors:
      foreground: { resource: --vscode-foreground, themes: { dark: "#CCCCCC", highContrast: "#FFFFFF" } }
      description: { resource: --vscode-descriptionForeground, themes: { dark: "#9D9D9D", highContrast: "#FFFFFFB3" } }
      editor: { resource: --vscode-editor-background, themes: { dark: "#1F1F1F", highContrast: "#000000" } }
      chrome: { resource: --vscode-sideBar-background, themes: { dark: "#181818", highContrast: "#000000" } }
      border: { resource: --vscode-sideBar-border, themes: { dark: "#2B2B2B", highContrast: "#6FC3DF" } }
      focus: { resource: --vscode-focusBorder, themes: { dark: "#3994BCB3", highContrast: "#F38518" } }
      button: { resource: --vscode-button-background, themes: { dark: "#297AA0", highContrast: "#000000" } }
      buttonText: { resource: --vscode-button-foreground, themes: { dark: "#FFFFFF", highContrast: "#FFFFFF" } }
      buttonHover: { resource: --vscode-button-hoverBackground, themes: { dark: "#2B7DA3", highContrast: "#000000" } }
      buttonBorder: { resource: --vscode-button-border, themes: { dark: "#297AA0", highContrast: "#6FC3DF" } }
      switchTrack: { resource: "color-mix(in srgb, var(--vscode-descriptionForeground) 36%, transparent)", themes: { dark: "#9D9D9D5C", highContrast: "#FFFFFF40" } }
      secondary: { resource: --vscode-button-secondaryBackground, themes: { dark: "#00000000", highContrast: "#00000000" } }
      secondaryText: { resource: --vscode-button-secondaryForeground, themes: { dark: "#CCCCCC", highContrast: "#FFFFFF" } }
      secondaryHover: { resource: --vscode-button-secondaryHoverBackground, themes: { dark: "#2B2B2B", highContrast: "#00000000" } }
      secondaryBorder: { resource: --vscode-button-secondaryBorder, themes: { dark: "#CCCCCC26", highContrast: "#6FC3DF" } }
      input: { resource: --vscode-input-background, themes: { dark: "#313131", highContrast: "#000000" } }
      inputText: { resource: --vscode-input-foreground, themes: { dark: "#CCCCCC", highContrast: "#FFFFFF" } }
      inputBorder: { resource: --vscode-input-border, themes: { dark: "#3C3C3C", highContrast: "#6FC3DF" } }
      placeholder: { resource: --vscode-input-placeholderForeground, themes: { dark: "#989898", highContrast: "#FFFFFFB3" } }
      badge: { resource: --vscode-badge-background, themes: { dark: "#616161", highContrast: "#000000" } }
      badgeText: { resource: --vscode-badge-foreground, themes: { dark: "#F8F8F8", highContrast: "#FFFFFF" } }
      link: { resource: --vscode-textLink-foreground, themes: { dark: "#4DAAFC", highContrast: "#21A6FF" } }
      error: { resource: --vscode-errorForeground, themes: { dark: "#F85149", highContrast: "#F48771" } }
      quickInput: { resource: --vscode-quickInput-background, themes: { dark: "#222222", highContrast: "#0C141F" } }
      quickInputSelection: { resource: --vscode-quickInputList-focusBackground, themes: { dark: "#297AA0", highContrast: "#00000000" } }
      quickInputSelectionText: { resource: --vscode-quickInputList-focusForeground, themes: { dark: "#FFFFFF", highContrast: "#FFFFFF" } }
      tab: { resource: --vscode-tab-inactiveBackground, themes: { dark: "#181818", highContrast: "#00000000" } }
      tabText: { resource: --vscode-tab-inactiveForeground, themes: { dark: "#9D9D9D", highContrast: "#FFFFFF" } }
      tabStrip: { resource: --vscode-editorGroupHeader-tabsBackground, themes: { dark: "#181818", highContrast: "#000000" } }
      tabStripBorder: { resource: --vscode-editorGroupHeader-tabsBorder, themes: { dark: "#2B2B2B", highContrast: "#6FC3DF" } }
      tabBorder: { resource: --vscode-tab-border, themes: { dark: "#2B2B2B", highContrast: "#6FC3DF" } }
      tabActive: { resource: --vscode-tab-activeBackground, themes: { dark: "#1F1F1F", highContrast: "#000000" } }
      tabActiveText: { resource: --vscode-tab-activeForeground, themes: { dark: "#FFFFFF", highContrast: "#FFFFFF" } }
      tabActiveTop: { resource: --vscode-tab-activeBorderTop, themes: { dark: "#0078D4", highContrast: "#00000000" } }
      tabActiveBottom: { resource: --vscode-tab-activeBorder, themes: { dark: "#1F1F1F", highContrast: "#00000000" } }
      tabHover: { resource: --vscode-tab-hoverBackground, themes: { dark: "#1F1F1F", highContrast: "#00000000" } }
      activeContrast: { resource: --vscode-contrastActiveBorder, themes: { dark: "#00000000", highContrast: "#F38518" } }
      sectionHeader: { resource: --vscode-sideBarSectionHeader-background, themes: { dark: "#181818", highContrast: "#00000000" } }
      sectionHeaderText: { resource: --vscode-sideBarSectionHeader-foreground, themes: { dark: "#CCCCCC", highContrast: "#FFFFFF" } }
      sectionHeaderBorder: { resource: --vscode-sideBarSectionHeader-border, themes: { dark: "#2B2B2B", highContrast: "#6FC3DF" } }
      listHover: { resource: --vscode-list-hoverBackground, themes: { dark: "#2A2D2E", highContrast: "#FFFFFF1A" } }
      listSelection: { resource: --vscode-list-activeSelectionBackground, themes: { dark: "#04395E", highContrast: "#00000000" } }
      listSelectionText: { resource: --vscode-list-activeSelectionForeground, themes: { dark: "#FFFFFF", highContrast: "#FFFFFF" } }
      listSelectionInactive: { resource: --vscode-list-inactiveSelectionBackground, themes: { dark: "#37373D", highContrast: "#00000000" } }
      setiBlue: { resource: "extensions/theme-seti/icons/vs-seti-icon-theme.json#/iconDefinitions/_typescript/fontColor", themes: { dark: "#519ABA", highContrast: "#519ABA" } }
      setiYellow: { resource: "extensions/theme-seti/icons/vs-seti-icon-theme.json#/iconDefinitions/_json/fontColor", themes: { dark: "#CBCB41", highContrast: "#CBCB41" } }
      agentsShell: { resource: --vscode-agents-background, themes: { dark: "#1F1F1F", highContrast: "#000000" } }
      agentsPanel: { resource: --vscode-agentsPanel-background, themes: { dark: "#181818", highContrast: "#000000" } }
    typography:
      scale:
        heading1: { role: display }
        heading2: { role: display }
        code: { role: mono }
    principles:
      - "Calm: quiet at rest, present on intent; preserve visible keyboard focus."
      - "Focused: one thing leads; the editor or conversation leads, chrome supports."
      - "Consistent: reuse named theme resources, spacing ramps, and elevation tiers."
      - "Delightful: motion must guide, confirm, or orient; honor reduced motion."
    pages:
      - id: components
        name: Components
        components: [Typography, Separator, CountBadge, KeybindingLabel]
      - id: controls
        name: Shared controls
        description: Editable fields, native selectors, local toggles, and dismissible flyouts. These are previews, not command implementations.
        components: [ButtonPreview, SecondaryButtonPreview, DisabledButtonPreview, TextInputPreview, SearchFieldPreview, Checkbox, ToggleSwitch, SelectBox, Picker, PickerOptions, Toolbar, FindWidget]
      - id: workbench
        name: Standard workbench
        description: Individual source-informed workbench components. Full-window previews are currently omitted.
        components: [CommandCenter, CommandPalette, EditorTabs, ExplorerRow, Explorer, StatusBar]
      - id: agents
        name: Agents Window
        description: Individual session, conversation, composer, and details components. Full-window previews are currently omitted.
        components: [SessionRow, SessionsSidebar, Composer, Conversation, ChangesPanel]
---

# VS Code design system

## Overview

This catalog describes the existing desktop UI, not a new identity. It is intended for contributors decomposing VS Code into foundations, reusable controls, and composed window surfaces. The standard workbench and Agents Window share lower-level widgets but have different layout ownership. Production TypeScript, CSS, theme registrations, accessibility behavior, and configuration remain canonical.

The optional **Colophon** canvas can edit and preview this system. Install it with `copilot plugin install karkarl/colophon`; see https://github.com/karkarl/colophon. Direct file editing works without the plugin. The canvas Light, Dark, and High contrast modes represent Light Modern, Dark Modern, and Dark High Contrast respectively. High-contrast swatches follow [hc_black.json](extensions/theme-defaults/themes/hc_black.json) and the registered `hcDark` color defaults; they do not establish product screenshot parity.

## Colors

Preview values come from [Light Modern](extensions/theme-defaults/themes/light_modern.json), [Dark Modern](extensions/theme-defaults/themes/dark_modern.json), and [Agents color aliases](src/vs/workbench/common/agentsColors.ts). Each swatch maps to its actual `--vscode-*` resource. Bind resources in shipping code, not catalog hex values. Do not confuse syntax-highlighting colors with interface roles. A shared preview neutral is not permission to replace a component-specific production token.

The Colophon canvas and control-preview backdrops follow the selected theme's `editor` token, mapped to `--vscode-editor-background`. Controls retain their own semantic backgrounds, such as `--vscode-button-background` and `--vscode-input-background`; switching themes updates those values as well. Primary-action swatches use the 2026 light/dark themes, matching the palette-selection accent already represented here. The canvas Export action binds to the primary-button resource, not the separate focus-indicator resource. Canvas role aliases are presentation-only and do not rename or duplicate the repository's tokens.

Secondary buttons use `--vscode-button-secondaryBorder`, not the primary-button border. Their resting stroke is neutral in light/dark themes; keyboard focus retains the separate focus indicator, and high contrast retains its contrast border. Focus swatches follow the 2026 light/dark `focusBorder` values, including the translucent dark stroke. Text inputs, search fields, and the command palette share a single inset focus stroke for pointer and keyboard focus.

## Typography

The [registered size ramp](src/vs/platform/theme/common/sizes/baseSizes.ts) defines heading1/2/3, body1/2, label1/2/3, and regular/semiBold weights. The Windows workbench body uses `"Segoe WPC", "Segoe UI", sans-serif`, following [style.css](src/vs/workbench/browser/media/style.css). Other platforms use the product's own platform font selection. Explorer section headers preserve the classic product exception of 11px bold; file rows and editor tabs use 13px regular. The button's 12px/16px treatment follows [button.css](src/vs/base/browser/ui/button/button.css). The code sample is a plain-text structural placeholder, not a Monaco implementation or syntax-color baseline.

## Layout

Use the registered 0–40px spacing ramp for rhythm. Structural dimensions belong to the owning component and are not spacing tokens. The catalog's fixed example window dimensions and sample pane allocations are demonstration bounds, not asserted product defaults.

On the Shared controls gallery page, `*Preview` wrappers cap standalone buttons at 240px and text/search inputs at 400px, while allowing them to shrink with the available space. These caps are Colophon presentation constraints only: do not port them into production code, design tokens, shared control definitions, or composed window layouts.

The standard workbench composes a title bar, Activity Bar, side bar, editor groups, optional panel and auxiliary bar, and Status Bar. The [Agents Window topology](src/vs/sessions/LAYOUT.md) has its own title bar, sessions sidebar, Sessions Part, editor/details side pane, optional panel, and Session Activity Bar. It deliberately omits the standard Activity Bar and Status Bar. Do not infer one window's topology from the other.

Full-window workbench and Agents Window previews are currently omitted from the catalog. Their individual components remain available; production layouts are unchanged.

## Elevation & Depth

Controls use the 4px tier, inner containers 6px, overlays 8px, and pills the fully round tier. Preserve explicit product exceptions: many classic workbench surfaces are square. Ordinary strokes are 1px; semantic focus outlines are separate. Agents floating-panel spacing is 4px in [agentsSizes.ts](src/vs/workbench/common/agentsSizes.ts), and [workbench.css](src/vs/sessions/browser/media/workbench.css) owns the card and compact-mode treatments. The catalog does not reproduce shell gradients or all density/configuration variants.

## Shapes

Use the registered radii and Codicon base/compact sizes, with actual product glyphs when implementing production UI. Explorer uses the actual down-chevron SVG, rotated for collapsed folders, and editor tabs use the actual close SVG. These unmodified vectors come from [Microsoft Codicons](https://github.com/microsoft/vscode-codicons), package `@vscode/codicons` version `0.0.46-49`, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The verified package SHA-1 is `326aa0b1f3f8a47f2f42973803b19ca74e7a825e`.

File icons embed the checked-in [Seti WOFF](extensions/theme-seti/icons/seti.woff) verbatim in `WorkbenchPreviewStyles`, so the gallery works offline without an asset server. SHA-256: `b127762058f89b37b08d76185e3b0558f5c28859e39a3840a27cb28b9739d6e2`. Glyphs and light/dark colors follow [vs-seti-icon-theme.json](extensions/theme-seti/icons/vs-seti-icon-theme.json), including the filename-specific info glyph for `README.md`. Seti UI is copyright (c) 2014 Jesse Weed, under the MIT license reproduced in [ThirdPartyNotices.txt](extensions/theme-seti/ThirdPartyNotices.txt). Retain those notices with copies. `setiBlue` and `setiYellow` are file-icon-theme colors, not invented `--vscode-*` resources. Native browser checkbox and select rendering remains platform-dependent, not a pixel match to custom product widgets.

## Components

The framework-agnostic [component registry](.agents/design/components.jsonc) composes foundations into controls and individual workbench and Agents Window surfaces. Component notes point to owning source files and identify approximations. Gallery pages separate these levels without duplicating definitions. Inspect mode is for editing; leave Inspect to exercise interactions.

Text fields and the composer accept input. The composer input container uses a one-stroke `focusBorder` when its textarea or toolbar has focus, matching the palette's blue focus treatment without a second outline around the textarea. Its Agent picker and toolbar buttons are borderless at rest, with visible keyboard focus. The supplied reference's context chip, add-context, Agent, Models, compact microphone/voice, send-arrow, interaction, permissions, and connection controls are represented by native buttons and dismissible local flyouts. Choice flyouts do not update trigger labels or application settings. Send preserves the draft and explains that nothing was sent; voice controls do not request microphone access, record, or play audio, and the sample context chip never reads a file. The transient onboarding notification in the reference is not part of this composer pattern. Composer glyphs use the same pinned Microsoft Codicons package and attribution described above, including the native compact vectors. Operating-system forced colors retain an explicit focus border. Checkboxes/selects use native browser behavior; the switch has instance-local boolean state and keyboard activation. Explorer sections and folders use native keyboard-operable disclosures with dense 22px rows and no browser-default markers. All `vscode-catalog-*` styles are preview-only and must not be copied into production.

Editor tabs follow the connected modern treatment in [tabs.css](src/vs/workbench/contrib/modernUI/browser/media/tabs.css) and [connectedEditorTabs.css](src/vs/workbench/contrib/modernUI/browser/media/connectedEditorTabs.css): a 32px strip, rounded outlined active cap and curved shoulders joining the editor, rather than a blue top stripe or boxed inactive tabs. The JSON/JavaScript sample uses bundled Seti glyphs; only the preview file's label is italic. Native radio selection preserves pointer and arrow-key interaction with visible keyboard/high-contrast outlines. Decorative close glyphs do not pretend to close real editors. Wrapping, pinned tabs, drag/reorder, and real editor navigation remain outside this preview.

`ExplorerRow` is independently available in the gallery and reused for Explorer folders. Its chevron expands the sample child; selecting its text selects the row. Folder and file rows share one native radio group per preview, with arrow-key selection, persistent selected styling, and visible keyboard focus. `SessionRow` uses the same selection treatment; `SessionsSidebar` groups its rows exclusively and lets Today collapse or expand. The sidebar search remains an editable, non-filtering example. Row selection does not open files, load sessions, or change the static conversation.

Explorer folder chevrons rotate within a square icon box; trailing spacing stays outside that box so expanded and collapsed glyphs remain centered. `ChangesPanel` reuses the shared selection treatment through `ChangedFileRow`, with mutually exclusive file selection by pointer or arrow keys and visible keyboard focus. Selecting a sample file does not open a diff or modify repository files.

Pickers and command-center buttons open dismissible component flyouts; Escape restores trigger focus. Radio picker options select and dismiss but do not update a trigger's label. `CommandPalette` uses reusable `CommandRow` results with exclusive pointer/arrow-key selection. Its input has a themed focus outline, and selected results use the dedicated `quickInputList.focusBackground`/`focusForeground` resources rather than generic list selection. The blue palette-selection preview swatches follow [2026-light.json](extensions/theme-defaults/themes/2026-light.json) and [2026-dark.json](extensions/theme-defaults/themes/2026-dark.json), matching the supplied reference treatment without changing other lists; high contrast retains transparent selection with an explicit outline. Choosing a command in the flyout dismisses it and restores trigger focus. Its editable query does not filter the sample commands. Button hover, press, disabled, and keyboard focus states are live. These previews do not execute commands, send prompts, run agents, filter results, navigate files, emulate Monaco, resize parts, or persist user data. Inert composed content is explicitly noted rather than dressed up as working product behavior.

## Do's and Don'ts

- Read the [design philosophy](.github/skills/design-philosophy/SKILL.md) and owning control before changing a preview. Start with the value and principle, then choose the token.
- Preserve accessible names, native input semantics, visible focus, disabled behavior, and keyboard alternatives. Do not mislabel a static group as a fully functional tree, tablist, or menu.
- Preserve theme, density, platform, zoom, state, and feature gates when comparing surfaces. Shared design documentation does not authorize exposing disabled AI features.
- Keep generic `ds-*` starter classes out of source-derived components: they impose unrelated padding, type, and surface styles.
- Do not use this catalog as shipping code or a claim of exhaustive coverage. Provider-specific views, native dialogs, notebook/webview content, mobile layouts, terminal rendering, and full editor behavior remain outside this initial seed.

## Visual verification

Pixel parity is **not established**. A scan, schema validation, matching token values, or a screenshot of the catalog alone cannot establish a 1:1 product match. Capture production and preview at identical viewport, device scale, Windows font rendering, theme, density, configuration, content, and interaction state. Compare aligned component crops without resizing; retain the reference, preview, diff image, and differing-pixel count. Repeat for both windows and both requested themes, including keyboard focus and the interactive states represented here.

This checkout initially had no dependencies, compiled output, or Electron runtime. Dependency restoration with the pinned pnpm version and Node 24.22.1 stopped at the repository prerequisite check because the Windows C/C++ compiler toolchain is unavailable. Do not bypass that check or present an installed release or another checkout as a reference for this source revision. Until the matching product can run, the composed screens remain source-informed studies and product screenshot comparison remains incomplete.
