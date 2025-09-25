/* eslint-disable @typescript-eslint/no-unused-vars */

/*
 * server.ts
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

import { JsonRpcRequestTransport } from "../../core/src/jsonrpc.js";

import {
  BibliographyResult,
  CrossrefMessage,
  CrossrefServer,
  CrossrefWork,
  DataCiteResult,
  DataCiteServer,
  DOIResult,
  DOIServer,
  EditorServer,
  kCrossrefWorks,
  kDataCiteSearch,
  kDoiFetchCsl,
  kPandocAddtoBibliography,
  kPandocAstToMarkdown,
  kPandocCitationHtml,
  kPandocGetBibliography,
  kPandocGetCapabilities,
  kPandocListExtensions,
  kPandocMarkdownToAst,
  kPubMedSearch,
  kXRefIndexForFile,
  kXRefQuartoIndexForFile,
  kXRefQuartoXRefForId,
  kXRefXRefForId,
  kZoteroBetterBibtexExport,
  kZoteroGetActiveCollectionSpecs,
  kZoteroGetCollections,
  kZoteroGetLibraryNames,
  kZoteroValidateWebApiKey,
  kZoteroSetLibraryConfig,
  PandocAst,
  PandocCapabilitiesResult,
  PandocServer,
  PubMedResult,
  PubMedServer,
  XRefs,
  XRefServer,
  ZoteroCollectionSpec,
  ZoteroResult,
  ZoteroServer,
  ZoteroLibraryConfig,
} from "../../editor-types/src/index.js";


export function editorJsonRpcServer(request: JsonRpcRequestTransport) : EditorServer {
  return {
    pandoc: editorPandocJsonRpcServer(request),
    doi: editorDoiJsonRpcServer(request),
    crossref: editorCrossrefJsonRpcServer(request),
    datacite: editorDateCiteJsonRpcServer(request),
    pubmed: editorPubMedJsonRpcServer(request),
    xref: editorXRefJsonRpcServer(request),
    zotero: editorZoteroJsonRpcServer(request),
    // not currently implemented
    environment: undefined
  };
}

export function editorPandocJsonRpcServer(request: JsonRpcRequestTransport) : PandocServer {
  return {
    getCapabilities(): Promise<PandocCapabilitiesResult> {
      return request(kPandocGetCapabilities, []);
    },
    markdownToAst(
      markdown: string,
      format: string,
      options: string[]
    ): Promise<PandocAst> {
      return request(kPandocMarkdownToAst, [markdown, format, options]);
    },
    astToMarkdown(
      ast: PandocAst,
      format: string,
      options: string[]
    ): Promise<string> {
      return request(kPandocAstToMarkdown, [ast, format, options]);
    },
    listExtensions(format: string): Promise<string> {
      return request(kPandocListExtensions, [format]);
    },
    getBibliography(
      file: string | null,
      bibliography: string[],
      refBlock: string | null,
      etag: string | null
    ): Promise<BibliographyResult> {
      return request(kPandocGetBibliography, [
        file,
        bibliography,
        refBlock,
        etag,
      ]);
    },
    addToBibliography(
      bibliography: string,
      project: boolean,
      id: string,
      sourceAsJson: string,
      sourceAsBibTeX: string,
      documentPath: string | null,
    ): Promise<boolean> {
      return request(kPandocAddtoBibliography, [
        bibliography,
        project,
        id,
        sourceAsJson,
        sourceAsBibTeX,
        documentPath
      ]);
    },
    citationHTML(
      file: string | null,
      sourceAsJson: string,
      csl: string | null
    ): Promise<string> {
      return request(kPandocCitationHtml, [file, sourceAsJson, csl]);
    },
  }
}

export function editorDoiJsonRpcServer(request: JsonRpcRequestTransport) : DOIServer {
  return {
    fetchCSL(doi: string): Promise<DOIResult> {
      return request(kDoiFetchCsl, [doi]);
    }
  }
}

export function editorCrossrefJsonRpcServer(request: JsonRpcRequestTransport) : CrossrefServer {
  return {
    works(query: string): Promise<CrossrefMessage<CrossrefWork>> {
      return request(kCrossrefWorks, [query]);
    }
  }
}


export function editorDateCiteJsonRpcServer(request: JsonRpcRequestTransport) : DataCiteServer {
  return {
    search(query: string): Promise<DataCiteResult> {
      return request(kDataCiteSearch, [query]);
    }
  }
}

export function editorPubMedJsonRpcServer(request: JsonRpcRequestTransport) : PubMedServer {
  return {
    search(query: string): Promise<PubMedResult> {
      return request(kPubMedSearch, [query]);
    },
  }
}

export function editorZoteroJsonRpcServer(request: JsonRpcRequestTransport) : ZoteroServer {
  return {
    setLibraryConfig(config: ZoteroLibraryConfig): Promise<void> {
      return request(kZoteroSetLibraryConfig, [config])
    },

    validateWebAPIKey(key: string): Promise<boolean> {
      return request(kZoteroValidateWebApiKey, [key]);
    },

    getCollections(
      file: string | null,
      collections: string[],
      cached: ZoteroCollectionSpec[],
      useCache: boolean
    ): Promise<ZoteroResult> {
      return request(kZoteroGetCollections, [
        file,
        collections,
        cached,
        useCache,
      ]);
    },

    getLibraryNames(): Promise<ZoteroResult> {
      return request(kZoteroGetLibraryNames, []);
    },

    getActiveCollectionSpecs(
      file: string | null,
      collections: string[]
    ): Promise<ZoteroResult> {
      return request(kZoteroGetActiveCollectionSpecs, [file, collections]);
    },

    // Return status: nohost w/ warning text if it fails to
    // communciate w/ Better BibTeX. Otherwise returns
    // status: ok with exported text in message.
    betterBibtexExport(
      itemKeys: string[],
      translatorId: string,
      libraryId: number
    ): Promise<ZoteroResult> {
      return request(kZoteroBetterBibtexExport, [itemKeys, translatorId, libraryId]);
    }
  }
}

export function editorXRefJsonRpcServer(request: JsonRpcRequestTransport) : XRefServer {
  return {
    indexForFile(file: string) : Promise<XRefs> {
      return request(kXRefIndexForFile, [file]);
    },
    xrefForId(file: string, id: string) : Promise<XRefs> {
      return request(kXRefXRefForId, [file,id]);
    },
    quartoIndexForFile(file: string) : Promise<XRefs> {
      return request(kXRefQuartoIndexForFile, [file]);
    },
    quartoXrefForId(file: string, id: string) : Promise<XRefs> {
      return request(kXRefQuartoXRefForId, [file, id]);
    }
  }
}


