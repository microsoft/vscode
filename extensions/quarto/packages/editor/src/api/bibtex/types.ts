/*
 * types.ts
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

import { cslTypes } from '../csl';

export interface Type {
  bibtex: string;
  fieldsRequired: string[];
  fieldsOptional: string[];
  fieldsEitherOr: string[];
}

// Maps CSL Types to the equivalent BibTeX types.
// Mapping derived from:
// https://github.com/citation-style-language/styles/blob/master/bibtex.csl
export function typeMapping(cslType: string): Type {
  switch (cslType) {
    case cslTypes.article:
    case cslTypes.articleJournal:
    case cslTypes.articleMagazine:
    case cslTypes.articleNewspaper:
      return {
        bibtex: BibTextTypes.article.type,
        ...BibTextTypes.article.fields,
      };

    case cslTypes.book:
      return {
        bibtex: BibTextTypes.book.type,
        ...BibTextTypes.book.fields,
      };

    case cslTypes.chapter:
      return {
        bibtex: BibTextTypes.inbook.type,
        ...BibTextTypes.inbook.fields,
      };

    case cslTypes.thesis:
      return {
        bibtex: BibTextTypes.phdthesis.type,
        ...BibTextTypes.phdthesis.fields,
      };

    case cslTypes.manuscript:
      return {
        bibtex: BibTextTypes.unpublished.type,
        ...BibTextTypes.unpublished.fields,
      };

    case cslTypes.paperConference:
      return {
        bibtex: BibTextTypes.inproceedings.type,
        ...BibTextTypes.inproceedings.fields,
      };

    case cslTypes.report:
      return {
        bibtex: BibTextTypes.techreport.type,
        ...BibTextTypes.techreport.fields,
      };

    case cslTypes.bill:
    case cslTypes.graphic:
    case cslTypes.legalCase:
    case cslTypes.legislation:
    case cslTypes.motionPicture:
    case cslTypes.song:
    default:
      return {
        bibtex: BibTextTypes.misc.type,
        ...BibTextTypes.misc.fields,
      };
  }
}

export function bibtextTypeToCSLType(bibtexType: string) {
  switch (bibtexType) {
    case BibTextTypes.article.type:
      return cslTypes.articleJournal;

    case BibTextTypes.proceedings.type:
    case BibTextTypes.manual.type:
    case BibTextTypes.book.type:
      return cslTypes.book;

    case BibTextTypes.booklet.type:
      return cslTypes.pamphlet;

    case BibTextTypes.inbook.type:
    case BibTextTypes.incollection.type:
      return cslTypes.chapter;

    case BibTextTypes.conference.type:
    case BibTextTypes.inproceedings.type:
      return cslTypes.paperConference;

    case BibTextTypes.mastersthesis.type:
    case BibTextTypes.phdthesis.type:
      return cslTypes.thesis;

    case BibTextTypes.techreport.type:
      return cslTypes.report;

    case BibTextTypes.unpublished.type:
      return cslTypes.manuscript;

    case BibTextTypes.misc.type:
    default:
      return cslTypes.article;
  }
}

// BibTeX types and their fields
// See https://www.openoffice.org/bibliographic/bibtex-defs.html
// (a corrected version of Appendix B.2 of the LATEX book [2], © 1986, by Addison-Wesley.)
export const BibTextTypes = {
  // An article from a journal or magazine.
  article: {
    type: 'article',
    fields: {
      fieldsRequired: ['author', 'title', 'journal', 'year'],
      fieldsOptional: ['volume', 'number', 'pages', 'month', 'note'],
      fieldsEitherOr: [],
    },
  },
  // A book with an explicit publisher.
  book: {
    type: 'book',
    fields: {
      fieldsRequired: ['title', 'publisher', 'year'],
      fieldsOptional: ['volume', 'number', 'series', 'address', 'edition', 'month', 'note'],
      fieldsEitherOr: ['author', 'editor'],
    },
  },

  // A work that is printed and bound, but without a named publisher or sponsoring institution.
  booklet: {
    type: 'booklet',
    fields: {
      fieldsRequired: ['title'],
      fieldsOptional: ['author', 'howpublished', 'address', 'month', 'year', 'note'],
      fieldsEitherOr: [],
    },
  },

  // The same as inproceedings, included for Scribe compatibility.
  conference: {
    type: 'conference',
    fields: {
      fieldsRequired: ['author', 'title', 'booktitle', 'year'],
      fieldsOptional: [
        'editor',
        'volume',
        'number',
        'series',
        'pages',
        'address',
        'month',
        'organization',
        'publisher',
        'note',
      ],
      fieldsEitherOr: [],
    },
  },

  // A part of a book, which may be a chapter (or section or whatever) and/or a range of pages.
  inbook: {
    type: 'inbook',
    fields: {
      fieldsRequired: ['title', 'chapter', 'pages', 'publisher', 'year'],
      fieldsOptional: ['volume', 'number', 'series', 'type', 'address', 'edition', 'month', 'note'],
      fieldsEitherOr: ['author', 'editor'],
    },
  },

  // A part of a book having its own title.
  incollection: {
    type: 'incollection',
    fields: {
      fieldsRequired: ['author', 'title', 'booktitle', 'publisher', 'year'],
      fieldsOptional: [
        'editor',
        'volume',
        'number',
        'series',
        'type',
        'chapter',
        'pages',
        'address',
        'edition',
        'month',
        'note',
      ],
      fieldsEitherOr: [],
    },
  },

  // An article in a conference proceedings.
  inproceedings: {
    type: 'inproceedings',
    fields: {
      fieldsRequired: ['author', 'title', 'booktitle', 'year'],
      fieldsOptional: [
        'editor',
        'volume',
        'number',
        'series',
        'pages',
        'address',
        'month',
        'organization',
        'publisher',
        'note',
      ],
      fieldsEitherOr: [],
    },
  },

  // Technical documentation
  manual: {
    type: 'manual',
    fields: {
      fieldsRequired: ['title'],
      fieldsOptional: ['author', 'organization', 'address', 'edition', 'month', 'year', 'note'],
      fieldsEitherOr: [],
    },
  },

  // A Master's thesis.
  mastersthesis: {
    type: 'mastersthesis',
    fields: {
      fieldsRequired: ['author', 'title', 'school', 'year'],
      fieldsOptional: ['type', 'address', 'month', 'note'],
      fieldsEitherOr: [],
    },
  },

  // Use this type when nothing else fits.
  misc: {
    type: 'misc',
    fields: {
      fieldsRequired: [],
      fieldsOptional: ['author', 'title', 'howpublished', 'month', 'year', 'note'],
      fieldsEitherOr: [],
    },
  },

  // A PhD thesis.
  phdthesis: {
    type: 'phdthesis',
    fields: {
      fieldsRequired: ['author', 'title', 'school', 'year'],
      fieldsOptional: ['type', 'address', 'month', 'note'],
      fieldsEitherOr: [],
    },
  },

  // The proceedings of a conference.
  proceedings: {
    type: 'proceedings',
    fields: {
      fieldsRequired: ['title', 'year'],
      fieldsOptional: ['editor', 'volume', 'number', 'series', 'address', 'month', 'organization', 'publisher', 'note'],
      fieldsEitherOr: [],
    },
  },

  // A report published by a school or other institution, usually numbered within a series.
  techreport: {
    type: 'techreport',
    fields: {
      fieldsRequired: ['author', 'title', 'institution', 'year'],
      fieldsOptional: ['type', 'number', 'address', 'month', 'note'],
      fieldsEitherOr: [],
    },
  },

  // A document having an author and title, but not formally published.
  unpublished: {
    type: 'unpublished',
    fields: {
      fieldsRequired: ['author', 'title', 'note'],
      fieldsOptional: ['month', 'year'],
      fieldsEitherOr: [],
    },
  },
};
