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

import * as fs from "node:fs";

import { EditorServer } from "editor-types";

import { crossrefServer, crossrefServerMethods, CrossrefServerOptions } from "./crossref";
import { dataCiteServer, dataCiteServerMethods } from "./datacite";
import { doiServer, doiServerMethods } from "./doi";
import { pandocServer, pandocServerMethods } from "./pandoc";
import { pubMedServer, pubMedServerMethods, PubMedServerOptions } from "./pubmed";
import { xrefServer, xrefServerMethods } from "./xref";
import { zoteroServer, zoteroServerMethods } from "./zotero";
import { JsonRpcServerMethod } from 'core';
import { QuartoContext } from "quarto-core";
import { EditorServerDocuments, PandocServerOptions } from "../core";


export interface EditorServerOptions {
  quartoContext: QuartoContext;
  pandoc: PandocServerOptions;
  pubmed: PubMedServerOptions;
  crossref: CrossrefServerOptions;
  documents: EditorServerDocuments;
}

export function defaultEditorServerOptions(
  quartoContext: QuartoContext,
  resourcesDir: string, 
  pandocPath?: string,
  payloadLimitMb = 100
) : EditorServerOptions {
  return {
    quartoContext,
    pandoc: {
      resourcesDir,
      pandocPath: pandocPath || "pandoc",
      payloadLimitMb
    },
    pubmed: {
      tool: "Quarto",
      email: "pubmed@rstudio.com"
    },
    crossref: {
      userAgent: "Quarto",
      email: "crossref@rstudio.com"
    },
    documents: fsEditorServerDocuments()
  }
}

export function fsEditorServerDocuments() {
  return {
    getDocument(filePath: string) {
      const lastModified = fs.statSync(filePath).mtime;
      return {
        filePath,
        code: fs.readFileSync(filePath, { encoding: "utf-8" }),
        lastModified
      }
    }
  }
}

export function editorServer(options: EditorServerOptions) : EditorServer {
  return {
    pandoc: pandocServer(options),
    doi: doiServer(),
    crossref: crossrefServer(options.crossref),
    datacite: dataCiteServer(),
    pubmed: pubMedServer(options.pubmed),
    xref: xrefServer(options),
    zotero: zoteroServer(),
    environment: undefined
  };
}

export function editorServerMethods(options: EditorServerOptions): Record<string,JsonRpcServerMethod> {
  return {
    ...pandocServerMethods(options),
    ...doiServerMethods(),
    ...crossrefServerMethods(options.crossref),
    ...dataCiteServerMethods(),
    ...pubMedServerMethods(options.pubmed),
    ...zoteroServerMethods(),
    ...xrefServerMethods(options)
  }
}
