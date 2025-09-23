/*
 * insert_citation-panel-packages.tsx
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
import { NavigationTreeNode } from '../../../api/widgets/navigation-tree';
import { imageForType, CSL, cslTypes, CSLDate } from '../../../api/csl';
import { bibtextTypeToCSLType } from '../../../api/bibtex/types';

import {
  CitationSourcePanelProvider,
  CitationSourcePanelProps,
  CitationListEntry,
  CitationSourceListStatus,
  CitationSourcePanelSearchResult,
} from './insert_citation-source-panel';
import { CitationSourceTypeheadSearchPanel } from './insert_citation-source-panel-typeahead-search';

import Fuse from 'fuse.js';
import uniqBy from 'lodash.uniqby';
import orderBy from 'lodash.orderby';
import { EnvironmentServer, RPackageCitation, RPackageCitationPerson, RPackageInfo } from 'editor-types';

const kPackageType = 'Packages';

export function packageSourcePanel(
  ui: EditorUI,
  server: EnvironmentServer,
): CitationSourcePanelProvider {

  // Fetch the packages and index when needed
  let pkgInfos: RPackageInfo[];
  let pkgIndex: PackageSearch;
  const getPackageIndex = async () => {
    if (pkgIndex === undefined) {

      // Read the package state
      const pkgState = await server.getRPackageState();

      // Sorting in this way ensures that the packages are in alpha order and that in.project.library packages appear first
      // uniqby will always select the first uniq entry, so this ensures that in.project.library packages are preferred
      // (in.project.library represents a package provided as a part of packrat or renv)
      const sorted = orderBy(pkgState.package_list, [pkg => pkg.name.toLowerCase(), 'in.project.library'], ['asc', 'desc']);

      // Create the list of info and index
      pkgInfos = uniqBy(sorted, pkg => pkg.name);
      pkgIndex = packageIndex(pkgInfos);
    }
    return {
      packageInfos: pkgInfos,
      index: pkgIndex
    };
  };

  return {
    key: '97863EFF-2075-43B2-8F0F-88A250CC33BE',
    panel: PackageSourcePanel,
    treeNode: () => {
      return {
        key: 'RPackages',
        name: ui.context.translateText('R Package'),
        image: ui.images.citations?.packages,
        type: kPackageType,
        children: [],
        expanded: true,
      };
    },
    typeAheadSearch: (searchTerm: string, _selectedNode: NavigationTreeNode, existingCitationIds: string[], onResults: (result: CitationSourcePanelSearchResult) => void) => {

      // Get the index, then search it
      getPackageIndex().then(({ packageInfos, index }) => {
        const matchingEntries = searchTerm ? index.search(searchTerm) : packageInfos;
        const citations = matchingEntries.map(pkg => {
          return toCitationListEntry(pkg, existingCitationIds, ui, server);
        });
        const status = citations.length > 0 ? CitationSourceListStatus.default : CitationSourceListStatus.noResults;
        const statusMessage = citations.length > 0 ? "" : ui.context.translateText('No matching packages');
        onResults({
          citations,
          status,
          statusMessage
        });
      });
    },
  };
}

export const PackageSourcePanel = React.forwardRef<HTMLDivElement, CitationSourcePanelProps>(
  (props: CitationSourcePanelProps, ref) => {
    return (
      <>
        <CitationSourceTypeheadSearchPanel
          height={props.height}
          citations={props.citations}
          citationsToAdd={props.citationsToAdd}
          searchTerm={props.searchTerm}
          onSearchTermChanged={props.onSearchTermChanged}
          selectedIndex={props.selectedIndex}
          onSelectedIndexChanged={props.onSelectedIndexChanged}
          onAddCitation={props.onAddCitation}
          onRemoveCitation={props.onRemoveCitation}
          onConfirm={props.onConfirm}
          status={props.status}
          statusMessage={props.statusMessage}
          ui={props.ui}
          ref={ref}
        />
      </>
    );
  },
);

function toCitationListEntry(
  packageInfo: RPackageInfo,
  existingCitationIds: string[],
  ui: EditorUI,
  server: EnvironmentServer
): CitationListEntry {
  return {
    id: suggestPackageCiteId(packageInfo.name, existingCitationIds),
    isIdEditable: true,
    type: cslTypes.entry,
    title: packageInfo.desc || "",
    date: packageInfo.version || "",
    journal: "",
    doi: "",
    image: imageForType(ui.images, cslTypes.book)[ui.prefs.darkMode() ? 1 : 0],
    authors: () => {
      return packageInfo.name || "";
    },
    toBibliographySource: async (finalId: string) => {
      const csl = await packageToCSL(packageInfo, server);
      if (csl) {
        return { ...csl, id: finalId, providerKey: kPackageType };
      } else {
        // This should never happen
        return { type: cslTypes.book, id: finalId, providerKey: kPackageType };
      }
    },
    isSlowGeneratingBibliographySource: false,
  };
}

async function packageToCSL(packageInfo: RPackageInfo, server: EnvironmentServer) {
  const citeInfos = await server.getRPackageCitations(packageInfo.name);
  if (citeInfos && citeInfos.length) {
    // RPackages can return multiple possible citations (e.g. the package, the paper in which it appeared,
    // a book documenting it), but the first one is by convention the package itself
    const citeInfo = citeInfos[0];
    return packageCitationToCSL(citeInfo);
  } else {
    return undefined;
  }
}


function packageCitationToCSL(citeInfo: RPackageCitation) {
  const toCSLNames = (people?: RPackageCitationPerson[]) => {
    if (people) {
      return people.map(person => {
        return {
          family: person.family,
          given: person.given.join(' ')
        };
      });
    } else {
      return undefined;
    }
  };

  const toCSLDate = (year?: string): CSLDate | undefined => {
    if (year) {

      return {
        'date-parts': [[Number.parseInt(year, 10)]]
      };
    } else {
      return undefined;
    }
  };

  const csl: CSL = {
    type: bibtextTypeToCSLType(citeInfo.type),
    title: citeInfo.title,
  };

  if (citeInfo.doi !== null) {
    csl.DOI = citeInfo.doi;
  }
  if (citeInfo.url !== null) {
    csl.URL = citeInfo.url;
  }
  if (citeInfo.publisher !== null) {
    csl.publisher = citeInfo.publisher;
  }
  if (citeInfo.booktitle !== null) {
    csl['container-title'] = citeInfo.booktitle;
  }
  if (citeInfo.pages !== null) {
    csl.page = citeInfo.pages;
  }
  if (citeInfo.volume !== null) {
    csl.volume = citeInfo.volume;
  }
  if (citeInfo.author !== null) {
    csl.author = toCSLNames(citeInfo.author);
  }
  if (citeInfo.year !== null) {
    csl.issued = toCSLDate(citeInfo.year);
  }
  return csl;

}

// Create a citeky using the package, de-duplicating by incrementing a counter
// until the key is unique
function suggestPackageCiteId(name: string, existingCitationIds: string[]) {


  let retryCount = 0;
  const incrementName = () => {
    retryCount = retryCount + 1;
    if (retryCount === 1) {
      return name;
    } else {
      return `${name}-${retryCount}`;
    }
  };

  let citekey = incrementName();
  while (existingCitationIds.includes(citekey)) {
    citekey = incrementName();
  }
  return citekey;
}


// Search index for packages
interface PackageSearch {
  search(searchTerm: string): RPackageInfo[];
}

const searchFields: Fuse.FuseOptionKeyObject<RPackageInfo>[] = [
  { name: 'name', weight: 30 },
  { name: 'desc', weight: 15 },
  { name: 'version', weight: 5 },
];

function packageIndex(entries: RPackageInfo[]): PackageSearch {
  // build search index
  const options = {
    isCaseSensitive: false,
    shouldSort: true,
    includeMatches: false,
    includeScore: false,
    minMatchCharLength: 1,
    threshold: 0.2,
    keys: searchFields,
    limit: 10000
  };
  const index = Fuse.createIndex<RPackageInfo>(searchFields.map(searchField => searchField.name), entries);
  const fuse = new Fuse(entries, options, index);
  return {
    search: (searchTerm: string): RPackageInfo[] => {
      const results = fuse.search(searchTerm, options);
      return results.map(result => result.item);
    },
  };
}

