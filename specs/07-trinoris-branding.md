# 07 — Trinoris Code OSS branding

## Decision

Use the Trinoris platform app icon from `../trinoris-control-tower/webapp/icon-app.png` as the Code OSS application icon and the custom workbench title-bar icon. Preserve the supplied artwork and transparency when generating platform-specific variants. This is a product branding decision; do not restore the upstream VS Code icon during later build-profile or feature-flag work.

## Assets

The source image is 705×705 RGBA PNG. Current generated/replaced assets:

| Surface | Asset | Format / dimensions |
| --- | --- | --- |
| Linux application and package icon | `resources/linux/code.png` | PNG, source size |
| macOS application and disk image icon | `resources/darwin/code.icns` | ICNS, multi-resolution |
| Windows application icon | `resources/win32/code.ico` | ICO, 16–256 px entries |
| Windows tile | `resources/win32/code_70x70.png` | PNG, 70×70 |
| Windows tile | `resources/win32/code_150x150.png` | PNG, 150×150 |
| Linux RPM package icon | `resources/linux/rpm/code.xpm` | XPM, 512×512 palette image |
| Server branding icons | `resources/server/code-192.png`, `resources/server/code-512.png` | PNG, 192×192 and 512×512 |
| Server favicon | `resources/server/favicon.ico` | ICO, 16–64 px entries |
| Shared workbench branding | `src/vs/workbench/browser/media/trinoris-icon.png` | PNG, 128×128 |

The title bar CSS in `src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css` references the shared Trinoris image for `.window-appicon`. The Welcome page Getting Started file icon in `src/vs/workbench/contrib/welcomeGettingStarted/browser/media/gettingStarted.css` and the sign-in brand mark in `src/vs/workbench/contrib/welcomeOnboarding/browser/media/variationA.css` use the same image. It is separate from the OS-level app icon. The custom title-bar app icon is shown on Windows and Linux when the native title bar is disabled; macOS uses the native title bar and does not render this element.

## Maintenance

- If the source artwork changes, regenerate every listed derived asset from the agreed source image in one change.
- Keep the Windows tile dimensions and server icon dimensions exact because packaging manifests refer to them.
- Preserve alpha in PNG/ICO/ICNS outputs; XPM has limited transparency and uses its transparent palette entry.
- Verify file formats and dimensions after regeneration. A development Electron `npm run watch` refreshes workbench CSS/assets; restart or reload the window to observe the title-bar and Welcome page branding. OS package icons require the relevant platform packaging build to validate.
- Current Linux packaging was attempted but not completed because the environment denied a temporary IPC pipe during Copilot's postinstall; this was not an icon-format error.
