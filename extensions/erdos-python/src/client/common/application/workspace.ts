// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable } from 'inversify';
import * as path from 'path';
import {
    CancellationToken,
    ConfigurationChangeEvent,
    Event,
    FileSystemWatcher,
    GlobPattern,
    TextDocument,
    Uri,
    workspace,
    WorkspaceConfiguration,
    WorkspaceFolder,
    WorkspaceFoldersChangeEvent,
} from 'vscode';
import { Resource } from '../types';
import { getOSType, OSType } from '../utils/platform';
import { IWorkspaceService } from './types';

@injectable()
export class WorkspaceService implements IWorkspaceService {
    public get onDidChangeConfiguration(): Event<ConfigurationChangeEvent> {
        return workspace.onDidChangeConfiguration;
    }
    public get rootPath(): string | undefined {
        return Array.isArray(workspace.workspaceFolders) && workspace.workspaceFolders.length > 0
            ? workspace.workspaceFolders[0].uri.fsPath
            : undefined;
    }
    public get workspaceFolders(): readonly WorkspaceFolder[] | undefined {
        return workspace.workspaceFolders;
    }
    public get onDidChangeWorkspaceFolders(): Event<WorkspaceFoldersChangeEvent> {
        return workspace.onDidChangeWorkspaceFolders;
    }
    public get workspaceFile() {
        return workspace.workspaceFile;
    }
    public getConfiguration(
        section?: string,
        resource?: Uri,
        languageSpecific: boolean = false,
    ): WorkspaceConfiguration {
        if (languageSpecific) {
            return workspace.getConfiguration(section, { uri: resource, languageId: 'python' });
        } else {
            return workspace.getConfiguration(section, resource);
        }
    }
    public getWorkspaceFolder(uri: Resource): WorkspaceFolder | undefined {
        return uri ? workspace.getWorkspaceFolder(uri) : undefined;
    }
    public asRelativePath(pathOrUri: string | Uri, includeWorkspaceFolder?: boolean): string {
        return workspace.asRelativePath(pathOrUri, includeWorkspaceFolder);
    }
    public createFileSystemWatcher(
        globPattern: GlobPattern,
        ignoreCreateEvents?: boolean,
        ignoreChangeEvents?: boolean,
        ignoreDeleteEvents?: boolean,
    ): FileSystemWatcher {
        return workspace.createFileSystemWatcher(
            globPattern,
            ignoreCreateEvents,
            ignoreChangeEvents,
            ignoreDeleteEvents,
        );
    }
    public findFiles(
        include: GlobPattern,
        exclude?: GlobPattern,
        maxResults?: number,
        token?: CancellationToken,
    ): Thenable<Uri[]> {
        const excludePattern = exclude === undefined ? this.searchExcludes : exclude;
        return workspace.findFiles(include, excludePattern, maxResults, token);
    }
    public getWorkspaceFolderIdentifier(resource: Resource, defaultValue: string = ''): string {
        const workspaceFolder = resource ? workspace.getWorkspaceFolder(resource) : undefined;
        return workspaceFolder
            ? path.normalize(
                  getOSType() === OSType.Windows
                      ? workspaceFolder.uri.fsPath.toUpperCase()
                      : workspaceFolder.uri.fsPath,
              )
            : defaultValue;
    }

    public get isVirtualWorkspace(): boolean {
        const isVirtualWorkspace =
            workspace.workspaceFolders && workspace.workspaceFolders.every((f) => f.uri.scheme !== 'file');
        return !!isVirtualWorkspace;
    }

    public get isTrusted(): boolean {
        return workspace.isTrusted;
    }

    public get onDidGrantWorkspaceTrust(): Event<void> {
        return workspace.onDidGrantWorkspaceTrust;
    }

    public openTextDocument(options?: { language?: string; content?: string }): Thenable<TextDocument> {
        return workspace.openTextDocument(options);
    }

    private get searchExcludes() {
        const searchExcludes = this.getConfiguration('search.exclude');
        const enabledSearchExcludes = Object.keys(searchExcludes).filter((key) => searchExcludes.get(key) === true);
        return `{${enabledSearchExcludes.join(',')}}`;
    }

    public async save(uri: Uri): Promise<Uri | undefined> {
        try {
            // This is a proposed API hence putting it inside try...catch.
            const result = await workspace.save(uri);
            return result;
        } catch (ex) {
            return undefined;
        }
    }
}
