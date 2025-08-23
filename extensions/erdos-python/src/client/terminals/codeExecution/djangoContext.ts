// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable } from 'inversify';
import * as path from 'path';
import { Disposable } from 'vscode';
import { ICommandManager, IDocumentManager, IWorkspaceService } from '../../common/application/types';
import { ContextKey } from '../../common/contextKey';
import { IFileSystem } from '../../common/platform/types';
import { traceError } from '../../logging';

@injectable()
export class DjangoContextInitializer implements Disposable {
    private readonly isDjangoProject: ContextKey;
    private monitoringActiveTextEditor: boolean = false;
    private workspaceContextKeyValues = new Map<string, boolean>();
    private lastCheckedWorkspace: string = '';
    private disposables: Disposable[] = [];

    constructor(
        private documentManager: IDocumentManager,
        private workpaceService: IWorkspaceService,
        private fileSystem: IFileSystem,
        commandManager: ICommandManager,
    ) {
        this.isDjangoProject = new ContextKey('python.isDjangoProject', commandManager);
        this.ensureContextStateIsSet().catch((ex) => traceError('Python Extension: ensureState', ex));
        this.disposables.push(
            this.workpaceService.onDidChangeWorkspaceFolders(() => this.updateContextKeyBasedOnActiveWorkspace()),
        );
    }

    public dispose() {
        this.disposables.forEach((disposable) => disposable.dispose());
    }
    private updateContextKeyBasedOnActiveWorkspace() {
        if (this.monitoringActiveTextEditor) {
            return;
        }
        this.monitoringActiveTextEditor = true;
        this.disposables.push(this.documentManager.onDidChangeActiveTextEditor(() => this.ensureContextStateIsSet()));
    }
    private getActiveWorkspace(): string | undefined {
        if (
            !Array.isArray(this.workpaceService.workspaceFolders) ||
            this.workpaceService.workspaceFolders.length === 0
        ) {
            return;
        }
        if (this.workpaceService.workspaceFolders.length === 1) {
            return this.workpaceService.workspaceFolders[0].uri.fsPath;
        }
        const activeEditor = this.documentManager.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        const workspaceFolder = this.workpaceService.getWorkspaceFolder(activeEditor.document.uri);
        return workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
    }
    private async ensureContextStateIsSet(): Promise<void> {
        const activeWorkspace = this.getActiveWorkspace();
        if (!activeWorkspace) {
            return this.isDjangoProject.set(false);
        }
        if (this.lastCheckedWorkspace === activeWorkspace) {
            return;
        }
        if (this.workspaceContextKeyValues.has(activeWorkspace)) {
            await this.isDjangoProject.set(this.workspaceContextKeyValues.get(activeWorkspace)!);
        } else {
            const exists = await this.fileSystem.fileExists(path.join(activeWorkspace, 'manage.py'));
            await this.isDjangoProject.set(exists);
            this.workspaceContextKeyValues.set(activeWorkspace, exists);
            this.lastCheckedWorkspace = activeWorkspace;
        }
    }
}
