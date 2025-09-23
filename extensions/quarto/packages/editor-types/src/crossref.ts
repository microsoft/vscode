/*
 * crossref.ts
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

export const kCrossrefWorks = 'crossref_works';

// https://github.com/CrossRef/rest-api-doc
export interface CrossrefServer {
  works: (query: string) => Promise<CrossrefMessage<CrossrefWork>>;
}

export const kCrossrefItemsPerPage = 'items-per-page';
export const kCrossrefStartIndex = 'start-index';
export const kCrossrefSearchTerms = 'search-terms';
export const kCrossrefTotalResults = 'total-results';

export interface CrossrefMessage<T> {
  items: T[];
  [kCrossrefItemsPerPage]: number;
  query: {
    [kCrossrefStartIndex]: number;
    [kCrossrefSearchTerms]: string;
  };
  [kCrossrefTotalResults]: number;
}

// https://github.com/Crossref/rest-api-doc/blob/master/api_format.md#work
export interface CrossrefWork {
  // Name of work's publisher
  publisher: string;

  // Work titles, including translated titles
  title?: string[];

  // DOI of the work
  DOI: string;

  // URL form of the work's DOI
  URL: string;

  // Enumeration, one of the type ids from https://api.crossref.org/v1/types
  type: string;

  // Array of Contributors
  author: CrossrefContributor[];

  // Earliest of published-print and published-online
  issued: CrossrefDate;

  // Full titles of the containing work (usually a book or journal)
  'container-title'?: string;

  // Short titles of the containing work (usually a book or journal)
  'short-container-title'?: string;

  // Issue number of an article's journal
  issue: string;

  // Volume number of an article's journal
  volume: string;

  // Pages numbers of an article within its journal
  page: string;
}

export interface CrossrefContributor {
  family: string;
  given?: string;
}

/* (Partial Date) Contains an ordered array of year, month, day of month. Only year is required. 
Note that the field contains a nested array, e.g. [ [ 2006, 5, 19 ] ] to conform 
to citeproc JSON dates */
export interface CrossrefDate {
  'date-parts': Array<[number, number?, number?]>;
}

