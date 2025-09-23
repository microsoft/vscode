/*
 * bibliography.ts
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

import Fuse from 'fuse.js';
import { PandocServer } from '../pandoc';

import { EditorUI } from '../ui-types';
import { ParsedYaml, parseYamlNodes } from '../yaml';
import { CSL } from '../csl';
import { BibliographyDataProviderLocal, kLocalBibliographyProviderKey } from './bibliography-provider_local';
import { BibliographyDataProviderZotero } from './bibliography-provider_zotero';
import { toBibTeX } from './bibDB';
import { joinPaths, isAbsolute } from '../path';
import { ZoteroServer } from 'editor-types';

export interface BibliographyFile {
  displayPath: string;
  fullPath: string;
  isProject: boolean;
  writable: boolean;
}

export function bibliographyFileForPath(path: string, ui: EditorUI): BibliographyFile {
  return {
    displayPath: path,
    fullPath: isAbsolute(path, ui.context.isWindowsDesktop()) ? path : joinPaths(ui.context.getDefaultResourceDir(), path),
    isProject: false,
    writable: true,
  };
}

export interface BibliographyType {
  extension: string;
  displayName: string;
  default: boolean;
}

// The types of bibliography files and the default value
export function bibliographyTypes(ui: EditorUI): BibliographyType[] {
  const defaultBiblioType = ui.prefs.bibliographyDefaultType();
  return [
    {
      displayName: ui.context.translateText('BibTeX'),
      extension: 'bib',
      default: defaultBiblioType === 'bib',
    },
    {
      displayName: ui.context.translateText('CSL-YAML'),
      extension: 'yaml',
      default: defaultBiblioType === 'yaml',
    },
    {
      displayName: ui.context.translateText('CSL-JSON'),
      extension: 'json',
      default: defaultBiblioType === 'json',
    },
  ];
}

export interface BibliographyDataProvider {
  key: string;
  name: string;
  requiresWritable: boolean;

  isEnabled(): boolean;
  load(
    ui: EditorUI,
    docPath: string | null,
    resourcePath: string,
    yamlBlocks: ParsedYaml[],
    refreshCollectionData?: boolean,
  ): Promise<boolean>;
  collections(): BibliographyCollection[];
  items(): BibliographySourceWithCollections[];
  itemsForCollection(collectionKey: string): BibliographySourceWithCollections[];
  bibliographyPaths(doc: ProsemirrorNode, ui: EditorUI): BibliographyFile[];
  generateBibTeX(ui: EditorUI, id: string, csl: CSL): Promise<string | undefined>;
  warningMessage(): string | undefined;
}

export interface BibliographyCollection {
  name: string;
  key: string;
  provider: string;
  parentKey?: string;
}


// The individual bibliographic source
export interface BibliographySource extends CSL {
  id: string;
  providerKey: string;
}

export interface BibliographySourceWithCollections extends BibliographySource {
  collectionKeys: string[];
}

// The fields and weights that will indexed and searched
// when searching bibliographic sources
const kFields: Fuse.FuseOptionKeyObject<void>[] = [
  { name: 'id', weight: 30 },
  { name: 'author.family', weight: 15 },
  { name: 'author.literal', weight: 15 },
  { name: 'issued.raw', weight: 15 },
  { name: 'title', weight: 15 },
  { name: 'author.given', weight: 10 },
  { name: 'providerKey', weight: 0.01 },
  { name: 'collectionKeys', weight: 0.01 },
];

const kSearchOptions = {
  isCaseSensitive: false,
  shouldSort: true,
  includeMatches: false,
  includeScore: false,
  keys: kFields,
};

export class BibliographyManager {
  private providers: BibliographyDataProvider[];
  private sources?: BibliographySourceWithCollections[];
  private writable?: boolean;
  private searchIndex?: Fuse<BibliographySourceWithCollections>;

  public constructor(server: PandocServer, zoteroServer?: ZoteroServer) {
    this.providers = [new BibliographyDataProviderLocal(server)];
    if (zoteroServer) {
      this.providers.push(new BibliographyDataProviderZotero(zoteroServer));
    }
  }

  public async prime(ui: EditorUI, doc: ProsemirrorNode) {
    // Load the bibliography
    await this.load(ui, doc, true);
  }

  public async loadLocal(ui: EditorUI, doc: ProsemirrorNode) {
    await this.load(ui, doc, false, true);
  }

  public async load(ui: EditorUI, doc: ProsemirrorNode, refreshCollectionData?: boolean, localOnly?: boolean): Promise<void> {
    // read the Yaml blocks from the document
    const parsedYamlNodes = parseYamlNodes(doc);

    // Currently edited doc
    const docPath = ui.context.getDocumentPath();

    // Load each provider
    const providers = localOnly ? this.providers.filter(provider => provider.requiresWritable === false) : this.providers;
    const providersNeedUpdate = await Promise.all(
      providers.map(provider =>
        provider.load(ui, docPath, ui.context.getDefaultResourceDir(), parsedYamlNodes, refreshCollectionData),
      ),
    );

    // Once loaded, see if any of the providers required an index update
    const needsIndexUpdate = providersNeedUpdate.reduce((prev, curr) => prev || curr);

    // Update the index if anything requires that we do so
    if (needsIndexUpdate) {
      // Get the entries
      const providersEntries = this.providers.map(provider => provider.items());

      // These are in arbitrary order, so sort them alphabetically
      const idSort = (a: BibliographySource, b: BibliographySource) => {
        return a.id.localeCompare(b.id);
      };
      this.sources = ([] as BibliographySourceWithCollections[]).concat(...providersEntries).sort(idSort);

      this.searchIndex = this.getFuse(this.sources);
    }

    // Is this a writable bibliography
    this.writable = this.isWritable(doc, ui);
  }

  public hasSources() {
    return this.allSources().length > 0;
  }

  public allSources(): BibliographySourceWithCollections[] {
    if (this.sources && this.allowsWrites()) {
      return this.sources;
    } else {
      return this.sources?.filter(source => source.providerKey === kLocalBibliographyProviderKey) || [];
    }
    return [];
  }

  public sourcesForProvider(providerKey: string): BibliographySourceWithCollections[] {
    return this.allSources().filter(item => item.providerKey === providerKey);
  }

  public sourcesForProviderCollection(provider: string, collectionKey: string): BibliographySourceWithCollections[] {
    return this.sourcesForProvider(provider).filter(item => item.collectionKeys.includes(collectionKey));
  }

  public localSources(): BibliographySourceWithCollections[] {
    return this.allSources().filter(source => source.providerKey === kLocalBibliographyProviderKey);
  }

  public allowsWrites(): boolean {
    return this.writable || false;
  }

  private isWritable(doc: ProsemirrorNode, ui: EditorUI): boolean {
    const bibliographyFiles = this.bibliographyFiles(doc, ui);
    if (bibliographyFiles.length === 0) {
      // Since there are no bibliographies, we can permit writing a fresh one
      return true;
    }
    return bibliographyFiles.filter(bibFile => bibFile.writable).length > 0;
  }

  public writableBibliographyFiles(doc: ProsemirrorNode, ui: EditorUI) {
    return this.bibliographyFiles(doc, ui).filter(bibFile => bibFile.writable);
  }

  public bibliographyFiles(doc: ProsemirrorNode, ui: EditorUI): BibliographyFile[] {
    const bibliographyPaths = this.providers.map(provider => provider.bibliographyPaths(doc, ui));
    return ([] as BibliographyFile[]).concat(...bibliographyPaths);
  }

  public localProviders(): BibliographyDataProvider[] {
    if (this.allowsWrites()) {
      return this.providers;
    } else {
      return this.providers.filter(provider => provider.requiresWritable === false);
    }
  }

  public providerName(providerKey: string): string | undefined {
    const dataProvider = this.providers.find(prov => prov.key === providerKey);
    return dataProvider?.name;
  }

  // Allows providers to generate bibTeX, if needed. This is useful in contexts
  // like Zotero where a user may be using the Better Bibtex plugin which can generate
  // superior BibTeX using things like stable citekeys with custom rules, and more.
  //
  // If the provider doesn't provide BibTeX, we can generate it ourselves
  public async generateBibTeX(ui: EditorUI, id: string, csl: CSL, provider?: string): Promise<string | undefined> {
    const dataProvider = this.providers.find(prov => prov.key === provider);
    if (dataProvider) {
      const dataProviderBibTeX = dataProvider.generateBibTeX(ui, id, csl);
      if (dataProviderBibTeX) {
        return dataProviderBibTeX;
      }
    }
    return Promise.resolve(toBibTeX(id, csl));
  }

  public warning(): string | undefined {
    const warningProvider = this.providers.find(provider => provider.warningMessage());
    if (warningProvider) {
      return warningProvider.warningMessage();
    } else {
      return undefined;
    }
  }

  public warningForProvider(providerKey?: string): string | undefined {
    if (providerKey) {
      const warningProvider = this.providers.find(prov => prov.key === providerKey);
      if (warningProvider) {
        return warningProvider.warningMessage();
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  public findDoiInLocalBibliography(doi: string): BibliographySourceWithCollections | undefined {
    // NOTE: This will only search sources that have already been loaded.
    // Please be sure to use load() before calling this or
    // accept the risk that this will not properly search for a DOI if the
    // bibliography hasn't already been loaded.
    return this.localSources().find(source => source.DOI === doi);
  }

  public findIdInLocalBibliography(id: string): BibliographySourceWithCollections | undefined {
    // NOTE: This will only search sources that have already been loaded.
    // Please be sure to use load() before calling this or
    // accept the risk that this will not properly search for a DOI if the
    // bibliography hasn't already been loaded.

    return this.localSources().find(source => source.id === id);
  }

  // A general purpose search interface for filtered searching
  public search(query?: string, providerKey?: string, collectionKey?: string): BibliographySourceWithCollections[] {
    const limit = 100;
    if (query && query.length > 0) {
      // These are ordered by search score, so leave as is
      if (providerKey && collectionKey) {
        return this.searchProviderCollection(query, limit, providerKey, collectionKey);
      } else if (providerKey) {
        return this.searchProvider(query, limit, providerKey);
      } else {
        return this.searchAllSources(query, limit);
      }
    } else {
      if (providerKey && collectionKey) {
        return this.sourcesForProviderCollection(providerKey, collectionKey);
      } else if (providerKey) {
        return this.sourcesForProvider(providerKey);
      } else {
        return this.allSources();
      }
    }
  }

  public searchAllSources(query: string, limit: number): BibliographySourceWithCollections[] {
    return this.searchSources(query, limit, this.allSources());
  }

  public searchSources(
    query: string,
    limit: number,
    sources: BibliographySourceWithCollections[],
  ): BibliographySourceWithCollections[] {
    // NOTE: This will only search sources that have already been loaded.
    // Please be sure to use load() before calling this or
    // accept the risk that this will not properly search for a source if the
    // bibliography hasn't already been loaded.
    if (sources && this.searchIndex) {
      // NOTE: Search performance can really drop off for long strings
      // Test cases start at 20ms to search for a single character
      // grow to 270ms to search for 20 character string
      // grow to 1060ms to search for 40 character string
      const searchResults = this.searchIndex.search(query, { ...kSearchOptions, limit });
      const items = searchResults.map((result: { item: BibliographySourceWithCollections }) => result.item);

      // Filter out any non local items if this isn't a writable bibliography
      const filteredItems = this.allowsWrites()
        ? items
        : items.filter(item => item.provider === kLocalBibliographyProviderKey);
      return filteredItems;
    } else {
      return [];
    }
  }

  // Search only a specific provider
  public searchProvider(query: string, limit: number, providerKey: string): BibliographySourceWithCollections[] {
    const orFields = kFields.flatMap(field => {
      if (Array.isArray(field)) {
        return field.map(name => ({ [name]: query }));
      } else {
        return {
          [field.name as string]: query,
        };
      }
      
    });
    const q = {
      $and: [
        { providerKey },
        {
          $or: orFields,
        },
      ],
    };

    if (this.searchIndex) {
      const searchResults = this.searchIndex.search(q, { limit });
      return searchResults.map((result: { item: BibliographySourceWithCollections }) => result.item);
    } else {
      return [];
    }
  }

  // Search a specific provider and collection
  public searchProviderCollection(
    query: string,
    limit: number,
    providerKey: string,
    collectionKey: string,
  ): BibliographySourceWithCollections[] {
    const orFields = kFields.flatMap(field => {
      if (Array.isArray(field.name)) {
        return field.name.map(name => ( { [name]: query }));
      } else {
        return {
          [field.name as string]: query,
        };
      }
      
    });
    const q = {
      $and: [
        {
          providerKey,
        },
        {
          collectionKeys: collectionKey,
        },
        {
          $or: orFields,
        },
      ],
    };

    if (this.searchIndex) {
      const searchResults = this.searchIndex.search(q, { limit });
      return searchResults.map((result: { item: BibliographySourceWithCollections }) => result.item);
    } else {
      return [];
    }
  }

  private getFuse(bibSources: BibliographySourceWithCollections[]) {
    // build search index
    const options = {
      ...kSearchOptions,
      keys: kFields.map(field => field.name),
    };
    const index = Fuse.createIndex<BibliographySourceWithCollections>(options.keys, bibSources);
    return new Fuse(bibSources, options, index);
  }
}
