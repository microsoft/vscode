/*
 * doi.ts
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

import { DOIServer } from "editor-types";
export type { DOIServer }

// ^10.\d{4,9}/[-._;()/:A-Z0-9]+$
// Core regexes come from https://www.crossref.org/blog/dois-and-matching-regular-expressions/
const kModernCrossrefDOIRegex = /10.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;
const kEarlyWileyCrossrefDOIRegex = /10.1002\/[^\s]+$/i;
const kOtherCrossrefDOIRegex1 = /10.\\d{4}\/\d+-\d+X?(\d+)\d+<[\d\w]+:[\d\w]*>\d+.\d+.\w+;\d$/i;
const kOtherCrossrefDOIRegex2 = /10.1021\/\w\w\d+$/i;
const kOtherCrossrefDOIRegex3 = /10.1207\/[\w\d]+&\d+_\d+$/i;

const kCrossrefMatches = [
  kModernCrossrefDOIRegex,
  kEarlyWileyCrossrefDOIRegex,
  kOtherCrossrefDOIRegex1,
  kOtherCrossrefDOIRegex2,
  kOtherCrossrefDOIRegex3,
];

// Determines whether a a given string may be a DOI
// Note that this will validate the form of the string, but not
// whether it is actually a registered DOI
export function hasDOI(token: string): boolean {
  return findDOI(token) !== undefined;
}

export function findDOI(token: string): string | undefined {
  let match = null;
  kCrossrefMatches.find(regex => {
    match = token.match(regex);
    return match && match[0].length > 0;
  });

  if (match === null) {
    return undefined;
  } else {
    return match[0];
  }
}

export function urlForDOI(doi: string): string {
  return `https://doi.org/${doi}`;
}
