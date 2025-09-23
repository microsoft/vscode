/*
 * workspace.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

// based on:
// https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/server/src/workspace.ts


import fs from "node:fs"
import fspromises from "node:fs/promises";
import path from "node:path"

import { glob } from "glob";

import { URI } from "vscode-uri";
import { Connection, Emitter, TextDocuments, DidChangeWatchedFilesNotification, WatchKind, ClientCapabilities, FileChangeType } from "vscode-languageserver";
import { Position, Range, TextDocument } from "vscode-languageserver-textdocument";

import { Document, isQuartoDoc } from "quarto-core";

import {
  FileStat,
  ILogger,
  LsConfiguration,
  IWorkspace,
  IWorkspaceWithWatching,
  FileWatcherOptions
} from "./service";

import { ResourceMap } from "./service/util/resource-maps";
import { Limiter } from "core";


export function languageServiceWorkspace(
  workspaceFolders: URI[],
  documents: TextDocuments<Document>,
  connection: Connection,
  capabilities: ClientCapabilities,
  config: LsConfiguration,
  logger: ILogger
): IWorkspace | IWorkspaceWithWatching {

  // track changes to workspace folders
  connection.workspace.onDidChangeWorkspaceFolders(async () => {
    workspaceFolders = (await connection.workspace.getWorkspaceFolders() ?? []).map(x => URI.parse(x.uri));
  });

  // in-memory document cache
  const documentCache = new ResourceMap<VsCodeDocument>();

  const openMarkdownDocumentFromFs = async (resource: URI): Promise<Document | undefined> => {
    if (!looksLikeMarkdownPath(config, resource)) {
      return undefined;
    }

    try {
      const text = await fspromises.readFile(resource.fsPath, { encoding: "utf-8" });
      const doc = new VsCodeDocument(resource.toString(), {
        onDiskDoc: TextDocument.create(resource.toString(), 'markdown', 0, text)
      });
      documentCache.set(resource, doc);
      return doc;

    } catch (e) {
      return undefined;
    }
  }

  const statBypassingCache = (resource: URI): FileStat | undefined => {
    const uri = resource.toString();
    if (documents.get(uri)) {
      return { isDirectory: false };
    }
    try {
      const stat = fs.statSync(resource.fsPath);
      return { isDirectory: stat.isDirectory() };
    } catch {
      return undefined;
    }
  }

  // track changes to documents
  const onDidChangeMarkdownDocument = new Emitter<Document>();
  const onDidCreateMarkdownDocument = new Emitter<Document>();
  const onDidDeleteMarkdownDocument = new Emitter<URI>();

  const doDeleteDocument = (uri: URI) => {
    logger.logTrace('VsCodeClientWorkspace.deleteDocument', { document: uri.toString() });
    documentCache.delete(uri);
    onDidDeleteMarkdownDocument.fire(uri);
  }

  documents.onDidOpen(e => {
    if (!isRelevantMarkdownDocument(e.document)) {
      return;
    }
    logger.logNotification('onDidOpen', { document: e.document.uri });

    const uri = URI.parse(e.document.uri);
    const doc = documentCache.get(uri);

    if (doc) {
      // File already existed on disk
      doc.setInMemoryDoc(e.document);

      // The content visible to the language service may have changed since the in-memory doc
      // may differ from the one on-disk. To be safe we always fire a change event.
      onDidChangeMarkdownDocument.fire(doc);
    } else {
      // We're creating the file for the first time
      const doc = new VsCodeDocument(e.document.uri, { inMemoryDoc: e.document });
      documentCache.set(uri, doc);
      onDidCreateMarkdownDocument.fire(doc);
    }
  });

  documents.onDidChangeContent(e => {
    if (!isRelevantMarkdownDocument(e.document)) {
      return;
    }

    logger.logNotification('onDidChangeContent', { document: e.document.uri });

    const uri = URI.parse(e.document.uri);
    const entry = documentCache.get(uri);
    if (entry) {
      entry.setInMemoryDoc(e.document);
      onDidChangeMarkdownDocument.fire(entry);
    }
  });

  documents.onDidClose(async e => {
    if (!isRelevantMarkdownDocument(e.document)) {
      return;
    }

    logger.logNotification('onDidClose', { document: e.document.uri });

    const uri = URI.parse(e.document.uri);
    const doc = documentCache.get(uri);
    if (!doc) {
      // Document was never opened
      return;
    }

    doc.setInMemoryDoc(undefined);
    if (doc.isDetached()) {
      // The document has been fully closed
      doDeleteDocument(uri);
      return;
    }

    // Check that if file has been deleted on disk.
    // This can happen when directories are renamed / moved. VS Code's file system watcher does not
    // notify us when this happens.
    if (!statBypassingCache(uri)) {
      if (documentCache.get(uri) === doc && !doc.hasInMemoryDoc()) {
        doDeleteDocument(uri);
        return;
      }
    }

    // The document still exists on disk
    // To be safe, tell the service that the document has changed because the
    // in-memory doc contents may be different than the disk doc contents.
    onDidChangeMarkdownDocument.fire(doc);
  });

  const workspace: IWorkspace = {

    get workspaceFolders(): readonly URI[] {
      return workspaceFolders;
    },

    onDidChangeMarkdownDocument: onDidChangeMarkdownDocument.event,
    onDidCreateMarkdownDocument: onDidCreateMarkdownDocument.event,
    onDidDeleteMarkdownDocument: onDidDeleteMarkdownDocument.event,

    async getAllMarkdownDocuments(): Promise<Iterable<Document>> {
      // Add opened files (such as untitled files)
      const openTextDocumentResults = documents.all()
        .filter(doc => isRelevantMarkdownDocument(doc));

      const allDocs = new ResourceMap<Document>();
      for (const doc of openTextDocumentResults) {
        allDocs.set(URI.parse(doc.uri), doc);
      }

      // And then add files on disk
      for (const workspaceFolder of this.workspaceFolders) {
        const mdFileGlob = `**/*.{${config.markdownFileExtensions.join(',')}}`;
        const ignore = [...config.excludePaths];
        const resources = (await glob(mdFileGlob, { ignore, cwd: workspaceFolder.toString() }))
          .map(resource => URI.file(path.join(workspaceFolder.fsPath, resource)))


        // (read max 20 at a time)
        const maxConcurrent = 20;
        const limiter = new Limiter<Document | undefined>(maxConcurrent);
        await Promise.all(resources.map(resource => {
          return limiter.queue(async () => {
            if (allDocs.has(resource)) {
              return;
            }
            const doc = await this.openMarkdownDocument(resource);
            if (doc) {
              allDocs.set(resource, doc);
            }
            return doc;
          });
        }))
      }

      return allDocs.values();
    },

    hasMarkdownDocument(resource: URI): boolean {
      return !!documents.get(resource.toString());
    },

    async openMarkdownDocument(resource: URI): Promise<Document | undefined> {
      const existing = documentCache.get(resource);
      if (existing) {
        return existing;
      }

      const matchingDocument = documents.get(resource.toString());
      if (matchingDocument) {
        let entry = documentCache.get(resource);
        if (entry) {
          entry.setInMemoryDoc(matchingDocument);
        } else {
          entry = new VsCodeDocument(resource.toString(), { inMemoryDoc: matchingDocument });
          documentCache.set(resource, entry);
        }

        return entry;
      }

      return openMarkdownDocumentFromFs(resource);
    },

    async stat(resource: URI): Promise<FileStat | undefined> {
      logger.logTrace('VsCodeClientWorkspace.stat', { resource: resource.toString() });
      if (documentCache.has(resource)) {
        return { isDirectory: false };
      }
      return statBypassingCache(resource);
    },

    async readDirectory(resource: URI): Promise<Iterable<readonly [string, FileStat]>> {
      logger.logTrace('VsCodeClientWorkspace.readDirectory', { resource: resource.toString() });
      const result = await fspromises.readdir(resource.fsPath, { withFileTypes: true });
      return result.map(value => [value.name, { isDirectory: value.isDirectory() }]);
    },


  };

  // add file watching if supported on the client
  if (capabilities.workspace?.didChangeWatchedFiles) {

    // register for changes
    connection.client.register(
      DidChangeWatchedFilesNotification.type,
      {
        watchers: [
          {
            globPattern: `**/*.{${config.markdownFileExtensions.join(',')}}`,
            kind: WatchKind.Create | WatchKind.Change | WatchKind.Delete
          }
        ]
      }
    );

    // setup watchers
    const watchers = new Map<string, {
      readonly resource: URI;
      readonly options: FileWatcherOptions;
      readonly onDidChange: Emitter<URI>;
      readonly onDidCreate: Emitter<URI>;
      readonly onDidDelete: Emitter<URI>;
    }>();

    connection.onDidChangeWatchedFiles(async ({ changes }) => {

      // fulfill watchers
      for (const change of changes) {
        const watcher = watchers.get(change.uri);
        if (!watcher) {
          return;
        }
        switch (change.type) {
          case FileChangeType.Created: watcher.onDidCreate.fire(URI.parse(change.uri)); return;
          case FileChangeType.Changed: watcher.onDidChange.fire(URI.parse(change.uri)); return;
          case FileChangeType.Deleted: watcher.onDidDelete.fire(URI.parse(change.uri)); return;
        }
      }

      // keep document cache up to date and notify clients
      for (const change of changes) {
        const resource = URI.parse(change.uri);
        logger.logTrace('VsCodeClientWorkspace.onDidChangeWatchedFiles', { type: change.type, resource: resource.toString() });
        switch (change.type) {
          case FileChangeType.Changed: {
            const entry = documentCache.get(resource);
            if (entry) {
              // Refresh the on-disk state
              const document = await openMarkdownDocumentFromFs(resource);
              if (document) {
                onDidChangeMarkdownDocument.fire(document);
              }
            }
            break;
          }
          case FileChangeType.Created: {
            console.log("FileChangeType.Created");
            const entry = documentCache.get(resource);
            if (entry) {
              // Create or update the on-disk state
              const document = await openMarkdownDocumentFromFs(resource);
              if (document) {
                onDidCreateMarkdownDocument.fire(document);
              }
            }
            break;
          }
          case FileChangeType.Deleted: {
            const entry = documentCache.get(resource);
            if (entry) {
              entry.setOnDiskDoc(undefined);
              if (entry.isDetached()) {
                doDeleteDocument(resource);
              }
            }
            break;
          }
        }
      }
    });

    // add watching to workspace
    const fsWorkspace: IWorkspaceWithWatching = {
      ...workspace,
      watchFile(resource, options) {
        logger.logTrace('VsCodeClientWorkspace.watchFile', { resource: resource.toString() });

        const entry = {
          resource,
          options,
          onDidCreate: new Emitter<URI>(),
          onDidChange: new Emitter<URI>(),
          onDidDelete: new Emitter<URI>(),
        };
        watchers.set(entry.resource.toString(), entry);
        return {
          onDidCreate: entry.onDidCreate.event,
          onDidChange: entry.onDidChange.event,
          onDidDelete: entry.onDidDelete.event,
          dispose: () => {
            logger.logTrace('VsCodeClientWorkspace.disposeWatcher', { resource: resource.toString() });
            watchers.delete(entry.resource.toString());
          }
        };

      },
    }
    return fsWorkspace;

    // return vanilla workspace w/o watching
  } else {
    return workspace;
  }

}

function isRelevantMarkdownDocument(doc: Document) {
  return isQuartoDoc(doc) && URI.parse(doc.uri).scheme !== 'vscode-bulkeditpreview';
}


function looksLikeMarkdownPath(config: LsConfiguration, resolvedHrefPath: URI) {
  return config.markdownFileExtensions.includes(path.extname(resolvedHrefPath.fsPath).toLowerCase().replace('.', ''));
}

class VsCodeDocument implements Document {

  private inMemoryDoc?: Document;
  private onDiskDoc?: Document;

  readonly uri: string;

  constructor(uri: string, init: { inMemoryDoc: Document });
  constructor(uri: string, init: { onDiskDoc: Document });
  constructor(uri: string, init: { inMemoryDoc?: Document; onDiskDoc?: Document }) {
    this.uri = uri;
    this.inMemoryDoc = init?.inMemoryDoc;
    this.onDiskDoc = init?.onDiskDoc;
  }

  get languageId(): string | undefined {
    return this.inMemoryDoc?.languageId ?? this.onDiskDoc?.languageId;
  }

  get version(): number {
    return this.inMemoryDoc?.version ?? this.onDiskDoc?.version ?? 0;
  }

  get lineCount(): number {
    return this.inMemoryDoc?.lineCount ?? this.onDiskDoc?.lineCount ?? 0;
  }

  getText(range?: Range): string {
    if (this.inMemoryDoc) {
      return this.inMemoryDoc.getText(range);
    }

    if (this.onDiskDoc) {
      return this.onDiskDoc.getText(range);
    }

    throw new Error('Document has been closed');
  }

  positionAt(offset: number): Position {
    if (this.inMemoryDoc) {
      return this.inMemoryDoc.positionAt(offset);
    }

    if (this.onDiskDoc) {
      return this.onDiskDoc.positionAt(offset);
    }

    throw new Error('Document has been closed');
  }

  hasInMemoryDoc(): boolean {
    return !!this.inMemoryDoc;
  }

  isDetached(): boolean {
    return !this.onDiskDoc && !this.inMemoryDoc;
  }

  setInMemoryDoc(doc: Document | undefined) {
    this.inMemoryDoc = doc;
  }

  setOnDiskDoc(doc: TextDocument | undefined) {
    this.onDiskDoc = doc;
  }
}
