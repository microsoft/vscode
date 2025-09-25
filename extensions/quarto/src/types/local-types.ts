/*
 * local-types.ts
 * 
 * Exact type definitions copied from visual editor packages
 * Copyright (C) 2025 Lotas Inc.
 */

import { Range } from "vscode-languageserver-types";

// From packages/editor-types/src/diagram.ts
export interface DiagramState {
  engine: "mermaid" | "graphviz";
  src: string;
}

// From packages/editor-types/src/codeview.ts
export const kCodeViewAssist = 'code_view_assist';

export interface CodeViewCellContext {
  filepath: string;
  language: string;
  code: string[];
  cellBegin: number;
  cellEnd: number;
  selection: Range;
}

// From packages/editor-types/src/zotero.ts
export const kZoteroMyLibrary = "My Library";

export interface ZoteroResult {
  status:
    | 'ok' // ok (results in 'message')
    | 'notfound' // invalid api key
    | 'nohost' // no internet connectivity
    | 'error'; // unexpected error (details in 'error')
  message: any; // ZoteroResultMessage - simplified to any
  warning: string;
  error: string;
  unauthorized?: boolean;
}

export interface ZoteroCollectionSpec {
  name: string;
  version: number;
  key: string;
  parentKey: string;
}

export interface ZoteroLibraryConfig {
  type: "none" | "local" | "web",
  dataDir?: string,
  apiKey?: string,
}

export interface ZoteroServer {
  setLibraryConfig: (config: ZoteroLibraryConfig) => Promise<void>;
  validateWebAPIKey: (key: string) => Promise<boolean>;
  getCollections: (
    file: string | null,
    collections: string[],
    cached: ZoteroCollectionSpec[],
    useCache: boolean,
  ) => Promise<ZoteroResult>;
  getLibraryNames: () => Promise<ZoteroResult>;
  getActiveCollectionSpecs: (file: string | null, collections: string[]) => Promise<ZoteroResult>;
  betterBibtexExport: (itemKeys: string[], translatorId: string, libraryId: number) => Promise<ZoteroResult>;
}

// From packages/editor-core/src/server.ts  
// Zotero RPC constants
export const kZoteroSetLibraryConfig = 'zotero_set_library_config';
export const kZoteroValidateWebApiKey = 'zotero_validate_web_api_key';
export const kZoteroGetCollections = 'zotero_get_collections';
export const kZoteroGetLibraryNames = 'zotero_get_library_names';
export const kZoteroGetActiveCollectionSpecs = 'zotero_get_active_collection_specs';
export const kZoteroBetterBibtexExport = 'zotero_better_bibtex_export';

// JsonRpcRequestTransport type (simplified)
export type JsonRpcRequestTransport = (method: string, params: any[]) => Promise<any>;

export function editorZoteroJsonRpcServer(request: JsonRpcRequestTransport): ZoteroServer {
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

    betterBibtexExport(
      itemKeys: string[],
      translatorId: string,
      libraryId: number
    ): Promise<ZoteroResult> {
      return request(kZoteroBetterBibtexExport, [itemKeys, translatorId, libraryId]);
    }
  }
}

// From packages/editor-core/src/languages.ts
export function languageDiagramEngine(id: string) {
  if (id === "dot") {
    return "graphviz";
  } else if (id === "mermaid") {
    return "mermaid";
  } else {
    return undefined;
  }
}

export interface EditorLanguage {
  ids: string[];
  comment?: string;
  ext?: string;
  trigger?: string[];
}

export function editorLanguage(id: string) {
  const kEditorLanguages = [
    { ids: ["python"], ext: "py", comment: "#", trigger: ["."] },
    { ids: ["r"], ext: "r", comment: "#", trigger: ["$", "@", ":", "."] },
    { ids: ["julia"], ext: "jl", comment: "#", trigger: ["."] },
    { ids: ["matlab"], ext: "m", comment: "%", trigger: ["."] },
    { ids: ["stata"], ext: "do", comment: "*", trigger: ["."] },
    { ids: ["sql"], comment: "--", trigger: ["."] },
    { ids: ["prql"], comment: "#", trigger: ["."] },
    { ids: ["bash"], comment: "#", ext: "sh" },
    { ids: ["sh"], comment: "#", ext: "sh" },
    { ids: ["shell"], comment: "#", ext: "sh" },
    { ids: ["ruby"], ext: "rb", comment: "#", trigger: ["."] },
    { ids: ["rust"], ext: "rs", comment: "//", trigger: ["."] },
    { ids: ["java"], comment: "//", trigger: ["."] },
    { ids: ["cpp"], comment: "//", trigger: [".", ">", ":"] },
    { ids: ["go"], comment: "//", trigger: ["."] },
    { ids: ["html"] },
    { ids: ["css"] },
    { ids: ["ts", "typescript"], comment: "//", ext: "ts", trigger: ["."] },
    { ids: ["js", "javascript", "d3", "ojs"], comment: "//", ext: "js", trigger: ["."] },
    { ids: ["jsx"], comment: "//", trigger: ["."] },
    { ids: ["yaml"], ext: "yml" }
  ];
  
  id = id.split("-").pop() || "";
  return kEditorLanguages.find((lang) => lang.ids.includes(id));
}
