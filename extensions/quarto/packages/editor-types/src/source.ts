/*
 * source.ts
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


export const kSourceGetSourcePosLocations = 'source_get_source_pos_locations';


export type SourcePosBlock = "Para" | "Header" | "CodeBlock" | "Div" | "BulletList" | "OrderedList" | "RawBlock" | "BlockQuote" | "HorizontalRule";

export interface SourcePosLocation {
  block: SourcePosBlock;
  pos: number; // could be a line number or a prosemirror pos
}

export interface SourcePos {
  locations: SourcePosLocation[];
  pos: number;  // could be a line number or a prosemirror pos
}

export function isSourcePos(x: unknown): x is SourcePos {
  return typeof x === "object" && !!(x as SourcePos).locations;
}


export interface SourceServer {
  getSourcePosLocations: (markdown: string) => Promise<SourcePosLocation[]>;
}


