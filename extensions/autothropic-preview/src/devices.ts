/**
 * Device viewports, hardware traits, preview configuration types, and named presets.
 * Ported from the original autothropic app (device-viewports.ts + preview-presets.ts).
 */

export type DeviceCategory = 'phone' | 'tablet' | 'laptop';
export type DeviceOS = 'ios' | 'android' | 'ipados' | 'macos' | 'windows';

export interface PhoneTraits {
  screenCornerRadius: number;
  safeAreaTop: number;
  safeAreaBottom: number;
  hasDynamicIsland: boolean;
  hasHomeButton: boolean;
  bezelWidth: number;
  dynamicIslandWidth: number;
  dynamicIslandHeight: number;
  dynamicIslandTop: number;
  deviceCornerRadius: number;
}

export interface DeviceProfile {
  id: string;
  name: string;
  category: DeviceCategory;
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent: string;
  traits: PhoneTraits | null;
}

// ---------------------------------------------------------------------------
// Preview configuration types (from preview-presets.ts)
// ---------------------------------------------------------------------------

export type PreviewMode = 'mobile' | 'desktop' | 'custom';
export type MobileBrowser = 'safari' | 'safari-classic' | 'google-chrome';
export type DesktopBrowser = 'chrome' | 'edge';
export type BrowserChromeType = MobileBrowser | DesktopBrowser | 'none';
export type OsFrameType = 'macos' | 'windows-10' | 'windows-11' | 'none';
export type ChromeTheme = 'dark' | 'light';
export type IPhoneScreenType = 'island' | 'notch';

export interface PreviewConfig {
  mode: PreviewMode;
  deviceId: string;
  browserChrome: BrowserChromeType;
  chromeTheme: ChromeTheme;
  iphoneScreenType: IPhoneScreenType;
  osFrame: OsFrameType;
  fullscreen: boolean;
  showTaskbar: boolean;
  orientation: 'portrait' | 'landscape';
  safariClassicFlipped: boolean;
  showDebugOverlay: boolean;
  bottomNavOverride: 'auto' | 'on' | 'off';
  customWidth: number;
  customHeight: number;
}

export interface PreviewPreset {
  id: string;
  label: string;
  config: Partial<PreviewConfig>;
}

// ---------------------------------------------------------------------------
// Chrome & OS frame dimension constants
// ---------------------------------------------------------------------------

export const CHROME_HEIGHTS: Record<string, { top: number; bottom: number }> = {
  'mobile-safari':         { top: 0,  bottom: 52 },
  'mobile-safari-classic': { top: 44, bottom: 0 },
  'mobile-google-chrome':  { top: 50, bottom: 44 },
  'desktop-chrome':        { top: 72, bottom: 0 },
  'desktop-edge':          { top: 72, bottom: 0 },
  'none':                  { top: 0,  bottom: 0 },
};

export const OS_FRAME_HEIGHTS: Record<OsFrameType, number> = {
  macos: 28,
  'windows-10': 32,
  'windows-11': 0,
  none: 0,
};

export const TASKBAR_HEIGHTS: Record<string, { top: number; bottom: number }> = {
  macos:        { top: 24, bottom: 70 },
  'windows-10': { top: 0,  bottom: 40 },
  'windows-11': { top: 0,  bottom: 48 },
};

// ---------------------------------------------------------------------------
// Phone trait presets
// ---------------------------------------------------------------------------

const TRAITS_MODERN_DI_62: PhoneTraits = {
  screenCornerRadius: 47, safeAreaTop: 62, safeAreaBottom: 34,
  hasDynamicIsland: true, hasHomeButton: false, bezelWidth: 4,
  dynamicIslandWidth: 126, dynamicIslandHeight: 37, dynamicIslandTop: 11,
  deviceCornerRadius: 55,
};

const TRAITS_MODERN_DI_59: PhoneTraits = {
  screenCornerRadius: 47, safeAreaTop: 59, safeAreaBottom: 34,
  hasDynamicIsland: true, hasHomeButton: false, bezelWidth: 4,
  dynamicIslandWidth: 126, dynamicIslandHeight: 37, dynamicIslandTop: 11,
  deviceCornerRadius: 55,
};

const TRAITS_16E: PhoneTraits = {
  screenCornerRadius: 47, safeAreaTop: 59, safeAreaBottom: 34,
  hasDynamicIsland: false, hasHomeButton: false, bezelWidth: 4,
  dynamicIslandWidth: 0, dynamicIslandHeight: 0, dynamicIslandTop: 0,
  deviceCornerRadius: 55,
};

const TRAITS_SE3: PhoneTraits = {
  screenCornerRadius: 0, safeAreaTop: 20, safeAreaBottom: 0,
  hasDynamicIsland: false, hasHomeButton: true, bezelWidth: 0,
  dynamicIslandWidth: 0, dynamicIslandHeight: 0, dynamicIslandTop: 0,
  deviceCornerRadius: 28,
};

const TRAITS_ANDROID: PhoneTraits = {
  screenCornerRadius: 20, safeAreaTop: 24, safeAreaBottom: 16,
  hasDynamicIsland: false, hasHomeButton: false, bezelWidth: 4,
  dynamicIslandWidth: 0, dynamicIslandHeight: 0, dynamicIslandTop: 0,
  deviceCornerRadius: 28,
};

// ---------------------------------------------------------------------------
// UA strings
// ---------------------------------------------------------------------------

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';
const UA_IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function phone(id: string, name: string, w: number, h: number, dpr: number, traits: PhoneTraits, ua = UA_IOS): DeviceProfile {
  return { id, name, category: 'phone', width: w, height: h, deviceScaleFactor: dpr, userAgent: ua, traits };
}
function tablet(id: string, name: string, w: number, h: number, dpr: number): DeviceProfile {
  return { id, name, category: 'tablet', width: w, height: h, deviceScaleFactor: dpr, userAgent: UA_IPAD, traits: null };
}
function laptop(id: string, name: string, w: number, h: number, dpr: number): DeviceProfile {
  return { id, name, category: 'laptop', width: w, height: h, deviceScaleFactor: dpr, userAgent: UA_DESKTOP, traits: null };
}

// ---------------------------------------------------------------------------
// Full device catalog
// ---------------------------------------------------------------------------

export const IPHONES: DeviceProfile[] = [
  phone('iphone-17-pro-max',  'iPhone 17 Pro Max', 440, 956, 3, TRAITS_MODERN_DI_62),
  phone('iphone-17-pro',      'iPhone 17 Pro',     402, 874, 3, TRAITS_MODERN_DI_62),
  phone('iphone-17',          'iPhone 17',         402, 874, 3, TRAITS_MODERN_DI_62),
  phone('iphone-17-air',      'iPhone 17 Air',     420, 912, 3, TRAITS_MODERN_DI_62),
  phone('iphone-16-pro-max',  'iPhone 16 Pro Max', 440, 956, 3, TRAITS_MODERN_DI_62),
  phone('iphone-16-pro',      'iPhone 16 Pro',     402, 874, 3, TRAITS_MODERN_DI_62),
  phone('iphone-16',          'iPhone 16',         393, 852, 3, TRAITS_MODERN_DI_62),
  phone('iphone-16-plus',     'iPhone 16 Plus',    430, 932, 3, TRAITS_MODERN_DI_62),
  phone('iphone-15-pro-max',  'iPhone 15 Pro Max', 430, 932, 3, TRAITS_MODERN_DI_59),
  phone('iphone-15-pro',      'iPhone 15 Pro',     393, 852, 3, TRAITS_MODERN_DI_59),
  phone('iphone-15',          'iPhone 15',         393, 852, 3, TRAITS_MODERN_DI_59),
  phone('iphone-15-plus',     'iPhone 15 Plus',    430, 932, 3, TRAITS_MODERN_DI_59),
  phone('iphone-16e',         'iPhone 16e (SE 4)', 390, 844, 3, TRAITS_16E),
  phone('iphone-se3',         'iPhone SE (3rd)',   375, 667, 2, TRAITS_SE3),
];

export const ANDROID_PHONES: DeviceProfile[] = [
  phone('galaxy-s25-ultra', 'Galaxy S25 Ultra', 412, 891, 3.5, TRAITS_ANDROID, UA_ANDROID),
  phone('galaxy-s25-plus',  'Galaxy S25+',      412, 891, 3.5, TRAITS_ANDROID, UA_ANDROID),
  phone('galaxy-s25',       'Galaxy S25',       360, 780, 3,   TRAITS_ANDROID, UA_ANDROID),
  phone('galaxy-s24-ultra', 'Galaxy S24 Ultra', 412, 891, 3.5, TRAITS_ANDROID, UA_ANDROID),
  phone('galaxy-s24',       'Galaxy S24',       360, 780, 3,   TRAITS_ANDROID, UA_ANDROID),
  phone('pixel-9-pro-xl',   'Pixel 9 Pro XL',  414, 921, 3.25,TRAITS_ANDROID, UA_ANDROID),
  phone('pixel-9-pro',      'Pixel 9 Pro',     410, 914, 3.125,TRAITS_ANDROID, UA_ANDROID),
  phone('pixel-9',          'Pixel 9',         412, 923, 2.625,TRAITS_ANDROID, UA_ANDROID),
  phone('pixel-8-pro',      'Pixel 8 Pro',     412, 921, 3.25, TRAITS_ANDROID, UA_ANDROID),
  phone('pixel-8',          'Pixel 8',         412, 915, 2.625,TRAITS_ANDROID, UA_ANDROID),
];

export const IPADS: DeviceProfile[] = [
  tablet('ipad-pro-13',  'iPad Pro 13"',          1032, 1376, 2),
  tablet('ipad-pro-11',  'iPad Pro 11"',          834,  1210, 2),
  tablet('ipad-air-13',  'iPad Air 13"',          1024, 1366, 2),
  tablet('ipad-air-11',  'iPad Air 11"',          820,  1180, 2),
  tablet('ipad-mini',    'iPad mini (7th)',        744,  1133, 2),
];

export const LAPTOPS: DeviceProfile[] = [
  laptop('macbook-pro-16', 'MacBook Pro 16"', 1728, 1117, 2),
  laptop('macbook-pro-14', 'MacBook Pro 14"', 1512, 982,  2),
  laptop('macbook-air-15', 'MacBook Air 15"', 1710, 1107, 2),
  laptop('macbook-air-13', 'MacBook Air 13"', 1470, 956,  2),
  laptop('desktop-1080p',  'Desktop (1080p)',  1920, 1080, 1),
];

export const DEVICES: DeviceProfile[] = [
  ...IPHONES,
  ...ANDROID_PHONES,
  ...IPADS,
  ...LAPTOPS,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getDevice(id: string): DeviceProfile {
  return DEVICES.find(d => d.id === id) ?? DEVICES[0];
}

export function getDeviceOS(device: DeviceProfile): DeviceOS {
  if (device.userAgent.includes('iPhone') || device.userAgent.includes('iPad')) {
    return device.category === 'tablet' ? 'ipados' : 'ios';
  }
  if (device.userAgent.includes('Android')) { return 'android'; }
  if (device.userAgent.includes('Macintosh')) { return 'macos'; }
  return 'windows';
}

export function isModernIphone(device: DeviceProfile): boolean {
  return device.category === 'phone'
    && getDeviceOS(device) === 'ios'
    && !device.name.includes('SE (3rd');
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  mode: 'mobile',
  deviceId: 'iphone-16-pro',
  browserChrome: 'safari',
  chromeTheme: 'dark',
  iphoneScreenType: 'island',
  osFrame: 'none',
  fullscreen: false,
  showTaskbar: true,
  orientation: 'portrait',
  safariClassicFlipped: false,
  showDebugOverlay: false,
  bottomNavOverride: 'auto',
  customWidth: 1280,
  customHeight: 720,
};

// ---------------------------------------------------------------------------
// Named presets
// ---------------------------------------------------------------------------

export const ALL_PRESETS: PreviewPreset[] = [
  {
    id: 'iphone-17-pro-max', label: 'iPhone 17 Pro Max',
    config: { mode: 'mobile', deviceId: 'iphone-17-pro-max', browserChrome: 'safari', osFrame: 'none', orientation: 'portrait' },
  },
  {
    id: 'iphone-16-pro', label: 'iPhone 16 Pro',
    config: { mode: 'mobile', deviceId: 'iphone-16-pro', browserChrome: 'safari', osFrame: 'none', orientation: 'portrait' },
  },
  {
    id: 'iphone-16', label: 'iPhone 16',
    config: { mode: 'mobile', deviceId: 'iphone-16', browserChrome: 'safari', osFrame: 'none', orientation: 'portrait' },
  },
  {
    id: 'iphone-se', label: 'iPhone SE',
    config: { mode: 'mobile', deviceId: 'iphone-se3', browserChrome: 'safari', osFrame: 'none', orientation: 'portrait' },
  },
  {
    id: 'galaxy-s25-ultra', label: 'Galaxy S25 Ultra',
    config: { mode: 'mobile', deviceId: 'galaxy-s25-ultra', browserChrome: 'google-chrome', osFrame: 'none', orientation: 'portrait' },
  },
  {
    id: 'pixel-9-pro', label: 'Pixel 9 Pro',
    config: { mode: 'mobile', deviceId: 'pixel-9-pro', browserChrome: 'google-chrome', osFrame: 'none', orientation: 'portrait' },
  },
  {
    id: 'macbook-pro-16-macos-chrome', label: 'MacBook Pro 16" — macOS Chrome',
    config: { mode: 'desktop', deviceId: 'macbook-pro-16', browserChrome: 'chrome', osFrame: 'macos', orientation: 'portrait' },
  },
  {
    id: 'macbook-air-13-macos-chrome', label: 'MacBook Air 13" — macOS Chrome',
    config: { mode: 'desktop', deviceId: 'macbook-air-13', browserChrome: 'chrome', osFrame: 'macos', orientation: 'portrait' },
  },
  {
    id: 'macbook-pro-14-fullscreen-chrome', label: 'MacBook Pro 14" — Fullscreen Chrome',
    config: { mode: 'desktop', deviceId: 'macbook-pro-14', browserChrome: 'chrome', osFrame: 'none', fullscreen: true, orientation: 'portrait' },
  },
  {
    id: 'generic-1080p-windows-edge', label: '1080p — Windows Edge',
    config: { mode: 'desktop', deviceId: 'desktop-1080p', browserChrome: 'edge', osFrame: 'windows-11', orientation: 'portrait' },
  },
];
