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

import { EditorUI } from './ui-types';
import { cslTypes } from './csl';

export function imageForCrossrefType(ui: EditorUI, type: string): [string?, string?] {
  switch (type) {
    case crossRefTypes.monograph:
    case crossRefTypes.report:
    case crossRefTypes.journalArticle:
    case crossRefTypes.journalVolume:
    case crossRefTypes.journal:
    case crossRefTypes.journalIssue:
    case crossRefTypes.proceedingsArticle:
    case crossRefTypes.dissertation:
    case crossRefTypes.reportSeries:
      return [ui.images.citations?.article, ui.images.citations?.article_dark];
    case crossRefTypes.bookSection:
    case crossRefTypes.bookPart:
    case crossRefTypes.bookSeries:
    case crossRefTypes.editedBook:
    case crossRefTypes.bookChapter:
    case crossRefTypes.book:
    case crossRefTypes.bookSet:
    case crossRefTypes.bookTrack:
    case crossRefTypes.referenceBook:
      return [ui.images.citations?.book, ui.images.citations?.book_dark];
    case crossRefTypes.dataset:
      return [ui.images.citations?.data, ui.images.citations?.data_dark];
    case crossRefTypes.referenceEntry:
      return [ui.images.citations?.entry, ui.images.citations?.entry_dark];
    case crossRefTypes.postedContent:
      return [ui.images.citations?.web, ui.images.citations?.web_dark];
    case crossRefTypes.other:
    case crossRefTypes.standard:
    case crossRefTypes.standardSeries:
    case crossRefTypes.peerReview:
    case crossRefTypes.component:
    case crossRefTypes.proceedingsSeries:
    case crossRefTypes.proceedings:
    default:
      return [ui.images.citations?.other, ui.images.citations?.other_dark];
  }
}

export function prettyType(ui: EditorUI, type: string): string {
  switch (type) {
    case crossRefTypes.monograph:
      return ui.context.translateText('Monograph');
    case crossRefTypes.report:
      return ui.context.translateText('Report');
    case crossRefTypes.journalArticle:
      return ui.context.translateText('Journal');
    case crossRefTypes.journalVolume:
      return ui.context.translateText('Journal Volume');
    case crossRefTypes.journal:
      return ui.context.translateText('Journal');
    case crossRefTypes.journalIssue:
      return ui.context.translateText('Journal Issue');
    case crossRefTypes.proceedingsArticle:
    case crossRefTypes.proceedingsSeries:
    case crossRefTypes.proceedings:
      return ui.context.translateText('Proceedings');
    case crossRefTypes.dissertation:
      return ui.context.translateText('Dissertation');
    case crossRefTypes.reportSeries:
      return ui.context.translateText('Series');
    case crossRefTypes.bookSection:
      return ui.context.translateText('Book Section');
    case crossRefTypes.bookPart:
      return ui.context.translateText('Book Part');
    case crossRefTypes.bookSeries:
      return ui.context.translateText('Book Series');
    case crossRefTypes.bookChapter:
      return ui.context.translateText('Book Chapter');
    case crossRefTypes.editedBook:
    case crossRefTypes.bookSet:
    case crossRefTypes.bookTrack:
    case crossRefTypes.referenceBook:
      return ui.context.translateText('Book');
    case crossRefTypes.dataset:
      return ui.context.translateText('Dataset');
    case crossRefTypes.referenceEntry:
      return ui.context.translateText('Entry');
    case crossRefTypes.postedContent:
      return ui.context.translateText('Content');
    case crossRefTypes.other:
    case crossRefTypes.standard:
    case crossRefTypes.standardSeries:
    case crossRefTypes.peerReview:
    case crossRefTypes.component:
      return ui.context.translateText('Other');
    default:
      return type;
  }
}

export function crossRefTypeToCSLType(type: string): string {
  // This isn't a valid type, try to map it to a valid type
  switch (type) {
    case crossRefTypes.bookSection:
    case crossRefTypes.bookChapter:
    case crossRefTypes.bookPart:
      return cslTypes.chapter;
    case crossRefTypes.book:
    case crossRefTypes.bookSet:
    case crossRefTypes.bookTrack:
    case crossRefTypes.referenceBook:
    case crossRefTypes.bookSeries:
    case crossRefTypes.editedBook:
      return cslTypes.book;
    case crossRefTypes.report:
      return cslTypes.report;
    case crossRefTypes.peerReview:
      return cslTypes.review;
    case crossRefTypes.journalArticle:
    case crossRefTypes.journalVolume:
    case crossRefTypes.journal:
    case crossRefTypes.journalIssue:
      return cslTypes.articleJournal;
    case crossRefTypes.referenceEntry:
      return cslTypes.entry;
    case crossRefTypes.monograph:
    case crossRefTypes.proceedingsArticle:
    case crossRefTypes.component:
    case crossRefTypes.other:
      return cslTypes.article;
    case crossRefTypes.proceedings:
    case crossRefTypes.proceedingsSeries:
      return cslTypes.paperConference;
    case crossRefTypes.reportSeries:
      return cslTypes.report;
    case crossRefTypes.standard:
    case crossRefTypes.standardSeries:
      return cslTypes.patent;
    case crossRefTypes.postedContent:
      return cslTypes.webpage;
    case crossRefTypes.dissertation:
      return cslTypes.thesis;
    case crossRefTypes.dataset:
      return cslTypes.dataset;
    default:
      return cslTypes.article;
  }
}

export const crossRefTypes = {
  bookSection: 'book-section',
  monograph: 'monograph',
  report: 'report',
  peerReview: 'peer-review',
  bookTrack: 'book-track',
  journalArticle: 'journal-article',
  bookPart: 'book-part',
  other: 'other',
  book: 'book',
  journalVolume: 'journal-volume',
  bookSet: 'book-set',
  referenceEntry: 'reference-entry',
  proceedingsArticle: 'proceedings-article',
  journal: 'journal',
  component: 'component',
  bookChapter: 'book-chapter',
  proceedingsSeries: 'proceedings-series',
  reportSeries: 'report-series',
  proceedings: 'proceedings',
  standard: 'standard',
  referenceBook: 'reference-book',
  postedContent: 'posted-content',
  journalIssue: 'journal-issue',
  dissertation: 'dissertation',
  dataset: 'dataset',
  bookSeries: 'book-series',
  editedBook: 'edited-book',
  standardSeries: 'standard-series',
};
