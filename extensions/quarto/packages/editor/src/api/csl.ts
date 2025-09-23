/*
 * csl.ts
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
import { Node as ProsemirrorNode } from 'prosemirror-model';

import { CSL, CSLDate, CSLName } from 'editor-types';
export type { CSL, CSLDate, CSLName } from 'editor-types';

import { parseYamlNodes } from './yaml';
import { crossRefTypeToCSLType } from './crossref';
import { EditorUIImages } from './ui-images';


// Crossref sends some items back with invalid data types in the CSL JSON
// This appears to tend to happen the most frequently with fields that CrossRef
// stores as Arrays which are not properly flatted to strings as Pandoc cite-proc expects.
// This will flatten any of these fields to the first element of the array
export function sanitizeForCiteproc(csl: CSL): CSL {
  // This field list was create speculatively, so may contain fields that do not require
  // sanitization (or may omit fields that require it).
  const sanitizeProperties = [
    'ISSN',
    'ISBN',
    'title',
    'subject',
    'archive',
    'original-title',
    'short-title',
    'subtitle',
    'container-title',
    'short-container-title',
    'license'
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cslAny: { [key: string]: any } = {
    ...csl,
  };
  const keys = Object.keys(cslAny);
  keys
    .filter(key => sanitizeProperties.includes(key))
    .forEach(property => {
      const value = cslAny[property];
      if (value && Array.isArray(value)) {
        if (value.length > 0) {
          cslAny[property] = value[0];
        } else {
          cslAny[property] = undefined;
        }
      }
      return cslAny;
    });

  // Strip any raw date representations
  if (cslAny.issued?.raw) {
    delete cslAny.issued.raw;
  }

  // Pubmed and others may included license information (including date ranges and more)
  // which will not be properly parsed by Pandoc (when writing to the bibliography). Remove
  if (cslAny.license) {
    delete cslAny.license;
  }

  // Datacite and others may include a 'contributor' field which should be an array of author types
  // however, pandoc can't properly process contributor field
  if (cslAny.contributor) {
    delete cslAny.contributor;
  }

  // pandoc-citeproc performance is extremely poor with large abstracts. As a result, purge this property
  delete cslAny.abstract;
  delete cslAny.id;

  // Ensure only valid CSL types make it through
  cslAny.type = ensureValidCSLType(cslAny.type);

  return cslAny as CSL;
}

// Crossref and other sources may allow invalid types to leak through
// (for example, this DOI 10.5962/bhl.title.5326 is of a monograph)
// and the type will leak through as monograph. This function will verify
// that the type is a CSL type and if it not, do its best to map the type
// to a valid CSL type
export function ensureValidCSLType(type: string): string {
  if (Object.values(cslTypes).includes(type)) {
    // This is a valid type
    return type;
  } else {
    return crossRefTypeToCSLType(type);
  }
}

export function cslFromDoc(doc: ProsemirrorNode): string | undefined {
  // read the Yaml blocks from the document
  const parsedYamlNodes = parseYamlNodes(doc);

  const cslParsedYamls = parsedYamlNodes.filter(
    parsedYaml => parsedYaml.yaml !== null && typeof parsedYaml.yaml === 'object' && parsedYaml.yaml.csl,
  );

  // Look through any yaml nodes to see whether any contain csl information
  if (cslParsedYamls.length > 0) {
    // Pandoc uses the last csl block (whether or not it shares a yaml block with the
    // bibliographies element that pandoc will ultimately use) so just pick the last csl
    // block.
    const cslParsedYaml = cslParsedYamls[cslParsedYamls.length - 1];
    const cslFile = cslParsedYaml.yaml.csl;
    return cslFile;
  }
  return undefined;
}

// Converts a csl date to an EDTF date.
// See https://www.loc.gov/standards/datetime/
// Currently omits time component so this isn't truly level 0
export function cslDateToEDTFDate(date: CSLDate) {
  if (date['date-parts']) {
    const paddedParts = date['date-parts'][0].map(part => {
      const partStr = part?.toString();
      if (partStr?.length === 1) {
        return `0${partStr}`;
      }
      return partStr;
    });
    return paddedParts.join('-');
  } else {
    return undefined;
  }
}

export function joinAuthorNames(cslName: CSLName) {
  const names: string[] = [];
  if (cslName.family) {
    names.push(cslName.family);
  }
  if (cslName.given) {
    names.push(cslName.given);
  }
  if (cslName.literal) {
    names.push(cslName.literal);
  }
  return names.join(" ");
}

export function imageForType(images: EditorUIImages, type: string): [string?, string?] {
  switch (type) {
    case cslTypes.article:
    case cslTypes.articleJournal:
    case cslTypes.articleMagazine:
    case cslTypes.articleNewspaper:
    case cslTypes.paperConference:
    case cslTypes.review:
    case cslTypes.reviewBook:
      return [images.citations?.article, images.citations?.article_dark];
    case cslTypes.bill:
    case cslTypes.legislation:
    case cslTypes.legalCase:
    case cslTypes.treaty:
      return [images.citations?.legal, images.citations?.legal_dark];
    case cslTypes.book:
    case cslTypes.chapter:
    case cslTypes.manuscript:
    case cslTypes.thesis:
      return [images.citations?.book, images.citations?.book_dark];
    case cslTypes.broadcast:
      return [images.citations?.broadcast, images.citations?.broadcast_dark];
    case cslTypes.dataset:
      return [images.citations?.data, images.citations?.data_dark];
    case cslTypes.entry:
    case cslTypes.entryDictionary:
    case cslTypes.entryEncylopedia:
      return [images.citations?.entry, images.citations?.entry_dark];
    case cslTypes.figure:
    case cslTypes.graphic:
      return [images.citations?.image, images.citations?.image_dark];
    case cslTypes.map:
      return [images.citations?.map, images.citations?.map_dark];
    case cslTypes.motionPicture:
      return [images.citations?.movie, images.citations?.movie_dark];
    case cslTypes.musicalScore:
    case cslTypes.song:
      return [images.citations?.song, images.citations?.song_dark];
    case cslTypes.post:
    case cslTypes.postWeblog:
    case cslTypes.webpage:
      return [images.citations?.web, images.citations?.web_dark];
    case cslTypes.interview:
    case cslTypes.pamphlet:
    case cslTypes.personalCommunication:
    case cslTypes.report:
    case cslTypes.speech:
    default:
      return [images.citations?.other, images.citations?.other_dark];
  }
}

export const cslTypes = {
  article: 'article',
  articleMagazine: 'article-magazine',
  articleNewspaper: 'article-newspaper',
  articleJournal: 'article-journal',
  bill: 'bill',
  book: 'book',
  broadcast: 'broadcast',
  chapter: 'chapter',
  dataset: 'dataset',
  entry: 'entry',
  entryDictionary: 'entry-dictionary',
  entryEncylopedia: 'entry-encyclopedia',
  figure: 'figure',
  graphic: 'graphic',
  interview: 'interview',
  legislation: 'legislation',
  legalCase: 'legal_case',
  manuscript: 'manuscript',
  map: 'map',
  motionPicture: 'motion_picture',
  musicalScore: 'musical_score',
  pamphlet: 'pamphlet',
  paperConference: 'paper-conference',
  patent: 'patent',
  post: 'post',
  postWeblog: 'post-weblog',
  personalCommunication: 'personal_communication',
  report: 'report',
  review: 'review',
  reviewBook: 'review-book',
  song: 'song',
  speech: 'speech',
  thesis: 'thesis',
  treaty: 'treaty',
  webpage: 'webpage',
};
