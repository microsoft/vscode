/*
 * cite-doi.ts
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

import { EditorState, Transaction } from 'prosemirror-state';
import { Slice } from 'prosemirror-model';

import { findDOI } from '../../api/doi';

import { parseCitation, ParsedCitation } from './cite';

// Parses the transation or state to determine whether the current position
// represents a citation containing a DOI
export function doiFromEditingContext(context: EditorState | Transaction): ParsedCitation | undefined {
  
  const parsedCitation = parseCitation(context);
  if (parsedCitation) {
    const doi = findDOI(parsedCitation.token);
    if (doi) {
      return parsedCitation;
    }
    return undefined;
  } else {
    return undefined
  }
}

// Parses a slice to determine whether the slice contains
// a single DOI
export function doiFromSlice(context: EditorState | Transaction, slice: Slice): ParsedCitation | undefined {
  const parsedCitation = parseCitation(context);
  if (parsedCitation) {
    // Concatenate all the text and search for a DOI
    let text = '';
    slice.content.forEach(node => (text = text + node.textContent));
    if (text.length) {
      const doi = findDOI(text.trim());
      if (doi) {
        return { ...parsedCitation, token: doi };
      }
    }
    return undefined;
  } else {
    return undefined;
  }
}
