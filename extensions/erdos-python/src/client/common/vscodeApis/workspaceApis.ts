// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { Resource } from '../types';

export function getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
    return vscode.workspace.workspaceFolders;
}

export function getWorkspaceFolder(uri: Resource): vscode.WorkspaceFolder | undefined {
    return uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
}

export function getWorkspaceFolderPaths(): string[] {
    return vscode.workspace.workspaceFolders?.map((w) => w.uri.fsPath) ?? [];
}

export function getConfiguration(
    section?: string,
    scope?: vscode.ConfigurationScope | null,
): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(section, scope);
}

export function applyEdit(edit: vscode.WorkspaceEdit): Thenable<boolean> {
    return vscode.workspace.applyEdit(edit);
}

export function findFiles(
    include: vscode.GlobPattern,
    exclude?: vscode.GlobPattern | null,
    maxResults?: number,
    token?: vscode.CancellationToken,
): Thenable<vscode.Uri[]> {
    return vscode.workspace.findFiles(include, exclude, maxResults, token);
}

export function onDidCloseTextDocument(handler: (e: vscode.TextDocument) => void): vscode.Disposable {
    return vscode.workspace.onDidCloseTextDocument(handler);
}

export function onDidSaveTextDocument(handler: (e: vscode.TextDocument) => void): vscode.Disposable {
    return vscode.workspace.onDidSaveTextDocument(handler);
}

export function getOpenTextDocuments(): readonly vscode.TextDocument[] {
    return vscode.workspace.textDocuments;
}

export function onDidOpenTextDocument(handler: (doc: vscode.TextDocument) => void): vscode.Disposable {
    return vscode.workspace.onDidOpenTextDocument(handler);
}

export function onDidChangeTextDocument(handler: (e: vscode.TextDocumentChangeEvent) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeTextDocument(handler);
}

export function onDidChangeConfiguration(handler: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(handler);
}

export function onDidCloseNotebookDocument(handler: (e: vscode.NotebookDocument) => void): vscode.Disposable {
    return vscode.workspace.onDidCloseNotebookDocument(handler);
}

export function createFileSystemWatcher(
    globPattern: vscode.GlobPattern,
    ignoreCreateEvents?: boolean,
    ignoreChangeEvents?: boolean,
    ignoreDeleteEvents?: boolean,
): vscode.FileSystemWatcher {
    return vscode.workspace.createFileSystemWatcher(
        globPattern,
        ignoreCreateEvents,
        ignoreChangeEvents,
        ignoreDeleteEvents,
    );
}

export function onDidChangeWorkspaceFolders(
    handler: (e: vscode.WorkspaceFoldersChangeEvent) => void,
): vscode.Disposable {
    return vscode.workspace.onDidChangeWorkspaceFolders(handler);
}

export function isVirtualWorkspace(): boolean {
    const isVirtualWorkspace =
        vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.every((f) => f.uri.scheme !== 'file');
    return !!isVirtualWorkspace;
}

export function isTrusted(): boolean {
    return vscode.workspace.isTrusted;
}

export function onDidGrantWorkspaceTrust(handler: () => void): vscode.Disposable {
    return vscode.workspace.onDidGrantWorkspaceTrust(handler);
}

export function createDirectory(uri: vscode.Uri): Thenable<void> {
    return vscode.workspace.fs.createDirectory(uri);
}

export function openNotebookDocument(uri: vscode.Uri): Thenable<vscode.NotebookDocument>;
export function openNotebookDocument(
    notebookType: string,
    content?: vscode.NotebookData,
): Thenable<vscode.NotebookDocument>;
export function openNotebookDocument(notebook: any, content?: vscode.NotebookData): Thenable<vscode.NotebookDocument> {
    return vscode.workspace.openNotebookDocument(notebook, content);
}

export function copy(source: vscode.Uri, dest: vscode.Uri, options?: { overwrite?: boolean }): Thenable<void> {
    return vscode.workspace.fs.copy(source, dest, options);
}
