/*
 * spelling.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */


export interface EditorAnchor {
  getPosition: () => number;
}

export interface EditorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorWordRange {
  start: number;
  end: number;
}

export interface EditorWordSource {
  hasNext: () => boolean;
  next: () => EditorWordRange | null;
}

export interface EditorSpellingDoc {
  getWords: (start: number, end: number) => EditorWordSource;

  createAnchor: (pos: number) => EditorAnchor;

  shouldCheck: (wordRange: EditorWordRange) => boolean;
  setSelection: (wordRange: EditorWordRange) => void;
  getText: (wordRange: EditorWordRange) => string;

  getCursorPosition: () => number;
  replaceSelection: (text: string) => void;
  getSelectionStart: () => number;
  getSelectionEnd: () => number;

  getCursorBounds: () => EditorRect;
  moveCursorNearTop: () => void;

  dispose: () => void;
}
