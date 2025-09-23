// Panels get a variety of information as properties to permit them to search

import { WidgetProps } from '../../../api/widgets/react';

import { EditorUI } from '../../../api/ui-types';

import { NavigationTreeNode } from '../../../api/widgets/navigation-tree';
import { BibliographySource, BibliographyManager } from '../../../api/bibliography/bibliography';
import { CSL, imageForType } from '../../../api/csl';
import { suggestCiteId, formatIssuedDate, formatAuthors } from '../../../api/cite';

// citations and add them
export interface CitationSourcePanelProps extends WidgetProps {
  ui: EditorUI;
  height: number;

  searchTerm: string;
  onSearchTermChanged: (term: string) => void;
  onExecuteSearch: (term: string) => void;

  citations: CitationListEntry[];
  citationsToAdd: CitationListEntry[];

  onAddCitation: (citation: CitationListEntry) => void;
  onRemoveCitation: (citation: CitationListEntry) => void;
  onConfirm: VoidFunction;

  selectedIndex: number;
  onSelectedIndexChanged: (index: number) => void;

  status: CitationSourceListStatus;
  statusMessage: string;

  warningMessage: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: React.Ref<any>;
}

// Citation Panels Providers are the core element of ths dialog. Each provider provides
// the main panel UI as well as the tree to display when the panel is displayed.
export interface CitationSourcePanelProvider {
  key: string;
  panel: React.FC<CitationSourcePanelProps>;
  treeNode(): NavigationTreeNode;
  placeHolderMessage?: string;
  progressMessage?: string;
  warningMessage?: string;
  typeAheadSearch?: (
    term: string,
    selectedNode: NavigationTreeNode,
    existingCitationIds: string[],
    onResults: (result: CitationSourcePanelSearchResult) => void
  ) => void;
  search?: (
    term: string,
    selectedNode: NavigationTreeNode,
    existingCitationIds: string[],
  ) => Promise<CitationSourcePanelSearchResult>;
}

export interface CitationSourcePanelSearchResult {
  citations: CitationListEntry[];
  status: CitationSourceListStatus;
  statusMessage: string;
}

export interface CitationListEntry extends BibliographySourceProvider {
  id: string;
  isIdEditable: boolean;
  image?: string;
  imageAdornment?: string;
  type: string;
  title: string;
  authors: (width: number) => string;
  date: string;
  journal: string | undefined;
  doi?: string;
}

export interface BibliographySourceProvider {
  id: string;
  isSlowGeneratingBibliographySource: boolean;
  toBibliographySource: (id: string) => Promise<BibliographySource>;
}

export enum CitationSourceListStatus {
  default,
  inProgress,
  noResults,
  error,
}

export function errorForStatus(ui: EditorUI, status: string, providerName: string) {
  return status === 'nohost'
    ? ui.context.translateText(`Unable to search ${providerName}. Please check your network connection and try again.`)
    : ui.context.translateText(`An error occurred while searching ${providerName}.`);
}


export function matchExistingSourceCitationListEntry(doi: string, existingIds: string[], ui: EditorUI, bibliographyManager: BibliographyManager) {

  const localSources = bibliographyManager.localSources();
  const existingSource = localSources.find(source => {
    return source.DOI?.toLowerCase() === doi.toLowerCase();
  });
  if (existingSource) {
    return existingSourceToCitationListEntry(existingSource, existingIds, ui);
  } else {
    return undefined;
  }
}

function existingSourceToCitationListEntry(csl: CSL, existingIds: string[], ui: EditorUI): CitationListEntry {
  const providerKey = 'pubmed';
  return {
    id: csl.id || suggestCiteId(existingIds, csl),
    isIdEditable: false,
    title: csl.title || '',
    doi: csl.DOI,
    type: '',
    date: formatIssuedDate(csl.issued) || '',
    journal: csl["container-title"],
    authors: (length: number) => {
      return formatAuthors(csl.author || [], length);
    },
    image: imageForType(ui.images, csl.type)[ui.prefs.darkMode() ? 1 : 0],
    toBibliographySource: async (finalId: string) => {
      // Generate CSL using the DOI
      return { ...csl, id: finalId, providerKey };
    },
    isSlowGeneratingBibliographySource: true,
  };
}