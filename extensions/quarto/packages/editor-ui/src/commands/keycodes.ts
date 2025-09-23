/*
 * keycodes.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

const kMac = typeof navigator !== 'undefined' ? /Mac/.test(navigator.platform) : false;

export interface KeyCode {
  meta: boolean;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  key: string;
}

export function toKeyCode(key: string) {
  if (!kMac) {
    key = key.replace('Mod-', 'Ctrl-');
  }
  const keys = key.split('-');
  let keystr = keys[keys.length - 1];
  if (/^[\w]$/.test(keystr)) {
    keystr = keystr.toUpperCase();
  }
  return {
    meta: keys.indexOf('Mod') !== -1,
    shift: keys.indexOf('Shift') !== -1,
    ctrl: keys.indexOf('Ctrl') !== -1,
    alt: keys.indexOf('Alt') !== -1,
    key: keystr,
  };
}

export function keyCodeString(keyCode: string | KeyCode, pretty = true) {
  if (typeof keyCode === 'string') {
    keyCode = toKeyCode(keyCode);
  }
  if (kMac && pretty) {
    return (
      `${keyCode.ctrl ? '⌃' : ''}` +
      `${keyCode.alt ? '⌥' : ''}` +
      `${keyCode.shift ? '⇧' : ''}` +
      `${keyCode.meta ? '⌘' : ''}` +
      keyName(keyCode.key, pretty)
    );
  } else {
    return (
      `${keyCode.ctrl ? 'Ctrl+' : ''}` +
      `${keyCode.alt ? 'Alt+' : ''}` +
      `${keyCode.shift ? 'Shift+' : ''}` +
      `${keyCode.meta ? 'Cmd+' : ''}` +
      keyName(keyCode.key, pretty)
    );
  }
}

function keyName(key: string, pretty: boolean) {
  if (pretty) {
    switch (key) {
      case 'Enter':
        return '↩︎';
      case 'Up':
        return '↑';
      case 'Down':
        return '↓';
      case 'Left':
        return '←';
      case 'Right':
        return '→';
      case 'Tab':
        return '⇥';
      case 'PageUp':
        return 'PgUp';
      case 'PageDown':
        return 'PgDn';
      case 'Backspace':
        return '⌫';
      default:
        return key;
    }
  }

  return key;
}
