import * as vscode from 'vscode';
import {
  DEVICES, IPHONES, ANDROID_PHONES, IPADS, LAPTOPS,
  getDevice, getDeviceOS, isModernIphone,
  ALL_PRESETS, DEFAULT_PREVIEW_CONFIG,
  type DeviceProfile, type PreviewConfig, type PreviewMode,
  type BrowserChromeType, type ChromeTheme, type IPhoneScreenType,
  type OsFrameType,
} from './devices';
import { PreviewProxy } from './previewProxy';
import { buildBrowserChromeHtml } from './chromeBuilders';
import { buildOsFrameHtml, buildTaskbarHtml } from './osFrameBuilders';

export class PreviewPanel {
  private static instance: PreviewPanel | undefined;
  private static creating: Promise<PreviewPanel> | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private currentUrl: string | null = null;
  private config: PreviewConfig;
  private proxy: PreviewProxy;
  private pageBackgroundColor: string = '';
  private detectedBottomNav = false;

  private readonly _onScreenshot = new vscode.EventEmitter<void>();
  readonly onScreenshot = this._onScreenshot.event;

  private readonly _onOpenClipEditor = new vscode.EventEmitter<void>();
  readonly onOpenClipEditor = this._onOpenClipEditor.event;

  private readonly _onManualUrl = new vscode.EventEmitter<string>();
  readonly onManualUrl = this._onManualUrl.event;

  private readonly _onDispose = new vscode.EventEmitter<void>();
  readonly onDispose = this._onDispose.event;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    proxy: PreviewProxy,
  ) {
    this.panel = panel;
    this.proxy = proxy;

    // Restore config state
    const savedConfig = context.workspaceState.get<Partial<PreviewConfig>>('previewConfig');
    this.config = { ...DEFAULT_PREVIEW_CONFIG, ...savedConfig };
    this.currentUrl = context.workspaceState.get<string>('previewUrl') ?? null;

    // Proxy is already started — set target if we have a saved URL
    if (this.currentUrl) {
      this.proxy.setTarget(this.currentUrl);
    }

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.updateContent();
  }

  /**
   * Create or reveal the preview panel.
   * The proxy is started FIRST so its port can be included in portMapping —
   * VS Code webviews can only access localhost ports that are explicitly mapped.
   */
  static async createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): Promise<PreviewPanel> {
    if (PreviewPanel.instance) {
      PreviewPanel.instance.panel.reveal(vscode.ViewColumn.One);
      return PreviewPanel.instance;
    }

    // Guard against concurrent calls (e.g., command + auto-open racing)
    if (PreviewPanel.creating) {
      return PreviewPanel.creating;
    }

    PreviewPanel.creating = (async () => {
      // Start proxy BEFORE creating webview so we know the port
      const proxy = new PreviewProxy();
      let proxyPort: number;
      try {
        proxyPort = await proxy.start();
      } catch (err) {
        PreviewPanel.creating = undefined; // allow retry
        vscode.window.showErrorMessage(`Preview proxy failed to start: ${err}`);
        throw err;
      }

      const panel = vscode.window.createWebviewPanel(
        'autothropic.preview',
        'Live Preview',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [extensionUri],
          portMapping: [
            // The proxy port — MUST be mapped or the webview iframe can't reach it
            { webviewPort: proxyPort, extensionHostPort: proxyPort },
            // Common dev server ports (for any direct references in embedded content)
            { webviewPort: 3000, extensionHostPort: 3000 },
            { webviewPort: 3333, extensionHostPort: 3333 },
            { webviewPort: 4200, extensionHostPort: 4200 },
            { webviewPort: 5173, extensionHostPort: 5173 },
            { webviewPort: 5174, extensionHostPort: 5174 },
            { webviewPort: 8000, extensionHostPort: 8000 },
            { webviewPort: 8080, extensionHostPort: 8080 },
            { webviewPort: 8888, extensionHostPort: 8888 },
          ],
        },
      );

      panel.iconPath = {
        light: vscode.Uri.joinPath(extensionUri, 'media', 'preview-icon-light.svg'),
        dark: vscode.Uri.joinPath(extensionUri, 'media', 'preview-icon-dark.svg'),
      };
      PreviewPanel.instance = new PreviewPanel(panel, extensionUri, context, proxy);
      PreviewPanel.creating = undefined;

      return PreviewPanel.instance;
    })();

    return PreviewPanel.creating;
  }

  static getInstance(): PreviewPanel | undefined {
    return PreviewPanel.instance;
  }

  getCurrentUrl(): string | null {
    return this.currentUrl;
  }

  getProxyPort(): number {
    return this.proxy.getPort();
  }

  setUrl(url: string): void {
    this.currentUrl = url;
    this.context.workspaceState.update('previewUrl', url);
    this.proxy.setTarget(url);
    // Proxy is already started — send URL immediately
    this.panel.webview.postMessage({ type: 'setUrl', url: this.proxy.getLocalUrl(), displayUrl: url });
    // Safe area spacer is transparent; colored when bottom nav detected
  }

  refresh(): void {
    if (this.currentUrl) {
      this.panel.webview.postMessage({ type: 'refresh' });
    }
  }

  getDevice(): DeviceProfile {
    const device = getDevice(this.config.deviceId);
    return this.config.orientation === 'landscape'
      ? { ...device, width: device.height, height: device.width }
      : device;
  }

  getCurrentDeviceInfo(): { width: number; height: number; dpr: number } {
    const device = this.getDevice();
    return {
      width: device.width,
      height: device.height,
      dpr: device.deviceScaleFactor,
    };
  }

  private saveConfig(): void {
    this.context.workspaceState.update('previewConfig', this.config);
  }

  private async handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        if (this.currentUrl) {
          this.proxy.setTarget(this.currentUrl);
          this.panel.webview.postMessage({ type: 'setUrl', url: this.proxy.getLocalUrl(), displayUrl: this.currentUrl });
          // Safe area spacer is transparent; colored when bottom nav detected
        } else {
          // No URL — send recent workspaces to populate the empty state
          this.sendRecentWorkspaces();
        }
        break;
      case 'openWorkspace':
        if (msg.path && typeof msg.path === 'string') {
          vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path as string));
        }
        break;
      case 'setMode':
        this.config.mode = msg.value as PreviewMode;
        // Switch device to appropriate category
        if (this.config.mode === 'mobile') {
          const device = getDevice(this.config.deviceId);
          if (device.category === 'laptop') {
            this.config.deviceId = 'iphone-16-pro';
            this.config.browserChrome = 'safari';
          }
        } else if (this.config.mode === 'desktop') {
          const device = getDevice(this.config.deviceId);
          if (device.category !== 'laptop') {
            this.config.deviceId = 'macbook-pro-16';
            this.config.browserChrome = 'chrome';
            this.config.osFrame = 'macos';
          }
        }
        this.saveConfig();
        this.rebuildFrameInPlace();
        break;
      case 'selectDevice':
        this.config.deviceId = msg.deviceId as string;
        // Auto-set browser for device OS
        if (this.config.mode === 'mobile') {
          const device = getDevice(this.config.deviceId);
          const os = getDeviceOS(device);
          if (os === 'android') {
            this.config.browserChrome = 'google-chrome';
          } else if (this.config.browserChrome === 'google-chrome') {
            this.config.browserChrome = 'safari';
          }
        }
        this.saveConfig();
        this.rebuildFrameInPlace();
        break;
      case 'setBrowserChrome':
        this.config.browserChrome = msg.value as BrowserChromeType;
        this.saveConfig();
        this.updateViewInPlace();
        break;
      case 'setChromeTheme':
        this.config.chromeTheme = msg.value as ChromeTheme;
        this.saveConfig();
        this.updateViewInPlace();
        break;
      case 'setIphoneScreenType':
        this.config.iphoneScreenType = msg.value as IPhoneScreenType;
        this.saveConfig();
        this.rebuildFrameInPlace();
        break;
      case 'setOsFrame':
        this.config.osFrame = msg.value as OsFrameType;
        this.saveConfig();
        this.rebuildFrameInPlace();
        break;
      case 'toggleTaskbar':
        this.config.showTaskbar = !this.config.showTaskbar;
        this.saveConfig();
        this.rebuildFrameInPlace();
        break;
      case 'toggleOrientation':
        this.config.orientation = this.config.orientation === 'portrait' ? 'landscape' : 'portrait';
        this.saveConfig();
        this.rebuildFrameInPlace();
        break;
      case 'toggleSafariFlip':
        this.config.safariClassicFlipped = !this.config.safariClassicFlipped;
        this.saveConfig();
        this.updateViewInPlace();
        break;
      case 'setBottomNav':
        this.config.bottomNavOverride = msg.value as 'auto' | 'on' | 'off';
        this.saveConfig();
        this.updateViewInPlace();
        break;
      case 'toggleDebugOverlay':
        this.config.showDebugOverlay = !this.config.showDebugOverlay;
        this.saveConfig();
        this.updateViewInPlace();
        break;
      case 'setCustomDimensions':
        this.config.customWidth = msg.width as number;
        this.config.customHeight = msg.height as number;
        this.saveConfig();
        this.rebuildFrameInPlace();
        break;
      case 'applyPreset': {
        const preset = ALL_PRESETS.find(p => p.id === msg.presetId);
        if (preset) {
          Object.assign(this.config, preset.config);
          this.saveConfig();
          this.rebuildFrameInPlace();
        }
        break;
      }
      case 'urlChange':
        this.currentUrl = msg.url as string;
        this.context.workspaceState.update('previewUrl', msg.url);
        this.proxy.setTarget(msg.url as string);
        this._onManualUrl.fire(msg.url as string);
        this.panel.webview.postMessage({ type: 'setUrl', url: this.proxy.getLocalUrl(), displayUrl: msg.url });
        break;
      case 'pageMeta':
        if (msg.bgColor && typeof msg.bgColor === 'string') {
          this.pageBackgroundColor = msg.bgColor;
          // Always update chrome backing so the pill area matches the page color
          this.panel.webview.postMessage({ type: 'setPageBgColor', color: msg.bgColor });
          // Update status bar + screen area bg (matching original's barBg = pageColor)
          // Skip for Safari Classic with top bar — it uses its own themed bg
          if (!(this.config.browserChrome === 'safari-classic' && !this.config.safariClassicFlipped)) {
            this.panel.webview.postMessage({ type: 'setScreenBg', color: msg.bgColor });
          }
        }
        break;
      case 'bottomNavDetected':
        this.detectedBottomNav = !!(msg.detected);
        // Re-render chrome to apply hasBottomNav layout change
        this.updateViewInPlace();
        break;
      case 'spaNavigation':
        // SPA client-side navigation detected — track display URL without reloading
        break;
      case 'screenshot':
        this._onScreenshot.fire();
        break;
      case 'openClipEditor':
        this._onOpenClipEditor.fire();
        break;
    }
  }

  private resolvedHasBottomNav(): boolean {
    if (this.config.bottomNavOverride === 'on') { return true; }
    if (this.config.bottomNavOverride === 'off') { return false; }
    return this.detectedBottomNav;
  }

  private async sendRecentWorkspaces(): Promise<void> {
    try {
      const recent = await vscode.commands.executeCommand<{
        workspaces: Array<{ workspace?: { configPath: { path: string } }; folderUri?: { path: string }; label?: string }>;
      }>('_workbench.getRecentlyOpened');

      if (!recent) { return; }

      const items: Array<{ name: string; path: string }> = [];
      const entries = [
        ...(recent.workspaces ?? []),
        ...((recent as any).folders ?? []),
      ];

      for (const entry of entries) {
        if (items.length >= 10) { break; }
        let entryPath = '';
        let label = '';
        if ((entry as any).folderUri) {
          entryPath = (entry as any).folderUri.path ?? (entry as any).folderUri.fsPath ?? '';
        } else if ((entry as any).workspace?.configPath) {
          entryPath = (entry as any).workspace.configPath.path ?? '';
        } else if ((entry as any).fileUri) {
          entryPath = (entry as any).fileUri.path ?? '';
        }
        if (!entryPath) { continue; }

        // On Windows, strip leading slash from /C:/path
        if (process.platform === 'win32' && entryPath.startsWith('/') && entryPath[2] === ':') {
          entryPath = entryPath.substring(1);
        }

        label = (entry as any).label || entryPath.split(/[\\/]/).filter(Boolean).pop() || entryPath;
        items.push({ name: label, path: entryPath });
      }

      if (items.length > 0) {
        this.panel.webview.postMessage({ type: 'setRecentWorkspaces', workspaces: items });
      }
    } catch {
      // _workbench.getRecentlyOpened may not be available in all environments
    }
  }

  // ------------------------------------------------------------------
  // HTML generation
  // ------------------------------------------------------------------

  private updateContent(): void {
    const webview = this.panel.webview;
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.js'));
    const nonce = getNonce();

    const device = getDevice(this.config.deviceId);
    const frameHtml = this.buildFrame(device);
    const toolbarHtml = this.buildToolbar(device);

    // Serialize data for JS
    const configJson = JSON.stringify(this.config);
    const devicesJson = JSON.stringify(DEVICES);
    const presetsJson = JSON.stringify(ALL_PRESETS);

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src *; img-src ${webview.cspSource} http://127.0.0.1:* https: data:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>Live Preview</title>
</head>
<body>
  ${toolbarHtml}
  <div id="preview-area">
    ${frameHtml}
  </div>
  <div id="recording-indicator" class="hidden">● REC</div>
  ${this.config.showDebugOverlay ? `<div id="debug-overlay">${device.name} — ${device.width}×${device.height} @${device.deviceScaleFactor}x</div>` : ''}
  <script nonce="${nonce}">
    const CONFIG = ${configJson};
    const ALL_DEVICES = ${devicesJson};
    const ALL_PRESETS = ${presetsJson};
    const CURRENT_URL = ${JSON.stringify(this.currentUrl ?? '')};
    const IS_RECORDING = false;
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Partial DOM update — sends new toolbar + chrome HTML to the webview
   * without replacing the full page, keeping the iframe alive.
   */
  private updateViewInPlace(): void {
    const device = getDevice(this.config.deviceId);
    const c = this.config;

    const toolbarHtml = this.buildToolbar(device);

    let statusBarHtml: string | undefined;
    let statusBarBg: string | undefined;
    let chromeTopHtml = '';
    let chromeBottomHtml = '';
    let homeIndicatorHtml = '';
    if (c.mode !== 'custom' && device.category === 'phone') {
      const t = device.traits!;
      let w = device.width;
      if (c.orientation === 'landscape') { w = device.height; }

      // MUST use portrait width for ratio (matching library)
      const portraitW = Math.min(device.width, device.height);
      const ratio = (s: number) => Math.max(Math.floor((portraitW * s) / 390), 1);
      const os = getDeviceOS(device);
      const isLegacy = t.hasHomeButton;
      const effectiveType: 'legacy' | 'island' | 'notch' = isLegacy ? 'legacy' : (c.iphoneScreenType as 'island' | 'notch');
      const bottomH = t.safeAreaBottom;
      const hasBrowserChrome = c.browserChrome !== 'none';

      // Screen corner radius (library inner radius)
      const screenCR = PreviewPanel.computeScreenCR(device);

      statusBarBg = (c.browserChrome === 'safari-classic' && !c.safariClassicFlipped)
        ? (c.chromeTheme === 'light' ? '#F2F2F7' : '#1C1C1E')
        : (this.pageBackgroundColor || '#000');

      // Status bar content — ratio-based positioning matching original
      if (os !== 'android' && effectiveType !== 'legacy') {
        const isIsland = effectiveType === 'island';
        const earW = isIsland
          ? Math.floor((w - ratio(128)) / 2)
          : Math.floor((w - ratio(160)) / 2);
        const iTop = isIsland ? ratio(13) : 0;
        const iHeight = isIsland ? ratio(35) : ratio(44);
        statusBarHtml = this.buildModernStatusBar(earW, iTop, iHeight, c.chromeTheme);
      } else if (os === 'android') {
        statusBarHtml = this.buildAndroidStatusBar(w, t.safeAreaTop, c.chromeTheme, screenCR);
      } else if (isLegacy) {
        statusBarHtml = this.buildHomeButtonStatusBar(w, ratio(20), c.chromeTheme);
      }

      // Chrome — pass pre-computed screen corner radius
      const chromeHtml = this.buildBrowserChrome(w, device.height, 0, bottomH, device, screenCR);
      chromeTopHtml = chromeHtml.top;
      chromeBottomHtml = chromeHtml.bottom;

      if (bottomH > 0 && !hasBrowserChrome) {
        homeIndicatorHtml = `<div class="home-indicator" style="flex-shrink:0;position:relative;z-index:1;height:${bottomH}px;pointer-events:none;display:flex;align-items:flex-end;justify-content:center;"><div class="home-pill" style="width:35%;height:7px;background:#2A2A2C;border-radius:100px;margin-bottom:10px;transition:opacity 0.35s cubic-bezier(0.2,0.9,0.3,1);"></div></div>`;
      }
    }

    const debugHtml = c.showDebugOverlay
      ? `<div id="debug-overlay">${device.name} — ${device.width}×${device.height} @${device.deviceScaleFactor}x</div>`
      : '';

    this.panel.webview.postMessage({
      type: 'updateView',
      toolbarHtml,
      statusBarHtml,
      statusBarBg,
      chromeTopHtml,
      chromeBottomHtml,
      homeIndicatorHtml,
      hasBottomNav: this.resolvedHasBottomNav(),
      debugHtml,
    });
  }

  /**
   * Full frame structure rebuild without destroying the iframe.
   * Builds new frame HTML with a placeholder <div id="iframe-slot">
   * instead of the <iframe>. The webview JS detaches the live iframe,
   * swaps the frame HTML, then re-inserts the iframe — no page reload.
   */
  private rebuildFrameInPlace(): void {
    const device = getDevice(this.config.deviceId);
    // Build frame HTML, then swap the real <iframe> with a placeholder slot.
    // The webview JS will detach the live iframe, insert the new HTML,
    // then put the iframe back into the slot — no reload.
    const slotTag = '<div id="iframe-slot"></div>';
    // Iframe tag may have an inline style (margin-bottom for transparency).
    // Use regex to match regardless of style attribute presence.
    const frameHtml = this.buildFrame(device).replace(
      /<iframe id="preview-iframe"[^>]*><\/iframe>/,
      slotTag,
    );
    const toolbarHtml = this.buildToolbar(device);
    const debugHtml = this.config.showDebugOverlay
      ? `<div id="debug-overlay">${device.name} — ${device.width}×${device.height} @${device.deviceScaleFactor}x</div>`
      : '';

    this.panel.webview.postMessage({
      type: 'rebuildFrame',
      frameHtml,
      toolbarHtml,
      debugHtml,
      hasBottomNav: this.resolvedHasBottomNav(),
    });
  }

  // ------------------------------------------------------------------
  // Toolbar builder
  // ------------------------------------------------------------------

  private buildToolbar(device: DeviceProfile): string {
    const c = this.config;
    const isMobile = c.mode === 'mobile';
    const isDesktop = c.mode === 'desktop';
    const isCustom = c.mode === 'custom';
    const deviceOS = getDeviceOS(device);
    const isModern = isModernIphone(device);
    const isSafari = c.browserChrome === 'safari' || c.browserChrome === 'safari-classic';
    const isAndroid = deviceOS === 'android';

    let html = '<div id="toolbar">';

    // Row 1: Mode + Device + Screen type + Browser + Theme + OS + orientation + actions
    html += '<div class="toolbar-row">';

    // Mode toggle pill
    html += this.togglePill('mode', [
      { value: 'mobile', label: 'Mobile' },
      { value: 'desktop', label: 'Desktop' },
      { value: 'custom', label: 'Custom' },
    ], c.mode, 'setMode');

    html += '<span class="sep"></span>';

    // Custom mode: W×H
    if (isCustom) {
      html += `<div class="dim-inputs">
        <input type="number" id="custom-w" value="${c.customWidth}" min="200" max="3840" />
        <span class="dim-x">×</span>
        <input type="number" id="custom-h" value="${c.customHeight}" min="200" max="2160" />
      </div>`;
    }

    // Device dropdown (mobile & desktop only)
    if (!isCustom) {
      const groups = isMobile
        ? [
            { label: 'iPhones', devices: IPHONES },
            { label: 'Android', devices: ANDROID_PHONES },
            { label: 'iPads', devices: IPADS },
          ]
        : [{ label: 'Laptops', devices: LAPTOPS }];

      html += '<div class="dropdown" id="device-dropdown">';
      html += `<button class="dropdown-trigger">${device.name} <span class="dim-label">${device.width}×${device.height}</span></button>`;
      html += '<div class="dropdown-menu">';
      for (const group of groups) {
        html += `<div class="dropdown-group-label">${group.label}</div>`;
        for (const d of group.devices) {
          const sel = d.id === c.deviceId ? ' selected' : '';
          html += `<button class="dropdown-item${sel}" data-device-id="${d.id}">${d.name} <span class="dim-label">${d.width}×${d.height}</span></button>`;
        }
      }
      html += '</div></div>';
    }

    // iPhone screen type (Pill/Notch) — only for modern iPhones in mobile
    if (!isCustom && isMobile && isModern) {
      html += this.togglePill('screenType', [
        { value: 'island', label: 'Pill' },
        { value: 'notch', label: 'Notch' },
      ], c.iphoneScreenType, 'setIphoneScreenType');
    }

    if (!isCustom) { html += '<span class="sep"></span>'; }

    // Browser chrome picker
    if (!isCustom) {
      if (isMobile && isSafari) {
        html += this.smallDropdown('Safari', [
          { value: 'safari', label: 'Modern' },
          { value: 'safari-classic', label: 'Classic' },
        ], c.browserChrome, 'setBrowserChrome');
      } else if (isMobile && isAndroid) {
        html += '<span class="label-static">Chrome</span>';
      } else if (isDesktop) {
        html += this.smallDropdown('Browser', [
          { value: 'chrome', label: 'Chrome' },
          { value: 'edge', label: 'Edge' },
        ], c.browserChrome === 'chrome' || c.browserChrome === 'edge' ? c.browserChrome : 'chrome', 'setBrowserChrome');
      }
    }

    // Address bar flip (Safari Classic + Chrome)
    if (!isCustom && (c.browserChrome === 'safari-classic' || c.browserChrome === 'google-chrome')) {
      const flipActive = c.safariClassicFlipped ? ' active' : '';
      html += `<button class="tool-btn${flipActive}" data-action="toggleSafariFlip" title="Flip address bar position">Flip</button>`;
    }

    // Chrome theme toggle (Dark/Light)
    if (!isCustom && c.browserChrome !== 'none') {
      html += this.togglePill('theme', [
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ], c.chromeTheme, 'setChromeTheme');
    }

    // Desktop: OS frame + taskbar
    if (isDesktop) {
      html += '<span class="sep"></span>';
      html += this.smallDropdown('OS', [
        { value: 'macos', label: 'macOS' },
        { value: 'windows-11', label: 'Win 11' },
        { value: 'windows-10', label: 'Win 10' },
      ], c.osFrame === 'none' ? 'macos' : c.osFrame, 'setOsFrame');

      if (c.osFrame !== 'none') {
        const tbActive = c.showTaskbar ? ' active' : '';
        html += `<button class="tool-btn${tbActive}" data-action="toggleTaskbar" title="Toggle OS taskbar">Taskbar</button>`;
      }
    }

    if (!isCustom) { html += '<span class="sep"></span>'; }

    // Orientation (not for laptops or custom)
    if (!isCustom && device.category !== 'laptop') {
      const oActive = c.orientation === 'landscape' ? ' active' : '';
      html += `<button class="tool-btn${oActive}" data-action="toggleOrientation" title="Toggle orientation">${c.orientation === 'portrait' ? '▯' : '▭'}</button>`;
    }

    // Bottom nav override (mobile only)
    if (isMobile && c.browserChrome !== 'none') {
      html += this.togglePill('bottomNav', [
        { value: 'auto', label: 'Auto' },
        { value: 'on', label: 'Nav' },
        { value: 'off', label: 'No Nav' },
      ], c.bottomNavOverride, 'setBottomNav');
    }

    // Debug overlay
    const debugActive = c.showDebugOverlay ? ' active' : '';
    html += `<button class="tool-btn${debugActive}" data-action="toggleDebugOverlay" title="Toggle debug overlay">Debug</button>`;

    // Spacer
    html += '<div class="toolbar-spacer"></div>';

    // Presets dropdown
    html += '<div class="dropdown" id="presets-dropdown">';
    html += '<button class="dropdown-trigger">Presets</button>';
    html += '<div class="dropdown-menu dropdown-right">';
    for (const preset of ALL_PRESETS) {
      html += `<button class="dropdown-item" data-preset-id="${preset.id}">${preset.label}</button>`;
    }
    html += '</div></div>';

    html += '</div>'; // toolbar-row

    // Row 2: URL bar + action buttons
    html += '<div class="toolbar-row url-row">';
    html += `<div class="url-bar">
      <input id="url-input" type="text" placeholder="Enter URL or start a dev server..." value="${this.escHtml(this.currentUrl ?? '')}" />
      <button id="btn-refresh" title="Refresh"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
    </div>`;
    html += `<button id="btn-screenshot" class="action-btn" title="Screenshot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>`;
    html += `<button id="btn-clip" class="action-btn" title="Open clip editor"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg></button>`;
    html += '</div>'; // toolbar-row

    html += '</div>'; // toolbar

    return html;
  }

  private togglePill(_id: string, options: { value: string; label: string }[], current: string, action: string): string {
    let html = `<div class="toggle-pill" data-action="${action}">`;
    for (const opt of options) {
      const sel = opt.value === current ? ' selected' : '';
      html += `<button class="pill-opt${sel}" data-value="${opt.value}">${opt.label}</button>`;
    }
    html += '</div>';
    return html;
  }

  private smallDropdown(label: string, options: { value: string; label: string }[], current: string, action: string): string {
    const selected = options.find(o => o.value === current);
    let html = `<div class="dropdown small-dropdown">`;
    html += `<button class="dropdown-trigger">${label}: ${selected?.label ?? current}</button>`;
    html += `<div class="dropdown-menu" data-action="${action}">`;
    for (const opt of options) {
      const sel = opt.value === current ? ' selected' : '';
      html += `<button class="dropdown-item${sel}" data-value="${opt.value}">${opt.label}</button>`;
    }
    html += '</div></div>';
    return html;
  }

  // ------------------------------------------------------------------
  // Frame builder
  // ------------------------------------------------------------------

  private buildFrame(device: DeviceProfile): string {
    const c = this.config;
    if (c.mode === 'custom') {
      return this.buildCustomFrame(c.customWidth, c.customHeight);
    }
    if (device.category === 'phone') { return this.buildPhoneFrame(device); }
    if (device.category === 'tablet') { return this.buildTabletFrame(device); }
    return this.buildLaptopFrame(device);
  }

  private buildCustomFrame(w: number, h: number): string {
    return `<div id="device-frame" class="custom" style="width:${w}px;height:${h}px;">
  <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
</div>`;
  }

  private buildPhoneFrame(device: DeviceProfile): string {
    const c = this.config;
    const t = device.traits!;
    let w = device.width;
    let h = device.height;
    if (c.orientation === 'landscape') { [w, h] = [h, w]; }

    // CRITICAL: ratio() must ALWAYS use portrait width (matching react-device-mockup library)
    const portraitW = Math.min(device.width, device.height);
    const ratio = (s: number) => Math.max(Math.floor((portraitW * s) / 390), 1);
    const os = getDeviceOS(device);
    const isLegacy = t.hasHomeButton;

    // Natural type = physical device type (never changes with user toggle)
    // Effective type = visual cutout type (changes with user toggle)
    const naturalType: 'legacy' | 'island' | 'notch' = isLegacy ? 'legacy' : (t.hasDynamicIsland ? 'island' : 'notch');
    const effectiveType: 'legacy' | 'island' | 'notch' = naturalType === 'legacy' ? 'legacy' : (c.iphoneScreenType as 'island' | 'notch');

    // Frame dimensions ALWAYS use natural type (physical frame doesn't change)
    // Android devices have thinner bezels and less rounded corners than iPhones
    let frameWidth: number;
    let bezelRadius: number;
    if (naturalType === 'legacy') {
      frameWidth = 0;
      bezelRadius = t.deviceCornerRadius;
    } else if (os === 'android') {
      frameWidth = ratio(4);   // ~4px thin bezel (real Android devices)
      bezelRadius = ratio(42); // ~42px corner radius (Galaxy/Pixel style)
    } else if (naturalType === 'island') {
      frameWidth = ratio(10);
      bezelRadius = ratio(68);
    } else {
      frameWidth = ratio(14);
      bezelRadius = ratio(64);
    }

    // Screen corner radius = library inner radius (bezelRadius - frameWidth)
    const screenCR = naturalType === 'legacy' ? 0 : Math.max(bezelRadius - frameWidth, 0);

    // Status bar height — ratio-based matching original getLibraryScreenMetrics
    let sbH: number;
    if (os === 'android') {
      sbH = t.safeAreaTop;
    } else if (effectiveType === 'legacy') {
      sbH = ratio(20);
    } else if (effectiveType === 'notch') {
      sbH = ratio(44);
    } else {
      sbH = ratio(59); // island
    }

    // Dynamic island / notch VISUAL element — uses effective type (responds to toggle)
    let islandHtml = '';
    if (os === 'ios' && naturalType !== 'legacy') {
      if (effectiveType === 'island') {
        const iw = ratio(128);
        const ih = ratio(35); // library hardcodes 35, NOT trait.dynamicIslandHeight (37)
        const ir = ratio(50);
        const it = ratio(13);
        islandHtml = `<div class="dynamic-island" style="width:${iw}px;height:${ih}px;border-radius:${ir}px;top:${it}px;"></div>`;
      } else {
        const nw = ratio(160);
        const nh = ratio(31);
        const nr = ratio(20);
        islandHtml = `<div class="notch" style="width:${nw}px;height:${nh}px;border-bottom-left-radius:${nr}px;border-bottom-right-radius:${nr}px;"></div>`;
      }
    }

    // Status bar content — ratio-based positioning matching original IOSStatusBar.tsx
    // DeviceFrame.tsx passes ratio-computed values to IOSStatusBar, not trait values
    let statusBarHtml: string;
    if (os === 'android') {
      statusBarHtml = this.buildAndroidStatusBar(w, sbH, c.chromeTheme, screenCR);
    } else if (effectiveType === 'legacy') {
      statusBarHtml = this.buildHomeButtonStatusBar(w, sbH, c.chromeTheme);
    } else {
      const isIsland = effectiveType === 'island';
      const earW = isIsland
        ? Math.floor((w - ratio(128)) / 2)
        : Math.floor((w - ratio(160)) / 2);
      // Matching getLibraryScreenMetrics: island → ratio(13), ratio(35)
      // Notch: original NotchStatusBar uses top:0,bottom:0 → full status bar height
      const iTop = isIsland ? ratio(13) : 0;
      const iHeight = isIsland ? ratio(35) : sbH;
      statusBarHtml = this.buildModernStatusBar(earW, iTop, iHeight, c.chromeTheme);
    }

    const bottomH = t.safeAreaBottom;
    const hasBrowserChrome = c.browserChrome !== 'none';

    // Bottom chrome is absolutely positioned (overlay mode) by default.
    // No negative margin needed — chrome floats over iframe content.

    // Status bar background — matches original DeviceFrame.tsx:
    // barBg = statusBarBg || pageColor || '#000'
    // Safari Classic (not flipped): uses classic bar bg
    // All others: uses page background color (falls back to #000)
    const statusBarBg = (c.browserChrome === 'safari-classic' && !c.safariClassicFlipped)
      ? (c.chromeTheme === 'light' ? '#F2F2F7' : '#1C1C1E')
      : (this.pageBackgroundColor || '#000');

    // Browser chrome — pass computed screen corner radius
    const chromeHtml = this.buildBrowserChrome(w, h, sbH, bottomH, device, screenCR);

    // Home indicator only when no browser chrome — uses position:relative + z-index
    // so it paints above the overlapping iframe
    const homeIndicatorHtml = (bottomH > 0 && !hasBrowserChrome)
      ? `<div class="home-indicator" style="flex-shrink:0;position:relative;z-index:1;height:${bottomH}px;pointer-events:none;display:flex;align-items:flex-end;justify-content:center;"><div class="home-pill" style="width:35%;height:7px;background:#2A2A2C;border-radius:100px;margin-bottom:10px;transition:opacity 0.35s cubic-bezier(0.2,0.9,0.3,1);"></div></div>`
      : '';

    // Legacy devices (SE)
    if (isLegacy) {
      const legacyRatio = (s: number) => Math.max(Math.floor((portraitW * s) / 375), 1);
      const legacyFW = legacyRatio(22);
      const legacyHalfFW = Math.floor(legacyFW / 2);
      const upperBezelH = legacyRatio(110);
      const lowerBezelH = legacyRatio(110);
      const legacyBezelR = legacyRatio(60);
      const homeBtn = legacyRatio(65);
      const speakerW = legacyRatio(80);
      const speakerH = legacyRatio(10);
      const cameraSize = legacyRatio(10);
      const mHeight = Math.floor((w / 9) * 16);
      const totalW = w + legacyFW * 2;
      const totalH = mHeight + upperBezelH + lowerBezelH;
      const legacyBtnSize = Math.floor(legacyFW * 0.8);
      const legacyBtnPad = Math.max(legacyBtnSize - legacyHalfFW, 0);
      const legacyBtnPos = w + legacyFW + legacyBtnSize;

      return `<div id="device-frame" class="phone" style="position:relative;display:flex;flex-direction:column;width:${totalW + legacyBtnPad * 2}px;height:${totalH}px;padding:0 ${legacyBtnPad}px;">
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:${totalW}px;height:${upperBezelH}px;background:#2A2A2C;border-top-left-radius:${legacyBezelR}px;border-top-right-radius:${legacyBezelR}px;position:relative;">
    <div style="position:relative;width:${speakerW}px;height:${speakerH}px;background:#000;border-radius:${speakerH}px;">
      <div style="position:absolute;left:${-legacyRatio(38)}px;bottom:0;width:${cameraSize}px;height:${cameraSize}px;border-radius:${cameraSize}px;background:#000;"></div>
    </div>
  </div>
  <div style="border-left:${legacyFW}px solid #2A2A2C;border-right:${legacyFW}px solid #2A2A2C;overflow:hidden;">
    <div class="screen-area" style="display:flex;flex-direction:column;position:relative;width:${w}px;height:${mHeight}px;background:${statusBarBg};overflow:hidden;">
      <div class="status-bar" style="height:${sbH}px;background:${statusBarBg};">
        ${statusBarHtml}
      </div>
      ${chromeHtml.top}
      <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      ${chromeHtml.bottom}
      ${homeIndicatorHtml}
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:center;width:${totalW}px;height:${lowerBezelH}px;background:#2A2A2C;border-bottom-left-radius:${legacyBezelR}px;border-bottom-right-radius:${legacyBezelR}px;">
    <div style="width:${homeBtn}px;height:${homeBtn}px;border-radius:${homeBtn}px;background:#000;"></div>
  </div>
  <div style="position:absolute;border-radius:${legacyFW}px;top:${legacyRatio(115)}px;right:${legacyBtnPos}px;width:${legacyBtnSize}px;height:${legacyRatio(36)}px;background:#2A2A2C;"></div>
  <div style="position:absolute;border-radius:${legacyFW}px;top:${legacyRatio(185)}px;right:${legacyBtnPos}px;width:${legacyBtnSize}px;height:${legacyRatio(70)}px;background:#2A2A2C;"></div>
  <div style="position:absolute;border-radius:${legacyFW}px;top:${legacyRatio(270)}px;right:${legacyBtnPos}px;width:${legacyBtnSize}px;height:${legacyRatio(70)}px;background:#2A2A2C;"></div>
  <div style="position:absolute;border-radius:${legacyFW}px;top:${legacyRatio(190)}px;left:${legacyBtnPos}px;width:${legacyBtnSize}px;height:${legacyRatio(64)}px;background:#2A2A2C;"></div>
</div>`;
    }

    // Modern phones
    const halfFW = Math.floor(frameWidth / 2);
    const btnSize = Math.floor(frameWidth * 0.9);
    const btnPad = Math.max(btnSize - halfFW, 0);
    const btnPos = w + frameWidth + btnSize;

    // NotchPad — for notch mode, extends notch through the border
    const isNotchMode = os === 'ios' && effectiveType === 'notch';
    const notchPadHtml = isNotchMode
      ? `<div style="position:absolute;top:${halfFW}px;left:${btnPad}px;width:${w + frameWidth * 2}px;display:flex;justify-content:center;z-index:25;pointer-events:none;"><div style="width:${ratio(160)}px;height:${ratio(20)}px;background:#2A2A2C;"></div></div>`
      : '';

    const isIsland = effectiveType === 'island';
    const silenceTop = isIsland ? ratio(165) : ratio(165);
    const volUpTop = isIsland ? ratio(230) : ratio(230);
    const volDownTop = isIsland ? ratio(315) : ratio(315);
    const powerTop = isIsland ? ratio(280) : ratio(250);

    const buttonsHtml = `
      <div style="position:absolute;border-radius:${frameWidth}px;top:${silenceTop}px;right:${btnPos}px;width:${btnSize}px;height:${ratio(34)}px;background:#2A2A2C;"></div>
      <div style="position:absolute;border-radius:${frameWidth}px;top:${volUpTop}px;right:${btnPos}px;width:${btnSize}px;height:${ratio(65)}px;background:#2A2A2C;"></div>
      <div style="position:absolute;border-radius:${frameWidth}px;top:${volDownTop}px;right:${btnPos}px;width:${btnSize}px;height:${ratio(65)}px;background:#2A2A2C;"></div>
      <div style="position:absolute;border-radius:${frameWidth}px;top:${powerTop}px;left:${btnPos}px;width:${btnSize}px;height:${ratio(105)}px;background:#2A2A2C;"></div>`;

    const containerW = w + frameWidth * 2 + btnPad * 2;
    const containerH = h + frameWidth * 2;

    return `<div id="device-frame" class="phone" style="position:relative;width:${containerW}px;height:${containerH}px;padding:0 ${btnPad}px;">
  <div style="position:relative;border-radius:${bezelRadius}px;border:solid ${frameWidth}px #2A2A2C;overflow:hidden;">
    <div class="screen-area" style="display:flex;flex-direction:column;position:relative;width:${w}px;height:${h}px;background:${statusBarBg};overflow:hidden;border-radius:${screenCR}px;">
      ${islandHtml}
      <div class="status-bar" style="height:${sbH}px;background:${statusBarBg};">
        ${statusBarHtml}
      </div>
      ${chromeHtml.top}
      <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      ${chromeHtml.bottom}
      ${homeIndicatorHtml}
    </div>
  </div>
  ${notchPadHtml}
  ${buttonsHtml}
</div>`;
  }

  private buildTabletFrame(device: DeviceProfile): string {
    const c = this.config;
    let w = device.width;
    let h = device.height;
    if (c.orientation === 'landscape') { [w, h] = [h, w]; }

    return `<div id="device-frame" class="tablet">
  <div class="screen-area" style="width:${w}px;height:${h}px;">
    <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  </div>
</div>`;
  }

  private buildLaptopFrame(device: DeviceProfile): string {
    const c = this.config;
    const w = device.width;
    const h = device.height;
    const bezelX = 14;
    const bezelTop = 28;
    const bezelBottom = 14;
    const lidW = w + bezelX * 2;
    const lidH = h + bezelTop + bezelBottom;
    const baseW = lidW + 40;
    const baseH = 18;

    // OS frame + taskbar
    const osFrameHtml = this.buildOsFrame(w, c);
    const taskbarHtml = this.buildTaskbar(w, c);
    const chromeHtml = this.buildDesktopBrowserChrome(w, c);

    return `<div id="device-frame" class="laptop">
  <div class="laptop-lid" style="width:${lidW}px;height:${lidH}px;">
    <div class="webcam"></div>
    <div class="screen-area" style="width:${w}px;height:${h}px;margin-top:${bezelTop - 12}px;">
      ${taskbarHtml.top}
      ${osFrameHtml}
      ${chromeHtml}
      <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      ${taskbarHtml.bottom}
    </div>
  </div>
  <div class="laptop-base" style="width:${baseW}px;height:${baseH}px;">
    <div class="trackpad-notch"></div>
  </div>
</div>`;
  }

  // ------------------------------------------------------------------
  // Status bars
  // ------------------------------------------------------------------

  private buildModernStatusBar(earWidth: number, islandTop: number, islandHeight: number, theme: ChromeTheme): string {
    const color = theme === 'light' ? '#000' : '#fff';
    const iconsSvg = PreviewPanel.statusIconsSvg(color);
    return `
      <div class="sb-time" style="left:0;width:${earWidth}px;top:${islandTop}px;height:${islandHeight}px;color:${color};">
        <span>${PreviewPanel.currentTime()}</span>
      </div>
      <div class="sb-icons" style="right:0;width:${earWidth}px;top:${islandTop}px;height:${islandHeight}px;">
        ${iconsSvg}
      </div>`;
  }

  private buildHomeButtonStatusBar(_w: number, _h: number, theme: ChromeTheme = 'dark'): string {
    const color = theme === 'light' ? '#000' : '#fff';
    // Legacy (home button) battery icon is smaller than modern: 22x11, viewBox 27x12
    const legacyBattery = `<svg width="22" height="11" viewBox="0 0 27 12" fill="none"><rect x=".5" y=".5" width="22" height="11" rx="2.5" stroke="${color}" stroke-width="1" opacity=".35"/><rect x="2" y="2" width="18" height="8" rx="1.5" fill="${color}"/><path d="M24 4v4c.8-.3 1.5-1 1.5-2s-.7-1.7-1.5-2z" fill="${color}" opacity=".4"/></svg>`;
    return `
      <div style="position:absolute;left:6px;top:3px;display:flex;align-items:center;">
        <span style="font-size:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-weight:500;color:${color};">Carrier</span>
      </div>
      <div style="position:absolute;left:0;right:0;top:3px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-weight:600;color:${color};">${PreviewPanel.currentTime()}</span>
      </div>
      <div style="position:absolute;right:6px;top:4px;display:flex;align-items:center;">
        ${legacyBattery}
      </div>`;
  }

  private buildAndroidStatusBar(_w: number, h: number, theme: ChromeTheme, screenCR = 0): string {
    const color = theme === 'light' ? '#000' : '#fff';
    // Inset time/icons so they clear the screen corner radius
    // Use ~60% of corner radius as horizontal padding (content sits inside the curve)
    const padL = Math.max(16, Math.floor(screenCR * 0.6));
    const padR = Math.max(12, Math.floor(screenCR * 0.6));
    return `
      <div style="position:absolute;left:${padL}px;top:${Math.floor((h - 12) / 2)}px;">
        <span style="font-size:11.5px;font-family:Roboto,'Google Sans',system-ui,sans-serif;font-weight:500;color:${color};letter-spacing:0.2px;">${PreviewPanel.currentTime()}</span>
      </div>
      <div style="position:absolute;right:${padR}px;top:${Math.floor((h - 10) / 2)}px;display:flex;align-items:center;gap:4px;">
        <svg width="13" height="10" viewBox="0 0 24 18" fill="${color}"><path d="M1 5.5C4.3 2.5 8 1 12 1s7.7 1.5 11 4.5L12 18 1 5.5z" opacity="0.9"/></svg>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="${color}"><path d="M0 12V4l12-4v12H0z" opacity="0.85"/></svg>
        <svg width="20" height="10" viewBox="0 0 22 11" fill="none"><rect x=".5" y=".5" width="18" height="10" rx="2" stroke="${color}" stroke-width="1" opacity=".35"/><rect x="2" y="2" width="14" height="7" rx="1" fill="${color}"/><path d="M20 3.5v4c.6-.2 1.2-.8 1.2-2s-.6-1.8-1.2-2z" fill="${color}" opacity=".35"/></svg>
      </div>`;
  }

  // ------------------------------------------------------------------
  // Browser chrome overlays
  // ------------------------------------------------------------------

  private buildBrowserChrome(_w: number, _h: number, _sbH: number, bottomH: number, device: DeviceProfile, screenCR?: number): { top: string; bottom: string } {
    const c = this.config;
    if (c.browserChrome === 'none' || c.mode === 'custom') {
      return { top: '', bottom: '' };
    }

    const hostname = this.escHtml(this.getHostname() || 'localhost');
    const url = this.currentUrl ?? '';
    const isDesktop = false;
    const hasBottomNav = this.resolvedHasBottomNav();

    // Use pre-computed library inner radius if provided, otherwise compute it
    const screenCornerRadius = screenCR ?? PreviewPanel.computeScreenCR(device);

    return buildBrowserChromeHtml(
      c.browserChrome, c.chromeTheme, hostname, url,
      c.safariClassicFlipped, bottomH, hasBottomNav, isDesktop, screenCornerRadius,
      this.pageBackgroundColor || undefined,
    );
  }

  private buildDesktopBrowserChrome(_w: number, c: PreviewConfig): string {
    if (c.browserChrome === 'none') { return ''; }

    const hostname = this.escHtml(this.getHostname() || 'localhost');
    const url = this.currentUrl ?? '';
    const result = buildBrowserChromeHtml(
      c.browserChrome, c.chromeTheme, hostname, url,
      false, 0, false, true,
    );
    return result.top;
  }

  // ------------------------------------------------------------------
  // OS frame & taskbar (desktop mode)
  // ------------------------------------------------------------------

  private buildOsFrame(_w: number, c: PreviewConfig): string {
    if (c.mode !== 'desktop' || c.osFrame === 'none' || c.fullscreen) { return ''; }
    return buildOsFrameHtml(c.osFrame, 'Preview');
  }

  private buildTaskbar(_w: number, c: PreviewConfig): { top: string; bottom: string } {
    return buildTaskbarHtml(c);
  }

  // ------------------------------------------------------------------
  // SVG helpers
  // ------------------------------------------------------------------

  /** Compute library inner screen radius matching original getLibraryInnerRadius */
  static computeScreenCR(device: DeviceProfile): number {
    if (device.category !== 'phone' || !device.traits) { return 0; }
    const t = device.traits;
    if (t.hasHomeButton) { return 0; }
    const pw = Math.min(device.width, device.height);
    const r = (s: number) => Math.floor((pw * s) / 390);
    const os = getDeviceOS(device);
    if (os === 'android') {
      return Math.max(r(42) - r(4), 0); // android: bezelR - frameW
    }
    if (t.hasDynamicIsland) {
      return Math.max(r(68) - r(10), 0); // island: bezelR - frameW
    }
    return Math.max(r(64) - r(14), 0); // notch: bezelR - frameW
  }

  private static currentTime(): string {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  private static statusIconsSvg(color: string): string {
    return `<div style="display:flex;align-items:center;gap:5px;">
      <svg width="20" height="13" viewBox="0 0 18 12" fill="${color}"><rect x="0" y="9" width="3" height="3" rx=".7"/><rect x="5" y="6" width="3" height="6" rx=".7"/><rect x="10" y="3" width="3" height="9" rx=".7"/><rect x="15" y="0" width="3" height="12" rx=".7"/></svg>
      <svg width="18" height="13" viewBox="0 0 18 13" fill="none" stroke="${color}" style="clip-path:polygon(50% 100%,5% 0%,95% 0%)"><circle cx="9" cy="13" r="3.5" stroke-width="2.4"/><circle cx="9" cy="13" r="7" stroke-width="2.4"/><circle cx="9" cy="13" r="10.5" stroke-width="2.4" opacity=".75"/></svg>
      ${PreviewPanel.batteryIconSvg(color)}
    </div>`;
  }

  private static batteryIconSvg(color: string): string {
    return `<svg width="30" height="13" viewBox="0 0 28 12" fill="none"><rect x=".5" y=".5" width="23" height="11" rx="2.5" stroke="${color}" stroke-width="1" opacity=".35"/><rect x="2" y="2" width="19" height="8" rx="1.5" fill="${color}"/><path d="M25 4v4c.8-.3 1.5-1 1.5-2s-.7-1.7-1.5-2z" fill="${color}" opacity=".4"/></svg>`;
  }

  private getHostname(): string {
    if (!this.currentUrl) { return ''; }
    try { return new URL(this.currentUrl).hostname; } catch { return this.currentUrl; }
  }

  private escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ------------------------------------------------------------------
  // Dispose
  // ------------------------------------------------------------------

  private dispose(): void {
    PreviewPanel.instance = undefined;
    this._onDispose.fire();
    this.proxy.dispose();
    this._onScreenshot.dispose();
    this._onOpenClipEditor.dispose();
    this._onManualUrl.dispose();
    this._onDispose.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.panel.dispose();
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
