/*
 * xref.ts
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

export const kXRefIndexForFile = 'xref_index_for_file';
export const kXRefXRefForId = 'xref_xref_for_id';
export const kXRefQuartoIndexForFile = 'xref_quarto_index_for_file';
export const kXRefQuartoXRefForId = 'xref_quarto_xref_for_id';

export interface XRefServer {
  indexForFile: (file: string) => Promise<XRefs>;
  xrefForId: (file: string, id: string) => Promise<XRefs>;
  quartoIndexForFile: (file: string) => Promise<XRefs>;
  quartoXrefForId: (file: string, id: string) => Promise<XRefs>;
}

export interface XRefs {
  baseDir: string;
  refs: XRef[];
}

export interface XRef {
  file: string;
  type: string;
  id: string;
  suffix: string;
  title?: string;
}

export function isXRef(x: unknown): x is XRef {
  return typeof x === "object" && !!(x as XRef).type;
}

export type XRefType = "quarto" | "bookdown";

