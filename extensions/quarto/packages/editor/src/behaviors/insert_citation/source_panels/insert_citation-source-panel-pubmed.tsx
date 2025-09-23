/*
 * insert_citation-source-panel-pubmed.tsx
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
import React from 'react';

import { BibliographyManager } from '../../../api/bibliography/bibliography';
import { createUniqueCiteId } from '../../../api/cite';
import { sanitizeForCiteproc } from '../../../api/csl';
import { DOIServer } from '../../../api/doi';
import { logException } from '../../../api/log';
import { NavigationTreeNode } from '../../../api/widgets/navigation-tree';
import { suggestCiteId, imageForType } from '../../../api/pubmed';
import { EditorUI } from '../../../api/ui-types';

import {
  CitationSourcePanelProps,
  CitationSourcePanelProvider,
  CitationListEntry,
  CitationSourceListStatus,
  errorForStatus,
  matchExistingSourceCitationListEntry,
} from './insert_citation-source-panel';
import { CitationSourceLatentSearchPanel } from './insert_citation-source-panel-latent-search';
import { PubMedDocument, PubMedServer } from 'editor-types';

export function pubmedSourcePanel(
  ui: EditorUI,
  server: PubMedServer,
  doiServer: DOIServer,
  bibliographyManager: BibliographyManager
): CitationSourcePanelProvider {
  const kPubmedType = 'Pubmed';
  return {
    key: 'EF556233-05B0-4678-8216-38061908463F',
    panel: PubmedSourcePanel,
    treeNode: () => {
      return {
        key: 'PubMed',
        name: ui.context.translateText('PubMed'),
        image: ui.images.citations?.pubmed,
        type: kPubmedType,
        children: [],
        expanded: true,
      };
    },
    progressMessage: ui.context.translateText('Searching PubMed....'),
    placeHolderMessage: ui.context.translateText('Enter a PubMed query to search for citations.'),
    search: async (searchTerm: string, _selectedNode: NavigationTreeNode, existingCitationIds: string[]) => {
      try {
        const noResultsMessage = ui.context.translateText('No results matching these search terms.');

        // Do the PubMed Search
        const pubMedResult = await server.search(searchTerm);
        switch (pubMedResult.status) {
          case 'ok':
            if (pubMedResult.message !== null) {
              // There is a message
              // PubMed Results and Existing Ids
              const docs: PubMedDocument[] = pubMedResult.message;
              const dedupeCitationIds = existingCitationIds;

              // Create Citation List Entries for these PubMed docs
              const citationEntries = docs.map(doc => {
                const citationEntry = matchExistingSourceCitationListEntry(doc.doi, dedupeCitationIds, ui, bibliographyManager) || toCitationListEntry(doc, dedupeCitationIds, ui, doiServer);
                if (citationEntry && citationEntry.id) {
                  // Add this id to the list of existing Ids so future ids will de-duplicate against this one
                  dedupeCitationIds.push(citationEntry.id);
                }
                return citationEntry;
              });

              // Return the search result
              return Promise.resolve({
                citations: citationEntries,
                status:
                  citationEntries.length > 0 ? CitationSourceListStatus.default : CitationSourceListStatus.noResults,
                statusMessage: citationEntries.length > 0 ? '' : noResultsMessage,
              });
            } else {
              // No message, no results
              return Promise.resolve({
                citations: [],
                status: CitationSourceListStatus.noResults,
                statusMessage: noResultsMessage,
              });
            }

          default:
            // Resolve with Error
            return Promise.resolve({
              citations: [],
              status: CitationSourceListStatus.error,
              statusMessage: ui.context.translateText(errorForStatus(ui, pubMedResult.status, 'PubMed')),
            });
        }
      } catch (e) {
        logException(e);
        return Promise.resolve({
          citations: [],
          status: CitationSourceListStatus.error,
          statusMessage: ui.context.translateText('An unknown error occurred. Please try again.'),
        });
      }
    },
  };
}

export const PubmedSourcePanel = React.forwardRef<HTMLDivElement, CitationSourcePanelProps>(
  (props: CitationSourcePanelProps, ref) => {
    return (
      <CitationSourceLatentSearchPanel
        height={props.height}
        citations={props.citations}
        citationsToAdd={props.citationsToAdd}
        searchTerm={props.searchTerm}
        onSearchTermChanged={props.onSearchTermChanged}
        executeSearch={props.onExecuteSearch}
        onAddCitation={props.onAddCitation}
        onRemoveCitation={props.onRemoveCitation}
        selectedIndex={props.selectedIndex}
        onSelectedIndexChanged={props.onSelectedIndexChanged}
        onConfirm={props.onConfirm}
        searchPlaceholderText={props.ui.context.translateText('Search PubMed for Citations')}
        status={props.status}
        statusMessage={props.statusMessage}
        ui={props.ui}
        ref={ref}
      />
    );
  },
);

function toCitationListEntry(
  doc: PubMedDocument,
  existingIds: string[],
  ui: EditorUI,
  doiServer: DOIServer,
): CitationListEntry {
  const id = createUniqueCiteId(existingIds, suggestCiteId(doc));
  const providerKey = 'pubmed';
  return {
    id,
    isIdEditable: true,
    title: doc.title || '',
    doi: doc.doi,
    type: '',
    date: doc.pubDate || '',
    journal: doc.source,
    authors: () => {
      return formatAuthors(doc.authors || []);
    },
    image: imageForType(ui, doc.pubTypes)[ui.prefs.darkMode() ? 1 : 0],
    toBibliographySource: async (finalId: string) => {
      // Generate CSL using the DOI
      const doiResult = await doiServer.fetchCSL(doc.doi);
      const csl = doiResult.message!;
      const sanitizedCSL = sanitizeForCiteproc(csl);
      return { ...sanitizedCSL, id: finalId, providerKey };
    },
    isSlowGeneratingBibliographySource: true,
  };
}

function formatAuthors(authors: string[]) {
  return authors.join(',');
}
