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

import { Event } from 'vscode-languageserver';
import { URI, Utils } from 'vscode-uri';
import { defaultMarkdownFileExtension, LsConfiguration } from './config';
import { Document } from 'quarto-core';
import { ResourceMap } from './util/resource-maps';

/**
 * Result of {@link IWorkspace.stat stating} a file.
 */
export interface FileStat {
  /**
   * True if the file is directory.
   */
  readonly isDirectory: boolean;
}

/**
 * Information about a parent markdown document that contains sub-documents.
 *
 * This could be a notebook document for example, where the `children` are the Markdown cells in the notebook.
 */
export interface ContainingDocumentContext {
  /**
   * Uri of the parent document.
   */
  readonly uri: URI;

  /**
   * List of child markdown documents.
   */
  readonly children: Iterable<{ readonly uri: URI }>;
}

/**
 * Provide information about the contents of a workspace.
 */
export interface IWorkspace {

  /**
   * Get the root folders for this workspace.
   */
  get workspaceFolders(): readonly URI[];

  /**
   * Fired when the content of a markdown document changes.
   */
  readonly onDidChangeMarkdownDocument: Event<Document>;

  /**
   * Fired when a markdown document is first created.
   */
  readonly onDidCreateMarkdownDocument: Event<Document>;

  /**
   * Fired when a markdown document is deleted.
   */
  readonly onDidDeleteMarkdownDocument: Event<URI>;

  /**
   * Get complete list of markdown documents.
   *
   * This may include documents that have not been opened yet (for example, getAllMarkdownDocuments should
   * return documents from disk even if they have not been opened yet in the editor)
   */
  getAllMarkdownDocuments(): Promise<Iterable<Document>>;

  /**
   * Check if a document already exists in the workspace contents.
   */
  hasMarkdownDocument(resource: URI): boolean;

  /**
   * Try to open a markdown document.
   *
   * This may either get the document from a cache or open it and add it to the cache.
   *
   * @returns The document, or `undefined` if the file could not be opened or was not a markdown file.
   */
  openMarkdownDocument(resource: URI): Promise<Document | undefined>;

  /**
   * Get metadata about a file.
   *
   * @param resource URI to check. Does not have to be to a markdown file.
   *
   * @returns Metadata or `undefined` if the resource does not exist.
   */
  stat(resource: URI): Promise<FileStat | undefined>;

  /**
   * List all files in a directory.
   *
   * @param resource URI of the directory to check. Does not have to be to a markdown file.
   *
   * @returns List of `[fileName, metadata]` tuples.
   */
  readDirectory(resource: URI): Promise<Iterable<readonly [string, FileStat]>>;

  /**
   * Get the document that contains `resource` as a sub document.
   *
   * If `resource` is a notebook cell for example, this should return the parent notebook.
   *
   * @returns The parent document info or `undefined` if none.
   */
  getContainingDocument?(resource: URI): ContainingDocumentContext | undefined;
}

/**
 * Configures which events a {@link IFileSystemWatcher} fires.
 */
export interface FileWatcherOptions {
  /** Ignore file creation events. */
  readonly ignoreCreate?: boolean;

  /** Ignore file change events. */
  readonly ignoreChange?: boolean;

  /** Ignore file delete events. */
  readonly ignoreDelete?: boolean;
}

/**
 * A workspace that also supports watching arbitrary files.
 */
export interface IWorkspaceWithWatching extends IWorkspace {
  /**
   * Start watching a given file.
   */
  watchFile(path: URI, options: FileWatcherOptions): IFileSystemWatcher;
}

export function isWorkspaceWithFileWatching(workspace: IWorkspace): workspace is IWorkspaceWithWatching {
  return 'watchFile' in workspace;
}

/**
 * Watches a file for changes to it on the file system.
 */
export interface IFileSystemWatcher {

  /**
   * Dispose of the watcher. This should stop watching and clean up any associated resources.
   */
  dispose(): void;

  /** Fired when the file is created. */
  readonly onDidCreate: Event<URI>;

  /** Fired when the file is changed on the file system. */
  readonly onDidChange: Event<URI>;

  /** Fired when the file is deleted. */
  readonly onDidDelete: Event<URI>;
}

export function getWorkspaceFolder(workspace: IWorkspace, docUri: URI): URI | undefined {
  if (workspace.workspaceFolders.length === 0) {
    return undefined;
  }

  // Find the longest match
  const possibleWorkspaces = workspace.workspaceFolders
    .filter(folder =>
      folder.scheme === docUri.scheme
      && folder.authority === docUri.authority
      && (docUri.fsPath.startsWith(folder.fsPath + '/') || docUri.fsPath.startsWith(folder.fsPath + '\\')))
    .sort((a, b) => b.fsPath.length - a.fsPath.length);

  if (possibleWorkspaces.length) {
    return possibleWorkspaces[0];
  }

  // Default to first workspace
  // TODO: Does this make sense?
  return workspace.workspaceFolders[0];
}

export async function openLinkToMarkdownFile(config: LsConfiguration, workspace: IWorkspace, resource: URI): Promise<Document | undefined> {
  try {
    const doc = await workspace.openMarkdownDocument(resource);
    if (doc) {
      return doc;
    }
  } catch {
    // Noop
  }

  const dotMdResource = tryAppendMarkdownFileExtension(config, resource);
  if (dotMdResource) {
    return workspace.openMarkdownDocument(dotMdResource);
  }

  return undefined;
}

/**
 * Check that a link to a file exists.
 *
 * @returns The resolved URI or `undefined` if the file does not exist.
 */
export async function statLinkToMarkdownFile(config: LsConfiguration, workspace: IWorkspace, linkUri: URI, out_statCache?: ResourceMap<{ readonly exists: boolean }>): Promise<URI | undefined> {
  const exists = async (uri: URI): Promise<boolean> => {
    const result = await workspace.stat(uri);
    out_statCache?.set(uri, { exists: !!result });
    return !!result;
  };

  if (await exists(linkUri)) {
    return linkUri;
  }

  // We don't think the file exists. See if we need to append `.md`
  const dotMdResource = tryAppendMarkdownFileExtension(config, linkUri);
  if (dotMdResource && await exists(dotMdResource)) {
    return dotMdResource;
  }

  return undefined;
}

export function tryAppendMarkdownFileExtension(config: LsConfiguration, linkUri: URI): URI | undefined {
  const ext = Utils.extname(linkUri).toLowerCase().replace(/^\./, '');
  if (config.markdownFileExtensions.includes(ext)) {
    return linkUri;
  }

  if (ext === '' || !config.knownLinkedToFileExtensions.includes(ext)) {
    return linkUri.with({ path: linkUri.path + '.' + (config.markdownFileExtensions[0] ?? defaultMarkdownFileExtension) });
  }

  return undefined;
}
