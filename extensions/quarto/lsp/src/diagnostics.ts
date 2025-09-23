/*
 * diagnostics.ts
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

import {
  CancellationToken,
  Connection,
  Diagnostic,
  Disposable,
  DocumentDiagnosticRequest,
  FullDocumentDiagnosticReport,
  TextDocuments,
  UnchangedDocumentDiagnosticReport,
} from "vscode-languageserver";


import { URI } from "vscode-uri";
import { disposeAll } from "core";

import { Document } from "quarto-core";

import {
  DiagnosticOptions,
  ILogger,
  IMdLanguageService,
  IWorkspace,
} from "./service";
import {
  ConfigurationManager,
  getDiagnosticsOptions,
  kDefaultDiagnosticOptions,
} from "./config";
import { isWorkspaceWithFileWatching } from "./service/workspace";


export async function registerDiagnostics(
  connection: Connection,
  workspace: IWorkspace,
  documents: TextDocuments<Document>,
  mdLs: IMdLanguageService,
  configManager: ConfigurationManager,
  logger: ILogger
): Promise<Disposable> {

  const subs: Disposable[] = [];



  // baseline diagnostics sent on save (and cleared on change)
  const saveDiagnosticsSources: Array<(doc: Document) => Promise<Diagnostic[]>> = [];
  saveDiagnosticsSources.push((doc: Document) => {
    return mdLs.computeOnSaveDiagnostics(doc);
  });
  // diagnostics on open and save (clear on doc modified)
  subs.push(
    documents.onDidOpen(async (e) => {
      sendDiagnostics(e.document, await computeDiagnostics(e.document));
    })
  );
  subs.push(
    documents.onDidSave(async (e) => {
      sendDiagnostics(e.document, await computeDiagnostics(e.document));
    })
  );
  subs.push(
    documents.onDidChangeContent(async (e) => {
      sendDiagnostics(e.document, []);
    })
  );
  const computeDiagnostics = async (
    doc: Document
  ): Promise<Diagnostic[]> => {
    return (await Promise.all(saveDiagnosticsSources.map(src => src(doc)))).flat();
  };
  const sendDiagnostics = (doc: Document, diagnostics: Diagnostic[]) => {
    connection.sendDiagnostics({
      uri: doc.uri,
      version: doc.version,
      diagnostics,
    });
  };


  // if we can watch files then register a pull source for markdown
  if (isWorkspaceWithFileWatching(workspace)) {
    let diagnosticOptions: DiagnosticOptions = kDefaultDiagnosticOptions;
    const updateDiagnosticsSetting = (): void => {
      diagnosticOptions = getDiagnosticsOptions(configManager);
    };

    const manager = mdLs.createPullDiagnosticsManager();
    subs.push(manager);

    subs.push(
      manager.onLinkedToFileChanged(() => {
        // TODO: We only need to refresh certain files
        connection.languages.diagnostics.refresh();
      })
    );

    const emptyDiagnosticsResponse = Object.freeze({ kind: "full", items: [] });

    subs.push(await connection.client.register(
      DocumentDiagnosticRequest.type,
      {
        documentSelector: null,
        identifier: "quarto",
        interFileDependencies: true,
        workspaceDiagnostics: false,
      }
    ));

    subs.push(connection.languages.diagnostics.on(
      async (
        params,
        token
      ): Promise<
        FullDocumentDiagnosticReport | UnchangedDocumentDiagnosticReport
      > => {

        logger.logDebug("connection.languages.diagnostics.on", {
          document: params.textDocument.uri,
        });

        const uri = URI.parse(params.textDocument.uri);
        if (!workspace.hasMarkdownDocument(uri)) {
          return emptyDiagnosticsResponse;
        }

        const document = await workspace.openMarkdownDocument(uri);
        if (!document) {
          return emptyDiagnosticsResponse;
        }

        const diagnostics = await manager.computeDiagnostics(
          document,
          diagnosticOptions,
          token
        );
        return {
          kind: "full",
          items: diagnostics,
        };
      }
    ));

    updateDiagnosticsSetting();
    subs.push(
      configManager.onDidChangeConfiguration(() => {
        updateDiagnosticsSetting();
        connection.languages.diagnostics.refresh();
      })
    );

    subs.push(
      documents.onDidClose((e) => {
        manager.disposeDocumentResources(URI.parse(e.document.uri));
      })
    );
  } else {
    // run diagnostics on save (and clear on edit)
    saveDiagnosticsSources.push((doc: Document) => {
      return mdLs?.computeDiagnostics(
        doc,
        getDiagnosticsOptions(configManager),
        CancellationToken.None
      )
    });
  }

  return {
    dispose: () => {
      disposeAll(subs);
    },
  };
}
