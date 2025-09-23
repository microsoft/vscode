/*
 * omni_insert.ts
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

import { CommandFn } from './command';

// descriptive info for omni insert
export interface OmniInsert {
  name: string;
  keywords?: string[];
  description: string;
  group: OmniInsertGroup;
  priority?: number;
  selectionOffset?: number;
  noFocus?: boolean;
  image: () => string;
}

// descriptive info + ability to identify/execute
export interface OmniInserter extends OmniInsert {
  id: string;
  command: CommandFn;
}

export enum OmniInsertGroup {
  Common = 'Common',
  Headings = 'Headings',
  Lists = 'Lists',
  Math = 'Math',
  References = 'References',
  Content = 'Content',
  Blocks = 'Blocks',
  Chunks = 'Chunks',
}

const omniInsertGroupOrder = new Map<string, number>(Object.keys(OmniInsertGroup).map((key, index) => [key, index]));

export function omniInsertGroupCompare(a: OmniInsert, b: OmniInsert) {
  return omniInsertGroupOrder.get(a.group)! - omniInsertGroupOrder.get(b.group)!;
}

export function omniInsertPriorityCompare(a: OmniInsert, b: OmniInsert) {
  return (a.priority || 0) - (b.priority || 0);
}
