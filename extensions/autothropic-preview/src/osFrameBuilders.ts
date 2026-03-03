/**
 * OS frame, title bar, and taskbar HTML builders — pixel-accurate replicas
 * of the original autothropic app's OsFrame.tsx, MacOSTaskbar.tsx, and
 * WindowsTaskbar.tsx components.
 */

import type { OsFrameType, PreviewConfig } from './devices';

// ---------------------------------------------------------------------------
// Time helpers (static snapshot — no live clock in webview)
// ---------------------------------------------------------------------------

function currentTime12(): string {
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function currentDate(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function macMenuTime(): string {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}  ${h}:${m} ${ampm}`;
}

// ===================================================================
// OS FRAMES
// ===================================================================

// ---------------------------------------------------------------------------
// macOS Frame — 28px titlebar with traffic lights
// ---------------------------------------------------------------------------

function buildMacOsFrame(title: string): string {
  return `<div class="os-frame macos-frame" style="display:flex;flex-direction:column;flex-shrink:0;">
  <div style="height:28px;background:#1E1E1E;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;padding:0 12px;position:relative;flex-shrink:0;">
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
      <div style="width:12px;height:12px;border-radius:50%;background:#FF5F57;border:0.5px solid #E0443E;"></div>
      <div style="width:12px;height:12px;border-radius:50%;background:#FEBC2E;border:0.5px solid #DEA123;"></div>
      <div style="width:12px;height:12px;border-radius:50%;background:#28C840;border:0.5px solid #1AAB29;"></div>
    </div>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">
      <span style="font-size:12px;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">${title}</span>
    </div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Windows 11 Frame — overlaid controls on top-right (no separate title bar)
// ---------------------------------------------------------------------------

function buildWindows11Frame(): string {
  return `<div class="os-frame win11-frame-controls" style="position:absolute;top:0;right:0;display:flex;flex-shrink:0;height:36px;z-index:10;">
  <div style="width:46px;height:100%;display:flex;align-items:center;justify-content:center;">
    <svg width="10" height="1" viewBox="0 0 10 1" fill="#999"><rect width="10" height="1"/></svg>
  </div>
  <div style="width:46px;height:100%;display:flex;align-items:center;justify-content:center;">
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#999" stroke-width="1"><rect x="0.5" y="0.5" width="9" height="9" rx="1"/></svg>
  </div>
  <div style="width:46px;height:100%;display:flex;align-items:center;justify-content:center;">
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#999" stroke-width="1.2"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Windows 10 Frame — 32px titlebar with squared controls
// ---------------------------------------------------------------------------

function buildWindows10Frame(title: string): string {
  return `<div class="os-frame win10-frame" style="display:flex;flex-direction:column;flex-shrink:0;">
  <div style="height:32px;background:#1A1A1A;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;position:relative;flex-shrink:0;">
    <div style="display:flex;align-items:center;padding:0 12px;height:100%;">
      <span style="font-size:12px;color:#CCC;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'Segoe UI',system-ui,sans-serif;">${title}</span>
    </div>
    <div style="flex:1;"></div>
    <div style="display:flex;height:100%;flex-shrink:0;">
      <div style="width:46px;height:100%;display:flex;align-items:center;justify-content:center;">
        <svg width="10" height="1" viewBox="0 0 10 1" fill="#AAA"><rect width="10" height="1"/></svg>
      </div>
      <div style="width:46px;height:100%;display:flex;align-items:center;justify-content:center;">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#AAA" stroke-width="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
      </div>
      <div style="width:46px;height:100%;display:flex;align-items:center;justify-content:center;">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#AAA" stroke-width="1.2"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * Build the OS frame HTML for the given variant.
 * - macOS: 28px titlebar with traffic lights
 * - Windows 10: 32px titlebar with squared controls
 * - Windows 11: overlaid controls (absolute positioned, no extra height)
 */
export function buildOsFrameHtml(variant: OsFrameType, title: string): string {
  if (variant === 'macos') { return buildMacOsFrame(title); }
  if (variant === 'windows-10') { return buildWindows10Frame(title); }
  if (variant === 'windows-11') { return buildWindows11Frame(); }
  return '';
}

// ===================================================================
// TASKBARS
// ===================================================================

// ---------------------------------------------------------------------------
// macOS Menu Bar — 24px, pixel-accurate dark-mode rendering
// ---------------------------------------------------------------------------

function buildMacOSMenuBar(): string {
  const time = macMenuTime();
  return `<div class="taskbar macos-menubar" style="width:100%;height:24px;background:rgba(30,30,30,0.94);backdrop-filter:blur(20px);display:flex;align-items:center;justify-content:space-between;padding:0 8px;border-bottom:0.5px solid rgba(255,255,255,0.08);flex-shrink:0;">
  <div style="display:flex;align-items:center;gap:14px;">
    <svg width="12" height="14" viewBox="0 0 14 17" fill="rgba(255,255,255,0.85)"><path d="M13.2 5.8c-.08.05-1.58.93-1.57 2.73.02 2.15 1.84 2.9 1.86 2.91-.01.06-.29 1.02-.96 2.02-.58.87-1.18 1.73-2.13 1.75-.93.02-1.23-.56-2.3-.56s-1.4.54-2.28.58c-.92.03-1.61-.94-2.2-1.8C2.38 11.64 1.5 8.84 2.76 6.96c.63-.94 1.74-1.53 2.95-1.55.9-.02 1.74.62 2.29.62.55 0 1.57-.76 2.65-.65.45.02 1.72.19 2.53 1.42zM9.87 3.58c.49-.6.82-1.44.73-2.28-.71.03-1.56.48-2.06 1.08-.46.53-.86 1.38-.75 2.2.79.06 1.59-.41 2.08-1z"/></svg>
    <span style="font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.1px;">Finder</span>
    <span style="font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;font-weight:400;color:rgba(255,255,255,0.85);letter-spacing:0.1px;">File</span>
    <span style="font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;font-weight:400;color:rgba(255,255,255,0.85);letter-spacing:0.1px;">Edit</span>
    <span style="font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;font-weight:400;color:rgba(255,255,255,0.85);letter-spacing:0.1px;">View</span>
    <span style="font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;font-weight:400;color:rgba(255,255,255,0.85);letter-spacing:0.1px;">Go</span>
    <span style="font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;font-weight:400;color:rgba(255,255,255,0.85);letter-spacing:0.1px;">Window</span>
    <span style="font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;font-weight:400;color:rgba(255,255,255,0.85);letter-spacing:0.1px;">Help</span>
  </div>
  <div style="display:flex;align-items:center;gap:10px;">
    <svg width="20" height="10" viewBox="0 0 22 10" fill="none"><rect x="0.5" y="0.5" width="18" height="9" rx="2" stroke="rgba(255,255,255,0.5)" stroke-width="0.8"/><rect x="2" y="2" width="14" height="6" rx="1" fill="rgba(255,255,255,0.6)"/><path d="M19.5 3.5v3c.6-.2 1-.8 1-1.5s-.4-1.3-1-1.5z" fill="rgba(255,255,255,0.35)"/></svg>
    <svg width="12" height="10" viewBox="0 0 16 13" fill="none"><circle cx="8" cy="11.5" r="1.2" fill="rgba(255,255,255,0.7)"/><path d="M5.8 9.2 A3 3 0 0 1 10.2 9.2" stroke="rgba(255,255,255,0.7)" stroke-width="1.6" stroke-linecap="round"/><path d="M3.3 6.5 A7 7 0 0 1 12.7 6.5" stroke="rgba(255,255,255,0.7)" stroke-width="1.6" stroke-linecap="round"/><path d="M1 3.8 A14 14 0 0 1 15 3.8" stroke="rgba(255,255,255,0.7)" stroke-width="1.6" stroke-linecap="round"/></svg>
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="rgba(255,255,255,0.6)" stroke-width="1.3"/><line x1="9.5" y1="9.5" x2="13" y2="13" stroke="rgba(255,255,255,0.6)" stroke-width="1.3" stroke-linecap="round"/></svg>
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1.5" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><rect x="8" y="1" width="5" height="5" rx="1.5" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><rect x="1" y="8" width="5" height="5" rx="1.5" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><rect x="8" y="8" width="5" height="5" rx="1.5" stroke="rgba(255,255,255,0.5)" stroke-width="1"/></svg>
    <span style="font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;font-weight:500;color:rgba(255,255,255,0.85);letter-spacing:0.2px;">${time}</span>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// macOS Dock — 70px, dark-mode with 8 app icons + SVG glyphs
// ---------------------------------------------------------------------------

interface DockApp {
  color: string;
  glyph: string;
}

const DOCK_APPS: DockApp[] = [
  // Finder
  { color: '#1B85EF', glyph: '<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="2" fill="rgba(255,255,255,0.9)"/><circle cx="6.5" cy="6" r="1.2" fill="#1B85EF"/><circle cx="9.5" cy="6" r="1.2" fill="#1B85EF"/><path d="M5 10c1 1.5 5 1.5 6 0" stroke="#1B85EF" stroke-width="1" stroke-linecap="round"/></svg>' },
  // Safari
  { color: '#0070FF', glyph: '<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.9)" stroke-width="0.8"/><path d="M8 3L10.5 10.5 3 8z" fill="rgba(255,100,100,0.9)"/><path d="M8 13L5.5 5.5 13 8z" fill="rgba(255,255,255,0.9)"/></svg>' },
  // Messages
  { color: '#34C759', glyph: '<svg width="20" height="20" viewBox="0 0 16 16" fill="rgba(255,255,255,0.9)"><path d="M3 3h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8l-3 2.5V12H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>' },
  // Mail
  { color: '#007AFF', glyph: '<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="rgba(255,255,255,0.9)" stroke-width="1"/><path d="M1 5l7 4 7-4" stroke="rgba(255,255,255,0.9)" stroke-width="1" stroke-linejoin="round"/></svg>' },
  // Music
  { color: '#FF3B30', glyph: '<svg width="20" height="20" viewBox="0 0 16 16" fill="rgba(255,255,255,0.9)"><path d="M12 2v9.5a2 2 0 1 1-1-1.73V4.5L6 5.5v7a2 2 0 1 1-1-1.73V3.5L12 2z"/></svg>' },
  // Photos
  { color: '#A855F7', glyph: '<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/><circle cx="8" cy="8" r="2" fill="rgba(255,255,255,0.9)"/></svg>' },
  // Terminal
  { color: '#1C1C1E', glyph: '<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M3 4l4 4-4 4" stroke="#34C759" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="9" y1="12" x2="13" y2="12" stroke="#34C759" stroke-width="1.5" stroke-linecap="round"/></svg>' },
  // Settings
  { color: '#636366', glyph: '<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/><path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.1 3.1l1 1M11.9 11.9l1 1M12.9 3.1l-1 1M4.1 11.9l-1 1" stroke="rgba(255,255,255,0.7)" stroke-width="1.2" stroke-linecap="round"/></svg>' },
];

function buildMacOSDock(): string {
  const iconSize = 40;
  const iconR = Math.round(iconSize * 0.22);

  let icons = '';
  for (let i = 0; i < DOCK_APPS.length; i++) {
    // Divider before last 2 items (recent apps)
    if (i === DOCK_APPS.length - 2) {
      icons += `<div style="width:1px;height:${iconSize * 0.6}px;background:rgba(255,255,255,0.15);margin:0 2px;flex-shrink:0;"></div>`;
    }
    const app = DOCK_APPS[i];
    icons += `<div style="position:relative;width:${iconSize}px;height:${iconSize}px;flex-shrink:0;">
      <div style="width:${iconSize}px;height:${iconSize}px;border-radius:${iconR}px;background:${app.color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.3);border:0.5px solid rgba(255,255,255,0.08);">
        ${app.glyph}
      </div>
      <div style="position:absolute;bottom:-3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:2px;background:rgba(255,255,255,0.5);"></div>
    </div>`;
  }

  return `<div class="taskbar macos-dock" style="width:100%;height:70px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;flex-shrink:0;">
  <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:16px;background:rgba(50,50,50,0.55);backdrop-filter:blur(20px);border:0.5px solid rgba(255,255,255,0.12);">
    ${icons}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Windows 10 Taskbar — 40px, dark mode
// ---------------------------------------------------------------------------

function buildWindows10Taskbar(): string {
  const time = currentTime12();
  const date = currentDate();
  return `<div class="taskbar win10-taskbar" style="width:100%;height:40px;background:#1F1F1F;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
  <div style="display:flex;align-items:center;height:100%;">
    <div style="width:44px;height:100%;display:flex;align-items:center;justify-content:center;">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="#0078D7"><rect x="0" y="0" width="7.2" height="7.2"/><rect x="8.4" y="0" width="7.6" height="7.2"/><rect x="0" y="8.4" width="7.2" height="7.6"/><rect x="8.4" y="8.4" width="7.6" height="7.6"/></svg>
    </div>
    <div style="display:flex;align-items:center;height:100%;width:200px;padding:0 8px;">
      <div style="display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 10px;background:#2D2D2D;border:1px solid #3D3D3D;">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/><line x1="9.5" y1="9.5" x2="13" y2="13" stroke="rgba(255,255,255,0.5)" stroke-width="1.2" stroke-linecap="round"/></svg>
        <span style="font-size:12px;color:rgba(255,255,255,0.4);font-family:'Segoe UI',system-ui,sans-serif;">Type here to search</span>
      </div>
    </div>
    <div style="width:44px;height:100%;display:flex;align-items:center;justify-content:center;">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="0.5" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><rect x="9" y="1" width="6" height="6" rx="0.5" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><rect x="1" y="9" width="6" height="6" rx="0.5" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><rect x="9" y="9" width="6" height="6" rx="0.5" stroke="rgba(255,255,255,0.6)" stroke-width="1"/></svg>
    </div>
    <div style="width:1px;height:20px;background:rgba(255,255,255,0.08);margin:0 2px;flex-shrink:0;"></div>
    <div style="width:44px;height:100%;display:flex;align-items:center;justify-content:center;position:relative;">
      <div style="width:24px;height:24px;border-radius:2px;background:#2D7ADA;display:flex;align-items:center;justify-content:center;">
        <div style="width:12px;height:12px;border-radius:1px;background:rgba(255,255,255,0.3);"></div>
      </div>
      <div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:12px;height:2px;border-radius:1px;background:#0078D7;"></div>
    </div>
    <div style="width:44px;height:100%;display:flex;align-items:center;justify-content:center;">
      <div style="width:24px;height:24px;border-radius:2px;background:#2B579A;display:flex;align-items:center;justify-content:center;">
        <div style="width:12px;height:12px;border-radius:1px;background:rgba(255,255,255,0.3);"></div>
      </div>
    </div>
    <div style="width:44px;height:100%;display:flex;align-items:center;justify-content:center;">
      <div style="width:24px;height:24px;border-radius:2px;background:#217346;display:flex;align-items:center;justify-content:center;">
        <div style="width:12px;height:12px;border-radius:1px;background:rgba(255,255,255,0.3);"></div>
      </div>
    </div>
    <div style="width:44px;height:100%;display:flex;align-items:center;justify-content:center;">
      <div style="width:24px;height:24px;border-radius:2px;background:#3C3C3C;display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1H5l1.5 1.5h5A1.5 1.5 0 0 1 13 4v5.5A1.5 1.5 0 0 1 11.5 11h-9A1.5 1.5 0 0 1 1 9.5v-7z" fill="#FFB900"/></svg>
      </div>
    </div>
  </div>
  <div style="display:flex;align-items:center;height:100%;">
    <div style="width:32px;height:100%;display:flex;align-items:center;justify-content:center;">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 6L4 2l2 4" stroke="rgba(255,255,255,0.5)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div style="width:1px;height:20px;background:rgba(255,255,255,0.08);margin:0 2px;flex-shrink:0;"></div>
    <div style="width:28px;height:100%;display:flex;align-items:center;justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 16 13" fill="none"><circle cx="8" cy="11.5" r="1.2" fill="rgba(255,255,255,0.6)"/><path d="M5.8 9.2 A3 3 0 0 1 10.2 9.2" stroke="rgba(255,255,255,0.6)" stroke-width="1.4" stroke-linecap="round"/><path d="M3.3 6.5 A7 7 0 0 1 12.7 6.5" stroke="rgba(255,255,255,0.6)" stroke-width="1.4" stroke-linecap="round"/></svg>
    </div>
    <div style="width:28px;height:100%;display:flex;align-items:center;justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 6v4h3l4 3V3L5 6H2z" fill="rgba(255,255,255,0.6)"/><path d="M11 5.5c.7.7 1 1.5 1 2.5s-.3 1.8-1 2.5" stroke="rgba(255,255,255,0.5)" stroke-width="1" stroke-linecap="round"/></svg>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:center;padding:0 12px;height:100%;min-width:70px;">
      <span style="font-size:11px;color:rgba(255,255,255,0.85);font-family:'Segoe UI',system-ui,sans-serif;line-height:14px;">${time}</span>
      <span style="font-size:11px;color:rgba(255,255,255,0.85);font-family:'Segoe UI',system-ui,sans-serif;line-height:14px;">${date}</span>
    </div>
    <div style="width:32px;height:100%;display:flex;align-items:center;justify-content:center;">
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M4.5 1.5a1.5 1.5 0 0 1 3 0C9 2.5 10 4 10 6.5v2l1 1.5H1L2 8.5v-2C2 4 3 2.5 4.5 1.5z" stroke="rgba(255,255,255,0.5)" stroke-width="0.8"/><path d="M4.5 11c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5" stroke="rgba(255,255,255,0.5)" stroke-width="0.8"/></svg>
    </div>
    <div style="width:6px;height:100%;border-left:1px solid rgba(255,255,255,0.08);"></div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Windows 11 Taskbar — 48px, centered layout, rounded/translucent
// ---------------------------------------------------------------------------

function buildWindows11Taskbar(): string {
  const time = currentTime12();
  const date = currentDate();
  return `<div class="taskbar win11-taskbar" style="width:100%;height:48px;background:rgba(32,32,32,0.92);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;">
  <div style="display:flex;align-items:center;gap:2px;">
    <div style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="#0078D7"><rect x="1" y="1" width="7.5" height="7.5" rx="1.5"/><rect x="9.5" y="1" width="7.5" height="7.5" rx="1.5"/><rect x="1" y="9.5" width="7.5" height="7.5" rx="1.5"/><rect x="9.5" y="9.5" width="7.5" height="7.5" rx="1.5"/></svg>
    </div>
    <div style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="rgba(255,255,255,0.7)" stroke-width="1.3"/><line x1="10.5" y1="10.5" x2="14" y2="14" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" stroke-linecap="round"/></svg>
    </div>
    <div style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="rgba(255,255,255,0.6)" stroke-width="1"/></svg>
    </div>
    <div style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="14" rx="1.5" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="rgba(255,255,255,0.5)" stroke-width="1"/></svg>
    </div>
    <div style="width:1px;height:20px;background:rgba(255,255,255,0.08);margin:0 4px;flex-shrink:0;"></div>
    <div style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;position:relative;">
      <div style="width:22px;height:22px;border-radius:4px;background:#2D7ADA;display:flex;align-items:center;justify-content:center;">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1C3.24 1 1 3.24 1 6s2.24 5 5 5 5-2.24 5-5S8.76 1 6 1zm.5 8.5c-.4.2-.9.3-1.5.3-2 0-3.5-1.5-3.5-3.5h3L6.5 3c1.6.3 2.8 1.7 2.8 3.3 0 1.4-.8 2.6-2 3.1l.2.1z" fill="rgba(255,255,255,0.85)"/></svg>
      </div>
      <div style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:16px;height:3px;border-radius:1.5px;background:#0078D7;"></div>
    </div>
    <div style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;">
      <div style="width:22px;height:22px;border-radius:4px;background:#3C3C3C;display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1H5l1.5 1.5h5A1.5 1.5 0 0 1 13 4v5.5A1.5 1.5 0 0 1 11.5 11h-9A1.5 1.5 0 0 1 1 9.5v-7z" fill="#FFB900"/></svg>
      </div>
    </div>
    <div style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;">
      <div style="width:22px;height:22px;border-radius:4px;background:#0078D7;display:flex;align-items:center;justify-content:center;">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="rgba(255,255,255,0.85)"><rect x="1" y="3" width="4" height="4" rx="0.5"/><rect x="7" y="3" width="4" height="4" rx="0.5"/><rect x="1" y="7.5" width="4" height="4" rx="0.5"/><rect x="7" y="7.5" width="4" height="4" rx="0.5"/></svg>
      </div>
    </div>
  </div>
  <div style="position:absolute;right:0;top:0;display:flex;align-items:center;height:100%;">
    <div style="width:28px;height:100%;display:flex;align-items:center;justify-content:center;">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 6L4 2l2 4" stroke="rgba(255,255,255,0.5)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 8px;margin:0 4px;border-radius:4px;background:rgba(255,255,255,0.04);">
      <svg width="14" height="12" viewBox="0 0 16 13" fill="none"><circle cx="8" cy="11.5" r="1.2" fill="rgba(255,255,255,0.7)"/><path d="M5.8 9.2 A3 3 0 0 1 10.2 9.2" stroke="rgba(255,255,255,0.7)" stroke-width="1.4" stroke-linecap="round"/><path d="M3.3 6.5 A7 7 0 0 1 12.7 6.5" stroke="rgba(255,255,255,0.7)" stroke-width="1.4" stroke-linecap="round"/></svg>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 6v4h3l4 3V3L5 6H2z" fill="rgba(255,255,255,0.7)"/><path d="M11 5.5c.7.7 1 1.5 1 2.5s-.3 1.8-1 2.5" stroke="rgba(255,255,255,0.5)" stroke-width="1" stroke-linecap="round"/></svg>
      <svg width="20" height="10" viewBox="0 0 22 10" fill="none"><rect x="0.5" y="0.5" width="18" height="9" rx="2" stroke="rgba(255,255,255,0.5)" stroke-width="0.8"/><rect x="2" y="2" width="14" height="6" rx="1" fill="rgba(255,255,255,0.6)"/><path d="M19.5 3.5v3c.6-.2 1-.8 1-1.5s-.4-1.3-1-1.5z" fill="rgba(255,255,255,0.35)"/></svg>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 12px;height:100%;">
      <span style="font-size:11px;color:rgba(255,255,255,0.85);font-family:'Segoe UI Variable','Segoe UI',system-ui,sans-serif;line-height:14px;">${time}</span>
      <span style="font-size:11px;color:rgba(255,255,255,0.85);font-family:'Segoe UI Variable','Segoe UI',system-ui,sans-serif;line-height:14px;">${date}</span>
    </div>
    <div style="width:28px;height:100%;display:flex;align-items:center;justify-content:center;">
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M4.5 1.5a1.5 1.5 0 0 1 3 0C9 2.5 10 4 10 6.5v2l1 1.5H1L2 8.5v-2C2 4 3 2.5 4.5 1.5z" stroke="rgba(255,255,255,0.6)" stroke-width="0.8"/><path d="M4.5 11c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5" stroke="rgba(255,255,255,0.6)" stroke-width="0.8"/></svg>
    </div>
    <div style="width:5px;height:100%;border-left:1px solid rgba(255,255,255,0.06);"></div>
  </div>
</div>`;
}

/**
 * Build taskbar HTML for the given OS frame type.
 * Returns { top, bottom } where macOS has top=menubar + bottom=dock,
 * and Windows has bottom-only taskbar.
 */
export function buildTaskbarHtml(config: PreviewConfig): { top: string; bottom: string } {
  if (config.mode !== 'desktop' || !config.showTaskbar || config.osFrame === 'none') {
    return { top: '', bottom: '' };
  }

  if (config.osFrame === 'macos') {
    return { top: buildMacOSMenuBar(), bottom: buildMacOSDock() };
  }
  if (config.osFrame === 'windows-10') {
    return { top: '', bottom: buildWindows10Taskbar() };
  }
  if (config.osFrame === 'windows-11') {
    return { top: '', bottom: buildWindows11Taskbar() };
  }
  return { top: '', bottom: '' };
}
