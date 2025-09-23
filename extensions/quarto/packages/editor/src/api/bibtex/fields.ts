/*
 * fields.ts
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

import { lanagugeMappings } from './language';

export interface Field {
  type: string;
  bibtex: ((bibTexType: string) => string) | string;
  csl: string | undefined;
  options?: string[] | { [key: string]: { bibtex: string } } | undefined;
}

// CSL Field (variable) definitions from
// https://docs.citationstyles.org/en/stable/specification.html#appendix-iv-variables

// TODO: bibtex: string | (type: string) => string
//

export const FieldMap: { [key: string]: Field } = {
  abstract: {
    type: 'f_long_literal',
    bibtex: 'abstract',
    csl: 'abstract',
  },
  author: {
    type: 'l_name',
    bibtex: 'author',
    csl: 'author',
  },
  bookauthor: {
    type: 'l_name',
    bibtex: 'author',
    csl: 'container-author',
  },
  containerTitle: {
    type: 'f_title',
    bibtex: (bibTexType: string) => {
      switch (bibTexType) {
        case 'conference':
        case 'inproceedings':
        case 'incollection':
          return 'booktitle';
        default:
          return 'journal';
      }
    },
    csl: 'container-title',
  },
  chapter: {
    type: 'f_literal',
    bibtex: 'chapter',
    csl: 'chapter-number',
  },
  date: {
    type: 'f_date',
    bibtex: 'date',
    csl: 'issued',
  },
  doi: {
    type: 'f_verbatim',
    bibtex: 'doi',
    csl: 'DOI',
  },
  edition: {
    type: 'f_integer',
    bibtex: 'edition',
    csl: 'edition',
  },
  editor: {
    type: 'l_name',
    bibtex: 'editor',
    csl: 'editor',
  },
  eventdate: {
    type: 'f_date',
    bibtex: 'date',
    csl: 'event-date',
  },
  eventtitle: {
    type: 'f_title',
    bibtex: 'title',
    csl: 'event',
  },
  howpublished: {
    type: 'f_literal',
    bibtex: 'howpublished',
    csl: 'medium',
  },
  issue: {
    type: 'f_literal',
    bibtex: 'issue',
    csl: 'issue',
  },
  journaltitle: {
    type: 'f_literal',
    bibtex: 'journal',
    csl: 'container-title',
  },
  // Special - not really in CSL or BibTeX
  langid: {
    type: 'f_key',
    bibtex: 'langid',
    csl: 'language',
    options: lanagugeMappings,
  },
  location: {
    type: 'l_literal',
    bibtex: 'address',
    csl: 'publisher-place',
  },
  note: {
    type: 'f_literal',
    bibtex: 'note',
    csl: 'note',
  },
  number: {
    type: 'f_literal',
    bibtex: 'number',
    csl: 'collection-number',
  },
  pages: {
    type: 'l_range',
    bibtex: 'pages',
    csl: 'page',
  },
  publisher: {
    type: 'l_literal',
    bibtex: 'publisher',
    csl: 'publisher',
  },
  series: {
    type: 'f_literal',
    bibtex: 'series',
    csl: 'collection-title',
  },
  title: {
    type: 'f_title',
    bibtex: 'title',
    csl: 'title',
  },
  url: {
    type: 'f_uri',
    bibtex: 'url',
    csl: 'URL',
  },
  volume: {
    type: 'f_literal',
    bibtex: 'volume',
    csl: 'volume',
  },
};
