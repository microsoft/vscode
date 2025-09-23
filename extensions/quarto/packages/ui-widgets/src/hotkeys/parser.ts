/*
 * Copyright 2016 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface IKeyCodeTable {
  [code: number]: string;
}

export interface IKeyCodeReverseTable {
  [key: string]: number;
}

export interface IKeyMap {
  [key: string]: string;
}

export const KeyCodes: IKeyCodeTable = {
  8: "backspace",
  9: "tab",
  13: "enter",
  20: "capslock",
  27: "esc",
  32: "space",
  33: "pageup",
  34: "pagedown",
  35: "end",
  36: "home",
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  45: "ins",
  46: "del",
  // number keys
  48: "0",
  49: "1",
  50: "2",
  51: "3",
  52: "4",
  53: "5",
  54: "6",
  55: "7",
  56: "8",
  57: "9",
  // alphabet
  65: "a",
  66: "b",
  67: "c",
  68: "d",
  69: "e",
  70: "f",
  71: "g",
  72: "h",
  73: "i",
  74: "j",
  75: "k",
  76: "l",
  77: "m",
  78: "n",
  79: "o",
  80: "p",
  81: "q",
  82: "r",
  83: "s",
  84: "t",
  85: "u",
  86: "v",
  87: "w",
  88: "x",
  89: "y",
  90: "z",
  // punctuation
  106: "*",
  107: "+",
  109: "-",
  110: ".",
  111: "/",
  186: ";",
  187: "=",
  188: ",",
  189: "-",
  190: ".",
  191: "/",
  192: "`",
  219: "[",
  220: "\\",
  221: "]",
  222: "'",
};

export const Modifiers: IKeyCodeTable = {
  16: "shift",
  17: "ctrl",
  18: "alt",
  91: "meta",
  93: "meta",
  224: "meta",
};

export const ModifierBitMasks: IKeyCodeReverseTable = {
  alt: 1,
  ctrl: 2,
  meta: 4,
  shift: 8,
};

export const Aliases: IKeyMap = {
  cmd: "meta",
  command: "meta",
  escape: "esc",
  minus: "-",
  mod: isMac() ? "meta" : "ctrl",
  option: "alt",
  plus: "+",
  return: "enter",
  win: "meta",
};

// alph sorting is unintuitive here
// tslint:disable object-literal-sort-keys
export const ShiftKeys: IKeyMap = {
  "~": "`",
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
  _: "-",
  "+": "=",
  "{": "[",
  "}": "]",
  "|": "\\",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
};
// tslint:enable object-literal-sort-keys

// Function keys
for (let i = 1; i <= 12; ++i) {
  KeyCodes[111 + i] = "f" + i;
}

// Numpad
for (let i = 0; i <= 9; ++i) {
  KeyCodes[96 + i] = "num" + i.toString();
}

export interface IKeyCombo {
  key?: string;
  modifiers: number;
}

export function comboMatches(a: IKeyCombo, b: IKeyCombo) {
  return a.modifiers === b.modifiers && a.key === b.key;
}

/**
 * Converts a key combo string into a key combo object. Key combos include
 * zero or more modifier keys, such as `shift` or `alt`, and exactly one
 * action key, such as `A`, `enter`, or `left`.
 *
 * For action keys that require a shift, e.g. `@` or `|`, we inlude the
 * necessary `shift` modifier and automatically convert the action key to the
 * unshifted version. For example, `@` is equivalent to `shift+2`.
 */
export const parseKeyCombo = (combo: string): IKeyCombo => {
  const pieces = combo.replace(/\s/g, "").toLowerCase().split("+");
  let modifiers = 0;
  let key: string | undefined;
  for (let piece of pieces) {
    if (piece === "") {
      throw new Error(`Failed to parse key combo "${combo}".
              Valid key combos look like "cmd + plus", "shift+p", or "!"`);
    }

    if (Aliases[piece] != null) {
      piece = Aliases[piece];
    }

    if (ModifierBitMasks[piece] != null) {
      modifiers += ModifierBitMasks[piece];
    } else if (ShiftKeys[piece] != null) {
      modifiers += ModifierBitMasks.shift;
      key = ShiftKeys[piece];
    } else {
      key = piece.toLowerCase();
    }
  }
  return { modifiers, key };
};

/**
 * Converts a keyboard event into a valid combo prop string
 */
export const getKeyComboString = (e: KeyboardEvent): string => {
  const keys = [] as string[];

  // modifiers first
  if (e.ctrlKey) {
    keys.push("ctrl");
  }
  if (e.altKey) {
    keys.push("alt");
  }
  if (e.shiftKey) {
    keys.push("shift");
  }
  if (e.metaKey) {
    keys.push("meta");
  }

  const { which } = e;
  if (Modifiers[which] != null) {
    // no action key
  } else if (KeyCodes[which] != null) {
    keys.push(KeyCodes[which]);
  } else {
    // eslint-disable-next-line id-blacklist
    keys.push(String.fromCharCode(which).toLowerCase());
  }

  // join keys with plusses
  return keys.join(" + ");
};

/**
 * Determines the key combo object from the given keyboard event. Again, a key
 * combo includes zero or more modifiers (represented by a bitmask) and one
 * action key, which we determine from the `e.which` property of the keyboard
 * event.
 */
export const getKeyCombo = (e: KeyboardEvent): IKeyCombo => {
  let key: string | undefined;
  const { which } = e;
  if (Modifiers[which] != null) {
    // keep key null
  } else if (KeyCodes[which] != null) {
    key = KeyCodes[which];
  } else {
    // eslint-disable-next-line id-blacklist
    key = String.fromCharCode(which).toLowerCase();
  }

  let modifiers = 0;
  if (e.altKey) {
    modifiers += ModifierBitMasks.alt;
  }
  if (e.ctrlKey) {
    modifiers += ModifierBitMasks.ctrl;
  }
  if (e.metaKey) {
    modifiers += ModifierBitMasks.meta;
  }
  if (e.shiftKey) {
    modifiers += ModifierBitMasks.shift;
  }

  return { modifiers, key };
};

/**
 * Splits a key combo string into its constituent key values and looks up
 * aliases, such as `return` -> `enter`.
 *
 * Unlike the parseKeyCombo method, this method does NOT convert shifted
 * action keys. So `"@"` will NOT be converted to `["shift", "2"]`).
 */
export const normalizeKeyCombo = (
  combo: string,
  platformOverride?: string
): string[] => {
  const keys = combo.replace(/\s/g, "").split("+");
  return keys.map((key) => {
    const keyName = Aliases[key] != null ? Aliases[key] : key;
    return keyName === "meta"
      ? isMac(platformOverride)
        ? "cmd"
        : "ctrl"
      : keyName;
  });
};

function isMac(platformOverride?: string) {
  const platform =
    platformOverride ??
    (typeof navigator !== "undefined" ? navigator.platform : undefined);
  return platform === undefined ? false : /Mac|iPod|iPhone|iPad/.test(platform);
}
