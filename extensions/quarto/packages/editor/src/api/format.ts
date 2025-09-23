/*
 * format.ts
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

export interface EditorFormat {
  readonly pandocMode: string;
  readonly pandocExtensions: string;
  readonly rmdExtensions: EditorRmdExtensions;
  readonly hugoExtensions: EditorHugoExtensions;
  readonly docTypes: EditorExtendedDocType[];
}

export interface EditorRmdExtensions {
  readonly codeChunks?: boolean;
  readonly bookdownXRef?: boolean;
  readonly bookdownXRefUI?: boolean;
  readonly bookdownPart?: boolean;
  readonly blogdownMathInCode?: boolean;
}

export interface EditorHugoExtensions {
  readonly shortcodes?: boolean;
}

export const kBookdownDocType = 'bookdown';
export const kHugoDocType = 'hugo';
export const kQuartoDocType = 'quarto';
export const kPresentationDocType = 'presentation';

export type EditorExtendedDocType = 'bookdown' | 'hugo' | 'quarto' | 'presentation';
