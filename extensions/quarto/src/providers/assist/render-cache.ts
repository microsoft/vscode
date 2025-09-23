/*
 * render-cache.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 * Copyright (c) 2020 Matt Bierner
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


import { Uri, Range, TextEditor } from "vscode";

export type RenderCacheKey = typeof renderCacheKeyNone | EditorRenderCacheKey;

export const renderCacheKeyNone = { type: "none" } as const;

export function createRenderCacheKey(
  editor: TextEditor | undefined
): RenderCacheKey {
  if (!editor) {
    return renderCacheKeyNone;
  }

  return new EditorRenderCacheKey(
    editor.document.uri,
    editor.document.version,
    editor.document.getWordRangeAtPosition(editor.selection.active)
  );
}

export function renderCacheKeyEquals(
  a: RenderCacheKey,
  b: RenderCacheKey
): boolean {
  if (a === b) {
    return true;
  }

  if (a.type !== b.type) {
    return false;
  }

  if (a.type === "none" || b.type === "none") {
    return false;
  }

  return a.equals(b);
}

export class EditorRenderCacheKey {
  readonly type = "editor";

  constructor(
    public readonly url: Uri,
    public readonly version: number,
    public readonly wordRange: Range | undefined
  ) { }

  public equals(other: EditorRenderCacheKey): boolean {
    if (this.url.toString() !== other.url.toString()) {
      return false;
    }

    if (this.version !== other.version) {
      return false;
    }

    if (!other.wordRange || !this.wordRange) {
      return false;
    }

    if (other.wordRange === this.wordRange) {
      return true;
    }

    return this.wordRange.isEqual(other.wordRange);
  }
}
