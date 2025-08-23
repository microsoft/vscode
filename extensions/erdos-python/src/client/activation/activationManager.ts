// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, multiInject } from 'inversify';
import { TextDocument } from 'vscode';
import { IApplicationDiagnostics } from '../application/types';
import { IActiveResourceService, IDocumentManager, IWorkspaceService } from '../common/application/types';
import { PYTHON_LANGUAGE } from '../common/constants';
import { IFileSystem } from '../common/platform/types';
import { IDisposable, IInterpreterPathService, Resource } from '../common/types';
import { Deferred } from '../common/utils/async';
import { StopWatch } from '../common/utils/stopWatch';
import { IInterpreterAutoSelectionService } from '../interpreter/autoSelection/types';
import { traceDecoratorError } from '../logging';
import { sendActivationTelemetry } from '../telemetry/envFileTelemetry';
import { IExtensionActivationManager, IExtensionActivationService, IExtensionSingleActivationService } from './types';

@injectable()
export class ExtensionActivationManager implements IExtensionActivationManager {
    public readonly activatedWorkspaces = new Set<string>();

    protected readonly isInterpreterSetForWorkspacePromises = new Map<string, Deferred<void>>();

    private readonly disposables: IDisposable[] = [];

    private docOpenedHandler?: IDisposable;

    constructor(
        @multiInject(IExtensionActivationService) private activationServices: IExtensionActivationService[],
        @multiInject(IExtensionSingleActivationService)
        private singleActivationServices: IExtensionSingleActivationService[],
        @inject(IDocumentManager) private readonly documentManager: IDocumentManager,
        @inject(IInterpreterAutoSelectionService) private readonly autoSelection: IInterpreterAutoSelectionService,
        @inject(IApplicationDiagnostics) private readonly appDiagnostics: IApplicationDiagnostics,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IFileSystem) private readonly fileSystem: IFileSystem,
        @inject(IActiveResourceService) private readonly activeResourceService: IActiveResourceService,
        @inject(IInterpreterPathService) private readonly interpreterPathService: IInterpreterPathService,
    ) {}

    private filterServices() {
        if (!this.workspaceService.isTrusted) {
            this.activationServices = this.activationServices.filter(
                (service) => service.supportedWorkspaceTypes.untrustedWorkspace,
            );
            this.singleActivationServices = this.singleActivationServices.filter(
                (service) => service.supportedWorkspaceTypes.untrustedWorkspace,
            );
        }
        if (this.workspaceService.isVirtualWorkspace) {
            this.activationServices = this.activationServices.filter(
                (service) => service.supportedWorkspaceTypes.virtualWorkspace,
            );
            this.singleActivationServices = this.singleActivationServices.filter(
                (service) => service.supportedWorkspaceTypes.virtualWorkspace,
            );
        }
    }

    public dispose(): void {
        while (this.disposables.length > 0) {
            const disposable = this.disposables.shift()!;
            disposable.dispose();
        }
        if (this.docOpenedHandler) {
            this.docOpenedHandler.dispose();
            this.docOpenedHandler = undefined;
        }
    }

    public async activate(startupStopWatch: StopWatch): Promise<void> {
        this.filterServices();
        await this.initialize();

        // Activate all activation services together.

        await Promise.all([
            ...this.singleActivationServices.map((item) => item.activate()),
            this.activateWorkspace(this.activeResourceService.getActiveResource(), startupStopWatch),
        ]);
    }

    @traceDecoratorError('Failed to activate a workspace')
    public async activateWorkspace(resource: Resource, startupStopWatch?: StopWatch): Promise<void> {
        const folder = this.workspaceService.getWorkspaceFolder(resource);
        resource = folder ? folder.uri : undefined;
        const key = this.getWorkspaceKey(resource);
        if (this.activatedWorkspaces.has(key)) {
            return;
        }
        this.activatedWorkspaces.add(key);

        if (this.workspaceService.isTrusted) {
            // Do not interact with interpreters in a untrusted workspace.
            await this.autoSelection.autoSelectInterpreter(resource);
            await this.interpreterPathService.copyOldInterpreterStorageValuesToNew(resource);
        }
        await sendActivationTelemetry(this.fileSystem, this.workspaceService, resource);
        await Promise.all(this.activationServices.map((item) => item.activate(resource, startupStopWatch)));
        await this.appDiagnostics.performPreStartupHealthCheck(resource);
    }

    public async initialize(): Promise<void> {
        this.addHandlers();
        this.addRemoveDocOpenedHandlers();
    }

    public onDocOpened(doc: TextDocument): void {
        if (doc.languageId !== PYTHON_LANGUAGE) {
            return;
        }
        const key = this.getWorkspaceKey(doc.uri);
        const hasWorkspaceFolders = (this.workspaceService.workspaceFolders?.length || 0) > 0;
        // If we have opened a doc that does not belong to workspace, then do nothing.
        if (key === '' && hasWorkspaceFolders) {
            return;
        }
        if (this.activatedWorkspaces.has(key)) {
            return;
        }
        this.activateWorkspace(doc.uri).ignoreErrors();
    }

    protected addHandlers(): void {
        this.disposables.push(this.workspaceService.onDidChangeWorkspaceFolders(this.onWorkspaceFoldersChanged, this));
    }

    protected addRemoveDocOpenedHandlers(): void {
        if (this.hasMultipleWorkspaces()) {
            if (!this.docOpenedHandler) {
                this.docOpenedHandler = this.documentManager.onDidOpenTextDocument(this.onDocOpened, this);
            }
            return;
        }
        if (this.docOpenedHandler) {
            this.docOpenedHandler.dispose();
            this.docOpenedHandler = undefined;
        }
    }

    protected onWorkspaceFoldersChanged(): void {
        // If an activated workspace folder was removed, delete its key
        const workspaceKeys = this.workspaceService.workspaceFolders!.map((workspaceFolder) =>
            this.getWorkspaceKey(workspaceFolder.uri),
        );
        const activatedWkspcKeys = Array.from(this.activatedWorkspaces.keys());
        const activatedWkspcFoldersRemoved = activatedWkspcKeys.filter((item) => workspaceKeys.indexOf(item) < 0);
        if (activatedWkspcFoldersRemoved.length > 0) {
            for (const folder of activatedWkspcFoldersRemoved) {
                this.activatedWorkspaces.delete(folder);
            }
        }
        this.addRemoveDocOpenedHandlers();
    }

    protected hasMultipleWorkspaces(): boolean {
        return (this.workspaceService.workspaceFolders?.length || 0) > 1;
    }

    protected getWorkspaceKey(resource: Resource): string {
        return this.workspaceService.getWorkspaceFolderIdentifier(resource, '');
    }
}
