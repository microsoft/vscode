
/*
 * insert_xref-index.ts
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
import { XRef } from 'editor-types';
import Fuse from 'fuse.js';
import { xrefKey } from '../../api/xref';


const searchFields: Fuse.FuseOptionKeyObject<XRef>[] = [
  { name: 'key', weight: 50 },
  { name: 'title', weight: 30 },
];

export interface XRefSearch {
  search: (searchTerm: string, limit: number) => XRef[];
}

interface QuartoXRef extends XRef {
  key: string;
}

export function xrefIndex(entries: XRef[]): XRefSearch {
  // build search index
  const options = {
    isCaseSensitive: false,
    shouldSort: true,
    includeMatches: false,
    includeScore: false,
    minMatchCharLength: 2,
    threshold: 0.3,
    keys: searchFields,
  };

  const index = Fuse.createIndex<QuartoXRef>(searchFields.map(searchField => searchField.name), entries.map(entry => {
    return {
      key: xrefKey(entry, "quarto"),
      ...entry
    };
  }));
  const fuse = new Fuse(entries, options, index);
  return {
    search: (searchTerm: string, limit: number): XRef[] => {
      const results = fuse.search(searchTerm, { ...options, limit });
      return results.map(result => result.item);
    },
  };
}