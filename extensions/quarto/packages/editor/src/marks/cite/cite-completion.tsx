/*
 * cite-completion.tsx
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
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { DecorationSet, EditorView } from 'prosemirror-view';

import React from 'react';
import uniqby from 'lodash.uniqby';

import { BibliographyManager } from '../../api/bibliography/bibliography';
import { CompletionHandler, CompletionResult, CompletionHeaderProps } from '../../api/completion';
import { hasDOI } from '../../api/doi';
import { searchPlaceholderDecoration } from '../../api/placeholder';
import { EditorUI } from '../../api/ui-types';
import { CompletionItemView } from '../../api/widgets/completion';

import { EditorEvents } from '../../api/event-types';

import { parseCitation } from './cite';

import './cite-completion.css';
import { bibliographyCiteCompletionProvider } from './cite-completion-bibliography';
import { EditorFormat, kQuartoDocType } from '../../api/format';
import { quartoXrefCiteCompletionProvider, kCiteCompletionTypeXref } from './cite-completion-quarto-xref';
import { completionIndex, CiteCompletionSearch } from './cite-completion-search';
import { EditorServer } from 'editor-types';


const kAuthorMaxChars = 28;
const kMaxCitationCompletions = 100;
const kHeaderHeight = 20;

export const kCiteCompletionWidth = 400;
const kCiteCompletionItemPadding = 10;

export const kCitationCompleteScope = 'CitationScope';

// An entry which includes the source as well
// additional metadata for displaying a bibliograph item
export interface CiteCompletionEntry {
  id: string;
  type: string;
  primaryText: string;
  secondaryText: (len: number) => string;
  detailText: string;
  image?: string;
  imageAdornment?: string;
  replace: (view: EditorView, pos: number, server: EditorServer) => Promise<void>;
  index?: {
    secondary?: string;
    tertiary?: string;
  };
}

export interface CiteCompletionProvider {
  currentEntries: () => CiteCompletionEntry[] | undefined;
  streamEntries: (doc: ProsemirrorNode, onStreamReady: (entries: CiteCompletionEntry[]) => void) => void;
  awaitEntries: (doc: ProsemirrorNode) => Promise<CiteCompletionEntry[]>;
  warningMessage: () => string | undefined;
}

export function citationCompletionHandler(
  ui: EditorUI,
  _events: EditorEvents,
  bibManager: BibliographyManager,
  server: EditorServer,
  format: EditorFormat
): CompletionHandler<CiteCompletionEntry> {

  // Load the providers
  const completionProviders = [bibliographyCiteCompletionProvider(ui, bibManager)];
  if (format.docTypes.includes(kQuartoDocType)) {
    // If this is a Quarto doc, use the quartoXref provider
    completionProviders.push(quartoXrefCiteCompletionProvider(ui, server));
  }
  // create the search index
  const searchIndex = completionIndex();

  return {
    id: 'AB9D4F8C-DA00-403A-AB4A-05373906FD8C',

    scope: kCitationCompleteScope,

    completions: citationCompletions(ui, completionProviders, searchIndex),

    filter: (entries: CiteCompletionEntry[], _state: EditorState, token: string) => {
      return filterCitations(token, completionProviders, searchIndex, entries);
    },

    replace(view: EditorView, pos: number, entry: CiteCompletionEntry | null) {
      // If there is an entry selected, insert it into the document
      if (entry) {
        entry.replace(view, pos, server);
      }
      return Promise.resolve();
    },

    replacement(_schema: Schema, entry: CiteCompletionEntry | null): string | ProsemirrorNode | null {
      if (entry) {
        return entry.id;
      } else {
        return null;
      }
    },

    view: {
      header: () => {
        const warningProvider = completionProviders.find(provider => provider.warningMessage() !== undefined);
        if (warningProvider) {
          return {
            component: CompletionWarningHeaderView,
            height: kHeaderHeight,
            message: warningProvider.warningMessage(),
          };
        } else {
          return undefined;
        }
      },
      component: CiteCompletionItemView,
      key: entry => entry.id,
      width: kCiteCompletionWidth,
      height: 54,
      maxVisible: 5,
      hideNoResults: true,
    },
  };
}

function filterCitations(token: string, _completionProviders: CiteCompletionProvider[], citeSearch: CiteCompletionSearch, entries: CiteCompletionEntry[]) {
  // Empty query or DOI
  if (token.trim().length === 0 || hasDOI(token)) {
    return entries;
  }
  // Filter an exact match - if its exact match to an entry in the bibliography already, skip completion
  // Ignore any punctuation at the end of the token
  const tokenWithoutEndPunctuation = token.match(/.*[^,!?.:]/);
  const completionId = tokenWithoutEndPunctuation ? tokenWithoutEndPunctuation[0] : token;
  if (citeSearch.exactMatch(completionId)) {
    return [];
  }

  // Perform a search
  const searchResults = citeSearch.search(token, kMaxCitationCompletions);
  return searchResults || [];
}

function dedupe(entries: CiteCompletionEntry[]): CiteCompletionEntry[] {
  // Move the xrefs to the front to ensure that they are kept
  const orderedByType = entries.sort((a, b) => {
    if (a.type === b.type) {
      return 0;
    } else if (a.type === kCiteCompletionTypeXref) {
      return -1;
    } else {
      return 1;
    }
  });

  return uniqby(orderedByType, (entry: CiteCompletionEntry) => entry.id);
}

function sortEntries(entries: CiteCompletionEntry[]): CiteCompletionEntry[] {
  const dedupedSources = dedupe(entries);
  return dedupedSources.sort((a, b) => a.id.localeCompare(b.id));
}

function citationCompletions(ui: EditorUI, completionProviders: CiteCompletionProvider[], citeSearch: CiteCompletionSearch) {
  return (_text: string, context: EditorState | Transaction): CompletionResult<CiteCompletionEntry> | null => {

    const parsed = parseCitation(context);
    if (parsed) {
      return {
        token: parsed.token,
        pos: parsed.pos,
        offset: parsed.offset,
        completions: async () => {

          // If all providers have entries already loaded, we can use those and stream any updates
          const hasCurrentEntries = completionProviders.some(provider => provider.currentEntries());

          if (hasCurrentEntries) {

            let currentEntries: CiteCompletionEntry[] = [];
            completionProviders.forEach(provider => {
              const entries = provider.currentEntries();
              if (entries) {
                currentEntries = currentEntries || [];
                currentEntries.push(...entries);
              }
            });

            // Index the current Entries
            currentEntries = sortEntries(currentEntries);
            citeSearch.setEntries(currentEntries);

            // kick off another load which we'll stream in by setting entries
            let streamedEntries: CiteCompletionEntry[] | null = null;
            let loadedEntries: CiteCompletionEntry[] = [];
            let providerCount = 0;
            completionProviders.forEach(provider => {
              provider.streamEntries(context.doc, (entries: CiteCompletionEntry[]) => {
                providerCount = providerCount + 1;
                const updatedEntries = [...loadedEntries, ...entries];
                loadedEntries = sortEntries(updatedEntries);
                if (providerCount === completionProviders.length) {
                  streamedEntries = loadedEntries;
                  citeSearch.setEntries(loadedEntries);
                }
              });
            });

            // return stream
            return {
              items: currentEntries,
              stream: () => streamedEntries,
            };

          } else {
            // Otherwise, we need to wait and load the entries
            const promises = completionProviders.map(provider => provider.awaitEntries(context.doc));
            return Promise.all(promises).then(values => {
              const results: CiteCompletionEntry[] = [];

              values.forEach(value => results.push(...value));

              // Index the current Entries
              const sortedEntries = sortEntries(results);
              citeSearch.setEntries(sortedEntries);
              return sortedEntries;
            });
          }
        },
        decorations:
          parsed.token.length === 0
            ? DecorationSet.create(context.doc, [
              searchPlaceholderDecoration(context.selection.head, ui, ui.context.translateText('or DOI')),
            ])
            : undefined,
      };
    }
    return null;
  };
}

// The title may contain spans to control case specifically - consequently, we need
// to render the title as HTML rather than as a string
export const CiteCompletionItemView: React.FC<CiteCompletionEntry> = entry => {
  return (
    <CompletionItemView
      width={kCiteCompletionWidth - kCiteCompletionItemPadding}
      image={entry.image}
      imageAdornment={entry.imageAdornment}
      title={`@${entry.primaryText}`}
      detail={entry.secondaryText(kAuthorMaxChars - entry.primaryText.length)}
      subTitle={entry.detailText}
      htmlTitle={true}
    />
  );
};

const CompletionWarningHeaderView: React.FC<CompletionHeaderProps> = props => {
  return (
    <div className={'pm-completion-cite-warning pm-pane-border-color'}>
      {props.ui.context.translateText(props.message || 'An unexpected warning occurred.')}
    </div>
  );
};
