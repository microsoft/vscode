
/*
 * cite-completion-search.ts
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
import Fuse from 'fuse.js';

import { CiteCompletionEntry } from "./cite-completion";

const searchFields: Fuse.FuseOptionKeyObject<CiteCompletionEntry>[] = [
  { name: 'id', weight: 30 },
  { name: 'index.secondary', weight: 30 },
  { name: 'index.tertiary', weight: 5 },
];

export interface CiteCompletionSearch {
  setEntries: (entries: CiteCompletionEntry[]) => void;
  search: (searchTerm: string, limit: number) => CiteCompletionEntry[];
  exactMatch: (searchTerm: string) => boolean;
}

export function completionIndex(defaultEntries?: CiteCompletionEntry[]): CiteCompletionSearch {
  // build search index
  const options = {
    isCaseSensitive: false,
    shouldSort: true,
    includeMatches: false,
    includeScore: false,
    minMatchCharLength: 3,
    threshold: 0.5,
    keys: searchFields,
    useExtendedSearch: true
  };

  defaultEntries = defaultEntries || [];
  const index = Fuse.createIndex<CiteCompletionEntry>(searchFields, defaultEntries);
  const fuse = new Fuse(defaultEntries, options, index);
  let indexedEntries: CiteCompletionEntry[] = [];

  return {
    setEntries: (entries: CiteCompletionEntry[]) => {
      fuse.setCollection(entries);
      indexedEntries = entries;
    },
    search: (searchTerm: string, limit: number): CiteCompletionEntry[] => {
      const results = fuse.search('^' + searchTerm, { ...options, limit });
      return results.map(result => result.item);
    },
    exactMatch: (searchTerm: string): boolean => {
      return indexedEntries.some(entry => entry.id === searchTerm);
    }
  };
}