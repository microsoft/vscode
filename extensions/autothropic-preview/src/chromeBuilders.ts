/**
 * Browser chrome HTML builders — exact replicas of the original
 * autothropic app's Safari, Chrome, and Edge browser chrome components.
 *
 * Every style property, color value, dimension, and SVG icon is copied
 * verbatim from the original React source files:
 *   MobileSafariModernChrome.tsx
 *   MobileSafariChrome.tsx
 *   MobileChromeChrome.tsx
 */

import type { ChromeTheme, BrowserChromeType } from './devices';

// ---------------------------------------------------------------------------
// Mobile Safari Modern (floating bottom pill bar)
// Source: MobileSafariModernChrome.tsx
// ---------------------------------------------------------------------------

const SAFARI_MODERN_THEMES = {
  dark: {
    barBg: 'rgba(30, 30, 30, 0.52)',
    barBorder: 'rgba(255, 255, 255, 0.12)',
    btnBg: 'rgba(255, 255, 255, 0.12)',
    text: 'white',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    iconColor: 'rgba(255, 255, 255, 0.85)',
    tint: '#007AFF',
  },
  light: {
    barBg: 'rgba(250, 250, 250, 0.50)',
    barBorder: 'rgba(0, 0, 0, 0.08)',
    btnBg: 'rgba(0, 0, 0, 0.06)',
    text: '#1c1c1e',
    textMuted: 'rgba(0, 0, 0, 0.4)',
    iconColor: 'rgba(0, 0, 0, 0.7)',
    tint: '#007AFF',
  },
};

// Original constants from MobileSafariModernChrome.tsx
const SM_EXPANDED_HEIGHT = 52;
const SM_TOP_PADDING = 12;
const SM_SIDE_INSET = 10;
const SM_BTN_SIZE = 36;
const SM_BTN_GAP = 6;
const SM_ICON_GROUP_WIDTH = SM_BTN_SIZE * 2 + SM_BTN_GAP + 8; // 86
const SM_FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif";

export function buildSafariModernChrome(hostname: string, theme: ChromeTheme, safeAreaBottom: number, hasBottomNav: boolean, screenCornerRadius: number = 0, pageBackgroundColor?: string): string {
  const t = SAFARI_MODERN_THEMES[theme];
  const barH = SM_EXPANDED_HEIGHT;
  const collapsedH = 34;
  const collapsedMaxW = 168;
  const expandedW = `calc(100% - ${SM_SIDE_INSET * 2}px)`;

  // Original: chromeHeight = 5 + barHeight + bottomSpacer
  const chromeHeight = 5 + barH + safeAreaBottom;
  const defaultChromeBg = theme === 'dark' ? '#1c1c1e' : '#f2f2f7';

  // Flex when hasBottomNav (chrome takes space), absolute overlay otherwise
  const posStyle = hasBottomNav
    ? 'flex-shrink:0'
    : 'position:absolute;bottom:0;left:0;right:0';

  const cornerStyle = screenCornerRadius > 0
    ? `border-bottom-left-radius:${screenCornerRadius}px;border-bottom-right-radius:${screenCornerRadius}px;`
    : '';

  return `<div id="sm-wrap" class="chrome-bar chrome-bottom" data-exp-h="${chromeHeight}" data-col-h="${5 + collapsedH + 20}" data-chrome-h="${chromeHeight}" style="height:${chromeHeight}px;${posStyle};overflow:hidden;${cornerStyle}background:transparent;will-change:height;z-index:2;transition:height 0.3s cubic-bezier(0.2,0.9,0.3,1);">
  <div id="sm-backing" data-chrome-bg="${defaultChromeBg}" style="padding-top:${SM_TOP_PADDING}px;background:${hasBottomNav ? defaultChromeBg : 'transparent'};position:relative;z-index:1;">
    <div id="sm-bar-row" style="display:flex;justify-content:center;height:${barH}px;transition:height 0.3s cubic-bezier(0.2,0.9,0.3,1);" data-exp-h="${barH}" data-col-h="${collapsedH}">
      <div id="sm-pill" data-chrome-url style="width:${expandedW};height:${barH}px;border-radius:${barH / 2}px;background:${t.barBg};backdrop-filter:blur(40px) saturate(180%);-webkit-backdrop-filter:blur(40px) saturate(180%);border:0.5px solid ${t.barBorder};box-shadow:0 2px 16px rgba(0,0,0,0.15);display:flex;align-items:center;overflow:hidden;transition:width 0.3s cubic-bezier(0.2,0.9,0.3,1),height 0.3s cubic-bezier(0.2,0.9,0.3,1),border-radius 0.3s cubic-bezier(0.2,0.9,0.3,1);" data-exp-w="${expandedW}" data-col-w="${collapsedMaxW}px" data-exp-h="${barH}" data-col-h="${collapsedH}" data-exp-r="${barH / 2}" data-col-r="${collapsedH / 2}">
        <div class="sm-icon-group" style="width:${SM_ICON_GROUP_WIDTH}px;overflow:hidden;display:flex;align-items:center;justify-content:flex-end;gap:${SM_BTN_GAP}px;padding-left:8px;flex-shrink:0;transition:width 0.3s cubic-bezier(0.2,0.9,0.3,1),opacity 0.15s cubic-bezier(0.2,0.9,0.3,1),padding 0.3s cubic-bezier(0.2,0.9,0.3,1);">
          <div data-chrome-action="back" style="width:${SM_BTN_SIZE}px;height:${SM_BTN_SIZE}px;border-radius:${SM_BTN_SIZE / 2}px;background:${t.btnBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;">
            <svg width="18" height="18" viewBox="0 0 28 28" fill="none"><path d="M17 6L9 14l8 8" stroke="${t.tint}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div style="width:${SM_BTN_SIZE}px;height:${SM_BTN_SIZE}px;border-radius:${SM_BTN_SIZE / 2}px;background:${t.btnBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="13" height="13" rx="2.5" stroke="${t.iconColor}" stroke-width="1.7"/><path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h6A2.5 2.5 0 0 1 19 5.5v6a2.5 2.5 0 0 1-2.5 2.5H15" stroke="${t.iconColor}" stroke-width="1.7" stroke-linecap="round"/></svg>
          </div>
        </div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;min-width:0;padding:0 8px;">
          <span id="sm-hostname" data-chrome-hostname style="font-size:16px;font-family:${SM_FONT};font-weight:500;color:${t.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color 0.3s cubic-bezier(0.2,0.9,0.3,1),font-size 0.3s cubic-bezier(0.2,0.9,0.3,1);" data-exp-color="${t.text}" data-col-color="${t.textMuted}">${hostname}</span>
        </div>
        <div class="sm-icon-group" style="width:${SM_ICON_GROUP_WIDTH}px;overflow:hidden;display:flex;align-items:center;gap:${SM_BTN_GAP}px;padding-right:8px;flex-shrink:0;transition:width 0.3s cubic-bezier(0.2,0.9,0.3,1),opacity 0.15s cubic-bezier(0.2,0.9,0.3,1),padding 0.3s cubic-bezier(0.2,0.9,0.3,1);">
          <div data-chrome-action="reload" style="width:${SM_BTN_SIZE}px;height:${SM_BTN_SIZE}px;border-radius:${SM_BTN_SIZE / 2}px;background:${t.btnBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 4v5h-5" stroke="${t.iconColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.5 14a8.5 8.5 0 1 1-2.1-8.4L21 9" stroke="${t.iconColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div style="width:${SM_BTN_SIZE}px;height:${SM_BTN_SIZE}px;border-radius:${SM_BTN_SIZE / 2}px;background:${t.btnBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="${t.iconColor}" stroke-width="1.6"/><circle cx="8" cy="12" r="1.3" fill="${t.iconColor}"/><circle cx="12" cy="12" r="1.3" fill="${t.iconColor}"/><circle cx="16" cy="12" r="1.3" fill="${t.iconColor}"/></svg>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div id="sm-spacer" class="safe-area-spacer" style="height:${safeAreaBottom}px;flex-shrink:0;background:${hasBottomNav ? (pageBackgroundColor || defaultChromeBg) : 'transparent'};pointer-events:none;transition:height 0.3s cubic-bezier(0.2,0.9,0.3,1);" data-exp-h="${safeAreaBottom}" data-col-h="20"></div>
</div>`;
}

// ---------------------------------------------------------------------------
// Mobile Safari Classic (structural top address bar + bottom nav toolbar)
// Source: MobileSafariChrome.tsx
// ---------------------------------------------------------------------------

const SAFARI_CLASSIC_THEMES = {
  dark: {
    bg: 'rgba(28, 28, 30, 0.92)',
    border: 'none',
    textMuted: 'rgba(255,255,255,0.55)',
    urlBg: 'rgba(120, 120, 128, 0.24)',
    urlLabel: 'white',
    labelOpacity: 0.4,
    reloadStroke: 'white',
    reloadOpacity: 0.5,
    tint: '#007AFF',
    disabled: '#48484A',
    pill: 'rgba(255,255,255,0.3)',
  },
  light: {
    bg: 'rgba(246, 246, 246, 0.94)',
    border: 'none',
    textMuted: 'rgba(0,0,0,0.4)',
    urlBg: 'rgba(0, 0, 0, 0.06)',
    urlLabel: '#1c1c1e',
    labelOpacity: 0.35,
    reloadStroke: '#1c1c1e',
    reloadOpacity: 0.4,
    tint: '#007AFF',
    disabled: '#C7C7CC',
    pill: 'rgba(0,0,0,0.25)',
  },
};

const SC_BAR = 44;
const SC_FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif";

export function buildSafariClassicChrome(
  hostname: string,
  theme: ChromeTheme,
  flipped: boolean,
  safeAreaBottom: number,
  _hasBottomNav: boolean,
  screenCornerRadius: number = 0,
): { top: string; bottom: string } {
  const t = SAFARI_CLASSIC_THEMES[theme];

  // Safari Classic is always structural — content ends at toolbar boundary
  const bottomPosStyle = 'flex-shrink:0';

  const cornerStyle = screenCornerRadius > 0
    ? `border-bottom-left-radius:${screenCornerRadius}px;border-bottom-right-radius:${screenCornerRadius}px;`
    : '';

  // AddressBar — exact copy from MobileSafariChrome.tsx AddressBar sub-component
  // height: BAR (44), inner pill height: 36, borderRadius: 18
  const addressBar = `<div id="sc-address" style="position:relative;height:${SC_BAR}px;transition:height 0.22s cubic-bezier(0.2,0.9,0.3,1);overflow:hidden;" data-exp-h="${SC_BAR}" data-col-h="26">
    <div style="position:absolute;left:16px;top:0;bottom:0;display:flex;align-items:center;opacity:${t.labelOpacity};pointer-events:auto;">
      <span style="font-size:13px;font-family:${SC_FONT};font-weight:500;color:${t.urlLabel};white-space:nowrap;">aA</span>
    </div>
    <div style="position:absolute;left:44px;right:36px;top:0;bottom:0;display:flex;align-items:center;justify-content:center;">
      <div data-chrome-url style="display:flex;align-items:center;justify-content:center;height:36px;padding-left:16px;padding-right:16px;border-radius:18px;background:${t.urlBg};max-width:100%;cursor:text;">
        <span data-chrome-hostname style="font-size:14px;font-family:${SC_FONT};font-weight:400;color:${t.urlLabel};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${hostname}</span>
      </div>
    </div>
    <div data-chrome-action="reload" style="position:absolute;right:16px;top:0;bottom:0;display:flex;align-items:center;opacity:${t.reloadOpacity};cursor:pointer;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 3v6h-6M3 21v-6h6M3.5 14A9 9 0 0 1 3 12a9 9 0 0 1 15-6.7L21 8M20.5 10A9 9 0 0 1 21 12a9 9 0 0 1-15 6.7L3 16" stroke="${t.reloadStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
  </div>`;

  // NavToolbar — exact copy from MobileSafariChrome.tsx NavToolbar sub-component
  // height: BAR (44), 5 SVG icons with exact dimensions
  const navToolbar = `<div id="sc-nav" style="height:${SC_BAR}px;position:relative;transition:height 0.22s cubic-bezier(0.2,0.9,0.3,1);overflow:hidden;" data-exp-h="${SC_BAR}" data-col-h="0">
    <div style="position:absolute;inset:0;padding:0 24px;display:flex;align-items:center;justify-content:space-around;">
      <span data-chrome-action="back" style="cursor:pointer;"><svg width="24" height="24" viewBox="0 0 28 28" fill="none"><path d="M18 5L8 14l10 9" stroke="${t.tint}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span data-chrome-action="forward" style="cursor:pointer;"><svg width="24" height="24" viewBox="0 0 28 28" fill="none"><path d="M10 5l10 9-10 9" stroke="${t.disabled}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2v12" stroke="${t.tint}" stroke-width="1.8" stroke-linecap="round"/><path d="M8 6l4-4 4 4" stroke="${t.tint}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" stroke="${t.tint}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H10a2 2 0 0 1 2 2v16.5l-.5-.5c-1-1-2-1.5-3.5-1.5H6.5A2.5 2.5 0 0 1 4 16V4.5z" stroke="${t.tint}" stroke-width="1.6"/><path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H14a2 2 0 0 0-2 2v16.5l.5-.5c1-1 2-1.5 3.5-1.5h1.5A2.5 2.5 0 0 0 20 16V4.5z" stroke="${t.tint}" stroke-width="1.6"/></svg>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="14" height="14" rx="3" stroke="${t.tint}" stroke-width="1.7"/><path d="M7 7V5.5A2.5 2.5 0 0 1 9.5 3h9A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H17" stroke="${t.tint}" stroke-width="1.7" stroke-linecap="round"/></svg>
    </div>
  </div>`;

  // HomeIndicator — safe area below the toolbar should always match the toolbar bg
  const homeIndicator = safeAreaBottom > 0
    ? `<div class="safe-area-spacer" style="height:${safeAreaBottom}px;background:${t.bg};pointer-events:none;${cornerStyle}display:flex;align-items:center;justify-content:center;">
    <div class="home-pill" style="width:35%;height:5px;border-radius:100px;background:${t.pill};transition:opacity 0.35s cubic-bezier(0.2,0.9,0.3,1);"></div>
  </div>`
    : '';

  // ─── Flipped: address + nav both at bottom ────────────────────────
  if (flipped) {
    const bottomH = SC_BAR + SC_BAR + safeAreaBottom; // addressH + navH + indicatorH
    return {
      top: '',
      bottom: `<div id="sc-bottom-wrap" class="chrome-bar chrome-bottom" style="${bottomPosStyle};height:${bottomH}px;${cornerStyle}overflow:hidden;will-change:height;z-index:2;transition:height 0.22s cubic-bezier(0.2,0.9,0.3,1);" data-exp-h="${bottomH}" data-col-h="0">
        <div style="background:${t.bg};border-top:${t.border};">
          ${addressBar}
          ${navToolbar}
        </div>
        ${homeIndicator}
      </div>`,
    };
  }

  // ─── Normal: address at top (structural), nav at bottom ───────────
  const bottomH = SC_BAR + safeAreaBottom; // navH + indicatorH
  return {
    top: `<div class="chrome-bar chrome-top" style="flex-shrink:0;background:${t.bg};border-bottom:${t.border};overflow:hidden;">${addressBar}</div>`,
    bottom: `<div id="sc-bottom-wrap" class="chrome-bar chrome-bottom" style="${bottomPosStyle};height:${bottomH}px;${cornerStyle}overflow:hidden;will-change:height;z-index:2;transition:height 0.22s cubic-bezier(0.2,0.9,0.3,1);" data-exp-h="${bottomH}" data-col-h="0">
      <div style="background:${t.bg};border-top:${t.border};">${navToolbar}</div>
      ${homeIndicator}
    </div>`,
  };
}

// ---------------------------------------------------------------------------
// Mobile Chrome (Android)
// Source: MobileChromeChrome.tsx
// ---------------------------------------------------------------------------

const CHROME_MOBILE_THEMES = {
  dark: {
    barBg: '#202124',
    barBorder: 'none',
    urlBg: '#303134',
    urlText: '#BDC1C6',
    tabBorder: '#9AA0A6',
    tabText: '#9AA0A6',
    dotsFill: '#9AA0A6',
    iconStroke: '#9AA0A6',
    disabledStroke: '#5F6368',
    bottomBg: '#202124',
    bottomBorder: 'none',
    lockStroke: '#9AA0A6',
    pill: 'rgba(255,255,255,0.3)',
    urlInputText: '#E8EAED',
  },
  light: {
    barBg: '#ffffff',
    barBorder: 'none',
    urlBg: '#f1f3f4',
    urlText: '#202124',
    tabBorder: '#5F6368',
    tabText: '#5F6368',
    dotsFill: '#5F6368',
    iconStroke: '#5F6368',
    disabledStroke: '#DADCE0',
    bottomBg: '#ffffff',
    bottomBorder: 'none',
    lockStroke: '#5F6368',
    pill: 'rgba(0,0,0,0.25)',
    urlInputText: '#202124',
  },
};

export function buildMobileChromeChrome(hostname: string, theme: ChromeTheme, safeAreaBottom: number, flipped = false): { top: string; bottom: string } {
  const t = CHROME_MOBILE_THEMES[theme];

  // Address bar — 50px
  const addressBar = `<div style="flex-shrink:0;background:${t.barBg};height:50px;display:flex;align-items:center;gap:8px;padding:0 12px;">
    <div data-chrome-url style="flex:1;display:flex;align-items:center;border-radius:9999px;padding:6px 12px;background:${t.urlBg};cursor:text;">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${t.lockStroke}" stroke-width="2.5" stroke-linecap="round" style="margin-right:6px;flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span data-chrome-hostname style="font-size:13px;color:${t.urlText};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${hostname}</span>
    </div>
    <div style="flex-shrink:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:1.5px solid ${t.tabBorder};border-radius:5px;">
      <span style="font-size:10px;font-weight:500;color:${t.tabText};">1</span>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="${t.dotsFill}" style="flex-shrink:0;"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
  </div>`;

  // Navigation toolbar — 44px
  const navToolbar = `<div style="height:44px;background:${t.bottomBg};border-top:${t.bottomBorder};">
    <div style="display:flex;align-items:center;justify-content:space-around;height:44px;padding:0 16px;">
      <span data-chrome-action="back" style="cursor:pointer;display:flex;align-items:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${t.iconStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></span>
      <span data-chrome-action="forward" style="cursor:pointer;display:flex;align-items:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${t.disabledStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${t.iconStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${t.iconStroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${t.iconStroke}" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="1" width="14" height="14" rx="2"/></svg>
    </div>
  </div>`;

  // Home indicator — safe area below toolbar should always match the toolbar bg
  const homeIndicator = safeAreaBottom > 0
    ? `<div class="safe-area-spacer" style="height:${safeAreaBottom}px;background:${t.bottomBg};pointer-events:none;display:flex;align-items:center;justify-content:center;">
      <div class="home-pill" style="width:35%;height:5px;border-radius:100px;background:${t.pill};transition:opacity 0.35s cubic-bezier(0.2,0.9,0.3,1);"></div>
    </div>`
    : '';

  if (flipped) {
    // Flipped: address bar moves to bottom (above nav toolbar)
    const bottomH = 50 + 44 + safeAreaBottom; // addressH + navH + indicatorH
    const bottom = `<div id="gc-bottom-wrap" class="chrome-bar chrome-bottom" style="flex-shrink:0;height:${bottomH}px;overflow:hidden;will-change:height;z-index:2;transition:height 0.22s cubic-bezier(0.2,0.9,0.3,1);" data-exp-h="${bottomH}" data-col-h="0">
      ${addressBar}
      ${navToolbar}
      ${homeIndicator}
    </div>`;
    return { top: '', bottom };
  }

  // Normal: address bar at top, nav at bottom
  const bottomH = 44 + safeAreaBottom; // navH + indicatorH
  const top = `<div class="chrome-bar chrome-top" style="flex-shrink:0;">${addressBar}</div>`;
  const bottom = `<div id="gc-bottom-wrap" class="chrome-bar chrome-bottom" style="flex-shrink:0;height:${bottomH}px;overflow:hidden;will-change:height;z-index:2;transition:height 0.22s cubic-bezier(0.2,0.9,0.3,1);" data-exp-h="${bottomH}" data-col-h="0">
    ${navToolbar}
    ${homeIndicator}
  </div>`;

  return { top, bottom };
}

// ---------------------------------------------------------------------------
// Desktop Chrome
// ---------------------------------------------------------------------------

const DESKTOP_CHROME_THEMES = {
  dark: {
    tabBarBg: '#202124', activeTabBg: '#292A2D', addressBarBg: '#292A2D', urlPillBg: '#202124',
    addressBorder: '1px solid rgba(255,255,255,0.06)',
    faviconActive: '#4285F4', faviconInactive: '#5F6368',
    tabText: '#BDC1C6', inactiveTabText: '#5F6368', closeStroke: '#9AA0A6',
    newTabStroke: '#9AA0A6', navStroke: '#9AA0A6', navDisabled: '#5F6368',
    lockStroke: '#9AA0A6', urlText: '#BDC1C6', actionStroke: '#9AA0A6', dotsFill: '#9AA0A6',
  },
  light: {
    tabBarBg: '#DEE1E6', activeTabBg: '#FFFFFF', addressBarBg: '#FFFFFF', urlPillBg: '#F1F3F4',
    addressBorder: '1px solid rgba(0,0,0,0.08)',
    faviconActive: '#4285F4', faviconInactive: '#C4C7CC',
    tabText: '#202124', inactiveTabText: '#5F6368', closeStroke: '#5F6368',
    newTabStroke: '#5F6368', navStroke: '#5F6368', navDisabled: '#DADCE0',
    lockStroke: '#5F6368', urlText: '#202124', actionStroke: '#5F6368', dotsFill: '#5F6368',
  },
};

export function buildDesktopChromeChrome(hostname: string, _url: string, theme: ChromeTheme): string {
  const t = DESKTOP_CHROME_THEMES[theme];
  return `<div class="desktop-chrome" style="display:flex;flex-direction:column;flex-shrink:0;">
  <div style="display:flex;align-items:flex-end;padding:6px 8px 0;height:36px;background:${t.tabBarBg};">
    <div style="display:flex;align-items:center;gap:6px;padding:0 12px;height:28px;border-radius:8px 8px 0 0;background:${t.activeTabBg};">
      <div data-chrome-tab-favicon style="width:12px;height:12px;border-radius:50%;background:${t.faviconActive};flex-shrink:0;"></div>
      <span data-chrome-tab-title style="font-size:11px;color:${t.tabText};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">${hostname}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="${t.closeStroke}" stroke-width="1.2" style="flex-shrink:0;margin-left:4px;"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
    </div>
    <div style="display:flex;align-items:center;gap:6px;padding:0 12px;height:28px;border-radius:8px 8px 0 0;">
      <div style="width:12px;height:12px;border-radius:50%;background:${t.faviconInactive};flex-shrink:0;"></div>
      <span style="font-size:11px;color:${t.inactiveTabText};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;">New Tab</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${t.newTabStroke}" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;padding:0 8px;height:36px;background:${t.addressBarBg};border-bottom:${t.addressBorder};">
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
      <span data-chrome-action="back" style="cursor:pointer;display:flex;align-items:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.navStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></span>
      <span data-chrome-action="forward" style="cursor:pointer;display:flex;align-items:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.navDisabled}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
      <span data-chrome-action="reload" style="cursor:pointer;display:flex;align-items:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.navStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>
    </div>
    <div data-chrome-url style="flex:1;display:flex;align-items:center;border-radius:9999px;padding:4px 12px;background:${t.urlPillBg};cursor:text;">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${t.lockStroke}" stroke-width="2" stroke-linecap="round" style="margin-right:6px;flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span data-chrome-hostname style="font-size:11px;color:${t.urlText};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${hostname}</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.actionStroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.actionStroke}" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><circle cx="17" cy="17" r="4"/></svg>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="${t.dotsFill}"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
    </div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Desktop Edge
// ---------------------------------------------------------------------------

const DESKTOP_EDGE_THEMES = {
  dark: {
    tabBarBg: '#2B2B2B', activeTabBg: '#383838', addressBarBg: '#383838', urlPillBg: '#2B2B2B',
    addressBorder: '1px solid rgba(255,255,255,0.06)',
    faviconBg: '#E74C3C', faviconInactive: '#4A4A4A',
    tabText: '#D4D4D4', inactiveTabText: '#8A8A8A', closeStroke: '#8A8A8A',
    newTabStroke: '#8A8A8A', chevronStroke: '#8A8A8A',
    navStroke: '#8A8A8A', navDisabled: '#4A4A4A',
    lockStroke: '#8A8A8A', urlText: '#CCCCCC', actionStroke: '#8A8A8A', dotsFill: '#8A8A8A',
    chatBg: '#0078D4', chatText: '#FFFFFF', profileBg: '#4A8C5C',
  },
  light: {
    tabBarBg: '#E8EAED', activeTabBg: '#FFFFFF', addressBarBg: '#FFFFFF', urlPillBg: '#F3F3F3',
    addressBorder: '1px solid rgba(0,0,0,0.08)',
    faviconBg: '#E74C3C', faviconInactive: '#C4C4C4',
    tabText: '#1B1B1B', inactiveTabText: '#6A6A6A', closeStroke: '#6A6A6A',
    newTabStroke: '#6A6A6A', chevronStroke: '#6A6A6A',
    navStroke: '#6A6A6A', navDisabled: '#C4C4C4',
    lockStroke: '#6A6A6A', urlText: '#1B1B1B', actionStroke: '#6A6A6A', dotsFill: '#6A6A6A',
    chatBg: '#0078D4', chatText: '#FFFFFF', profileBg: '#4A8C5C',
  },
};

export function buildDesktopEdgeChrome(hostname: string, _url: string, theme: ChromeTheme): string {
  const t = DESKTOP_EDGE_THEMES[theme];
  return `<div class="desktop-chrome" style="display:flex;flex-direction:column;flex-shrink:0;">
  <div style="display:flex;align-items:center;padding:0 4px;height:36px;background:${t.tabBarBg};">
    <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="${t.chevronStroke}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4L5 6.5L7.5 4"/></svg>
    </div>
    <div style="display:flex;align-items:center;gap:6px;padding:0 12px;height:28px;max-width:220px;background:${t.activeTabBg};border-radius:6px 6px 0 0;">
      <div data-chrome-tab-favicon style="width:14px;height:14px;border-radius:50%;background:${t.faviconBg};flex-shrink:0;"></div>
      <span data-chrome-tab-title style="font-size:11px;color:${t.tabText};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${hostname}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="${t.closeStroke}" stroke-width="1.2" style="flex-shrink:0;margin-left:2px;"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${t.newTabStroke}" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>
    <div style="flex:1;"></div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;padding:0 8px;height:36px;background:${t.addressBarBg};border-bottom:${t.addressBorder};">
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
      <span data-chrome-action="back" style="cursor:pointer;display:flex;align-items:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${t.navStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg></span>
      <span data-chrome-action="forward" style="cursor:pointer;display:flex;align-items:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${t.navDisabled}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg></span>
      <span data-chrome-action="reload" style="cursor:pointer;display:flex;align-items:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.navStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>
    </div>
    <div data-chrome-url style="flex:1;display:flex;align-items:center;border-radius:6px;padding:4px 12px;background:${t.urlPillBg};cursor:text;">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${t.lockStroke}" stroke-width="2" stroke-linecap="round" style="margin-right:6px;flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span data-chrome-hostname style="font-size:11px;color:${t.urlText};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">https://${hostname}</span>
    </div>
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.actionStroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.actionStroke}" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      <div style="width:18px;height:18px;border-radius:50%;background:${t.profileBg};display:flex;align-items:center;justify-content:center;">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="rgba(255,255,255,0.9)"><circle cx="8" cy="5.5" r="3"/><path d="M2.5 14.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/></svg>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="${t.dotsFill}"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      <div style="display:flex;align-items:center;gap:4px;padding:0 8px;height:22px;border-radius:3px;background:${t.chatBg};">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="${t.chatText}"><path d="M8 1a7 7 0 0 0-5.2 11.6L1.5 15l2.9-1.2A7 7 0 1 0 8 1z"/></svg>
        <span style="font-size:10px;font-weight:600;color:${t.chatText};font-family:'Segoe UI Variable','Segoe UI',system-ui,sans-serif;">Chat</span>
      </div>
    </div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function buildBrowserChromeHtml(
  chrome: BrowserChromeType,
  theme: ChromeTheme,
  hostname: string,
  url: string,
  flipped: boolean,
  safeAreaBottom: number,
  hasBottomNav: boolean,
  isDesktop: boolean,
  screenCornerRadius: number = 0,
  pageBackgroundColor?: string,
): { top: string; bottom: string } {
  if (chrome === 'none') { return { top: '', bottom: '' }; }

  if (isDesktop) {
    if (chrome === 'chrome') {
      return { top: buildDesktopChromeChrome(hostname, url, theme), bottom: '' };
    }
    if (chrome === 'edge') {
      return { top: buildDesktopEdgeChrome(hostname, url, theme), bottom: '' };
    }
    return { top: '', bottom: '' };
  }

  // Mobile — hasBottomNav affects Safari variants only (overlay vs flex positioning)
  // Chrome Android always uses overlay positioning regardless of hasBottomNav
  if (chrome === 'safari') {
    return { top: '', bottom: buildSafariModernChrome(hostname, theme, safeAreaBottom, hasBottomNav, screenCornerRadius, pageBackgroundColor) };
  }
  if (chrome === 'safari-classic') {
    return buildSafariClassicChrome(hostname, theme, flipped, safeAreaBottom, hasBottomNav, screenCornerRadius);
  }
  if (chrome === 'google-chrome') {
    return buildMobileChromeChrome(hostname, theme, safeAreaBottom, flipped);
  }

  return { top: '', bottom: '' };
}
