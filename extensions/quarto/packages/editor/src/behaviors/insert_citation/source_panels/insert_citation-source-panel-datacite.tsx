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

import { 
  DOIServer, 
  DataCiteServer, 
  DataCiteRecord, 
  DataCiteCreator 
} from 'editor-types';

import { createUniqueCiteId } from '../../../api/cite';
import { imageForType } from '../../../api/csl';
import { suggestCiteId } from '../../../api/datacite';
import { NavigationTreeNode } from '../../../api/widgets/navigation-tree';
import { logException } from '../../../api/log';
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
import { BibliographyManager } from '../../../api/bibliography/bibliography';

export function dataciteSourcePanel(
  ui: EditorUI,
  server: DataCiteServer,
  doiServer: DOIServer,
  bibliographyManager: BibliographyManager
): CitationSourcePanelProvider {
  const kDataCiteType = 'Datacite';
  return {
    key: '66A6EADB-22AE-4DDD-BCD5-70BC0DEB8FB3',
    panel: DataCiteSourcePanel,
    treeNode: () => {
      return {
        key: 'DataCite',
        name: ui.context.translateText('DataCite'),
        image: ui.images.citations?.datacite,
        type: kDataCiteType,
        children: [],
        expanded: true,
      };
    },
    progressMessage: ui.context.translateText('Searching DataCite....'),
    placeHolderMessage: ui.context.translateText('Enter search terms to search DataCite'),
    search: async (searchTerm: string, _selectedNode: NavigationTreeNode, existingCitationIds: string[]) => {
      try {
        const dataciteResult = await server.search(searchTerm);
        const noResultsMessage = ui.context.translateText('No results matching these search terms.');
        switch (dataciteResult.status) {
          case 'ok':
            if (dataciteResult.message !== null) {
              const records: DataCiteRecord[] = dataciteResult.message;
              const dedupeCitationIds = existingCitationIds;
              const citationEntries = records.map(record => {
                const citationEntry = matchExistingSourceCitationListEntry(record.doi, dedupeCitationIds, ui, bibliographyManager) || toCitationListEntry(record, dedupeCitationIds, ui, doiServer);
                if (citationEntry) {
                  // Add this id to the list of existing Ids so future ids will de-duplicate against this one
                  dedupeCitationIds.push(citationEntry.id);
                }
                return citationEntry;
              });
              return Promise.resolve({
                citations: citationEntries,
                status:
                  citationEntries.length > 0 ? CitationSourceListStatus.default : CitationSourceListStatus.noResults,
                statusMessage: citationEntries.length > 0 ? '' : noResultsMessage,
              });
            } else {
              // No results
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
              statusMessage: ui.context.translateText(errorForStatus(ui, dataciteResult.status, 'DataCite')),
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

export const DataCiteSourcePanel = React.forwardRef<HTMLDivElement, CitationSourcePanelProps>(
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
        searchPlaceholderText={props.ui.context.translateText('Search DataCite for Citations')}
        status={props.status}
        statusMessage={props.statusMessage}
        ui={props.ui}
        ref={ref}
      />
    );
  },
);

function toCitationListEntry(
  record: DataCiteRecord,
  existingIds: string[],
  ui: EditorUI,
  doiServer: DOIServer,
): CitationListEntry {
  const id = createUniqueCiteId(existingIds, suggestCiteId(record));
  const providerKey = 'datacite';
  return {
    id,
    isIdEditable: true,
    title: record.title || '',
    type: record.type || '',
    date: record.publicationYear?.toString() || '',
    journal: record.publisher,
    image: imageForType(ui.images, record.type || '')[ui.prefs.darkMode() ? 1 : 0],
    doi: record.doi,
    authors: () => {
      return formatAuthors(record.creators || []);
    },
    toBibliographySource: async (finalId: string) => {
      // Generate CSL using the DOI
      const doiResult = await doiServer.fetchCSL(record.doi);

      const csl = doiResult.message!;
      return { ...csl, id: finalId, providerKey };
    },
    isSlowGeneratingBibliographySource: true,
  };
}

function formatAuthors(authors: DataCiteCreator[]) {
  return authors.map(creator => creator.fullName).join(',');
}
