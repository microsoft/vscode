/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileRename, RequestType } from 'vscode-languageserver';
import type * as lsp from 'vscode-languageserver-types';
import type * as md from 'vscode-markdown-languageservice';

//#region From server
export const parse = new RequestType<{ uri: string; text?: string }, md.Token[], any>('markdown/parse');

export const fs_readFile = new RequestType<{ uri: string }, number[], any>('markdown/fs/readFile');
export const fs_readDirectory = new RequestType<{ uri: string }, [string, { isDirectory: boolean }][], any>('markdown/fs/readDirectory');
export const fs_stat = new RequestType<{ uri: string }, { isDirectory: boolean } | undefined, any>('markdown/fs/stat');

export const fs_watcher_create = new RequestType<{ id: number; uri: string; options: md.FileWatcherOptions; watchParentDirs: boolean }, void, any>('markdown/fs/watcher/create');
export const fs_watcher_delete = new RequestType<{ id: number }, void, any>('markdown/fs/watcher/delete');

export const findMarkdownFilesInWorkspace = new RequestType<{}, string[], any>('markdown/findMarkdownFilesInWorkspace');
//#endregion

//#region To server
export const getReferencesToFileInWorkspace = new RequestType<{ uri: string }, lsp.Location[], any>('markdown/getReferencesToFileInWorkspace');
export const getEditForFileRenames = new RequestType<FileRename[], { participatingRenames: readonly FileRename[]; edit: lsp.WorkspaceEdit }, any>('markdown/getEditForFileRenames');

export const prepareUpdatePastedLinks = new RequestType<{ uri: string; ranges: lsp.Range[] }, string, any>('markdown/prepareUpdatePastedLinks');
export const getUpdatePastedLinksEdit = new RequestType<{ pasteIntoDoc: string; metadata: string; edits: lsp.TextEdit[] }, lsp.TextEdit[] | undefined, any>('markdown/getUpdatePastedLinksEdit');

export const fs_watcher_onChange = new RequestType<{ id: number; uri: string; kind: 'create' | 'change' | 'delete' }, void, any>('markdown/fs/watcher/onChange');

export const resolveLinkTarget = new RequestType<{ linkText: string; uri: string }, md.ResolvedDocumentLinkTarget, any>('markdown/resolveLinkTarget');
//#endregion
