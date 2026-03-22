# Forge Brand Separation Plan

## Goal

Remove remaining Microsoft-branded assets, names, service references, and distribution metadata from `Forge` in a controlled sequence, while preserving compatibility-sensitive internals unless we explicitly choose to break them.

## Principles

- Change readable and shipped branding first.
- Replace Microsoft-owned assets instead of just renaming file references.
- Keep upstream MIT n<!-- forge-cmt:0a705463:start -->otices intact for inherited code.
- Avoid changing opaque compatibility contracts unless required.
- Tackle one area at a time and validate after each pass.<!-- forge-cmt:0a705463:end -->

## Phase 1: Product Identity And Distribution Metadata

Focus on the product identity that ships with the app and package metadata.

- `product.json`
  - Replace Microsoft-hosted URLs such as issue, license, CDN, and service endpoints where possible.
  - Remove or replace Microsoft publisher metadata for built-in extensions if those extensions remain bundled.
  - Revisit `darwinBundleIdentifier` and related identifiers that still use `visualstudio`.
- `package.json`
  - Replace `author`, package identity, and any remaining `code-oss` naming that is user-visible or shipped.
- Packaging metadata
  - Review Linux, macOS, and Windows package naming for remaining Microsoft- or VS Code-branded identifiers.

## Phase 2: Visual Assets

Replace all remaining icons, logos, and named asset files that still reflect Code/VS Code branding.

- `resources/server/code-192.png`
- `resources/server/code-512.png`
- `resources/win32/code_150x150.png`
- `resources/win32/code_70x70.png`
- `resources/linux/rpm/code.xpm`
- Any other shipped `code*` app icons under `resources/`

Questions to answer during this phase:

- Do we want a temporary neutral Forge wordmark, or a final branded icon set?
- Should file names also be renamed, or only the references?

## Phase 3: Microsoft Services And Marketplace Dependencies

Remove or replace Microsoft- or VS Code-hosted services that make the build depend on Microsoft infrastructure.

- Marketplace/gallery configuration
- Sync/edit sessions/configuration sync service endpoints
- Webview/CDN endpoints
- Documentation and help links that point at `code.visualstudio.com`, `vscode.dev`, or `aka.ms/vscode-*`
- Any trusted domain lists that are Microsoft-specific

Primary review targets:

- `product.json`
- `build/vite/workbench-vite.html`
- `src/vscode-dts/vscode.d.ts`
- `src/vs/workbench/services/extensions/common/extensionsRegistry.ts`

## Phase 4: Microsoft-Bundled Features

Decide whether to keep, replace, or remove features that are still branded around Microsoft or Microsoft-owned ecosystems.

- `extensions/microsoft-authentication`
- Built-in `ms-vscode.*` extensions in `product.json`
- Default Copilot / GitHub chat agent configuration in `product.json`

For each feature, choose one:

- Keep and rebrand if legally and technically acceptable
- Replace with a Forge-owned alternative
- Remove entirely from the distribution

## Phase 5: Remaining User-Facing Copy

Sweep the repo for leftover readable references that still mention Microsoft, Visual Studio Code, or VS Code in shipped UI text.

High-value areas:

- Workbench notifications and dialogs
- Help, update, onboarding, and issue reporting flows
- Extension metadata and bundled READMEs that appear in UI surfaces
- Authentication pages and browser-facing templates

This phase should avoid broad churn in internal comments or non-shipping docs unless they still appear in the product.

## Phase 6: Policy, Enterprise, And Installer Artifacts

Clean up distribution artifacts that still expose legacy IDs or names in enterprise/admin flows.

- `build/lib/test/fixtures/policies/**`
- `build/lib/test/policyConversion.test.ts`
- Any generated plist, adml, admx, or mobileconfig content that still says `Code - OSS`, `CodeOSS`, or `com.visualstudio.code.oss`

## Phase 7: Validation And Legal Review

After each phase:

- Search for `Microsoft`, `Visual Studio Code`, `VS Code`, `code-oss`, `vscode-oss`, `CodeOSS`, and `com.visualstudio`.
- Check whether the remaining hits are:
  - legal attribution,
  - internal compatibility identifiers,
  - tests/fixtures,
  - or still-shipped branding.
- Confirm that replacement assets are actually wired into packaging and web manifests.

## Out Of Scope For Now

- Protocol markers like terminal `VSC` shell integration escape identifiers
- Broad upstream documentation cleanup
- Copyright header rewrites
- Re-licensing upstream MIT code under a more restrictive license

## Suggested Order

1. Product identity and package metadata
2. Visual assets
3. Microsoft service endpoints and marketplace dependencies
4. Microsoft-bundled features
5. Remaining user-facing strings
6. Policy and enterprise artifacts
7. Final audit
