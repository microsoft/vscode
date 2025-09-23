/*
 * insert_citation-panel-doi.ts
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

import { EditorUI } from '../../../api/ui-types';

import { suggestCiteId, formatAuthors, formatIssuedDate } from '../../../api/cite';
import { CSL, imageForType } from '../../../api/csl';
import { DOIServer } from '../../../api/doi';
import { logException } from '../../../api/log';
import { NavigationTreeNode } from '../../../api/widgets/navigation-tree';

import {
  CitationSourcePanelProps,
  CitationSourcePanelProvider,
  CitationListEntry,
  CitationSourceListStatus,
  errorForStatus,
  matchExistingSourceCitationListEntry,
} from './insert_citation-source-panel';
import { CitationSourceLatentSearchPanel } from './insert_citation-source-panel-latent-search';

import './insert_citation-source-panel-doi.css';
import { BibliographyManager } from '../../../api/bibliography/bibliography';

const kDOIType = 'DOI Search';

export function doiSourcePanel(
  ui: EditorUI,
  server: DOIServer,
  bibliographyManager: BibliographyManager
): CitationSourcePanelProvider {
  return {
    key: '76561E2A-8FB7-4D4B-B235-9DD8B8270EA1',
    panel: DOISourcePanel,
    treeNode: () => {
      return {
        key: 'DOI',
        name: ui.context.translateText('From DOI'),
        image: ui.images.citations?.doi,
        type: kDOIType,
        children: [],
        expanded: true,
      };
    },
    progressMessage: ui.context.translateText('Looking up DOI....'),
    placeHolderMessage: ui.context.translateText('Paste or enter a DOI to find citation data.'),
    search: async (searchTerm: string, _selectedNode: NavigationTreeNode, existingCitationIds: string[]) => {
      try {
        searchTerm = searchTerm.trim();
        const result = await server.fetchCSL(searchTerm);
        if (result.status === 'ok') {

          // Form the entry
          const doi = searchTerm;
          const csl = result.message;
          const citation = matchExistingSourceCitationListEntry(doi, existingCitationIds, ui, bibliographyManager) || toCitationListEntry(csl!, existingCitationIds, ui);

          return Promise.resolve({
            citations: citation ? [citation] : [],
            status: CitationSourceListStatus.default,
            statusMessage: '',
          });
        } else if (result.status === 'notfound') {
          return Promise.resolve({
            citations: [],
            status: CitationSourceListStatus.noResults,
            statusMessage: ui.context.translateText('No data for this DOI could be found.'),
          });
        } else {
          return Promise.resolve({
            citations: [],
            status: CitationSourceListStatus.error,
            statusMessage: errorForStatus(ui, result.status, 'for this DOI'),
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

export const DOISourcePanel = React.forwardRef<HTMLDivElement, CitationSourcePanelProps>(
  (props: CitationSourcePanelProps, ref) => {
    // Track whether we are mounted to allow a latent search that returns after the
    // component unmounts to nmot mutate state further
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
        searchPlaceholderText={props.ui.context.translateText('Paste a DOI to search')}
        status={props.status}
        statusMessage={props.statusMessage}
        ui={props.ui}
        ref={ref}
      />
    );
  },
);

function toCitationListEntry(
  csl: CSL | undefined,
  existingCitationIds: string[],
  ui: EditorUI,
): CitationListEntry | undefined {
  if (csl) {
    const suggestedId = suggestCiteId(existingCitationIds, csl);
    const providerKey = 'doi';
    return {
      id: suggestedId,
      isIdEditable: true,
      type: csl.type,
      title: csl.title || csl['short-title'] || csl['original-title'] || '',
      date: formatIssuedDate(csl.issued),
      journal: csl['container-title'] || csl['short-container-title'] || csl.publisher,
      doi: csl.DOI,
      image: imageForType(ui.images, csl.type)[ui.prefs.darkMode() ? 1 : 0],
      authors: (length: number) => {
        return formatAuthors(csl.author, length);
      },
      toBibliographySource: (finalId: string) => {
        return Promise.resolve({ ...csl, id: finalId, providerKey });
      },
      isSlowGeneratingBibliographySource: false,
    };
  }
  return undefined;
}
