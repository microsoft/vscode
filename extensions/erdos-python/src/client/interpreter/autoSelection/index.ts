// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Event, EventEmitter, Uri } from 'vscode';
import { IWorkspaceService } from '../../common/application/types';
import { DiscoveryUsingWorkers } from '../../common/experiments/groups';
import '../../common/extensions';
import { IFileSystem } from '../../common/platform/types';
import { IExperimentService, IPersistentState, IPersistentStateFactory, Resource } from '../../common/types';
import { createDeferred, Deferred } from '../../common/utils/async';
import { compareSemVerLikeVersions } from '../../pythonEnvironments/base/info/pythonVersion';
import { ProgressReportStage } from '../../pythonEnvironments/base/locator';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IInterpreterComparer } from '../configuration/types';
import { IInterpreterHelper, IInterpreterService } from '../contracts';
import { IInterpreterAutoSelectionService, IInterpreterAutoSelectionProxyService } from './types';

const preferredGlobalInterpreter = 'preferredGlobalPyInterpreter';
const workspacePathNameForGlobalWorkspaces = '';

@injectable()
export class InterpreterAutoSelectionService implements IInterpreterAutoSelectionService {
    protected readonly autoSelectedWorkspacePromises = new Map<string, Deferred<void>>();

    private readonly didAutoSelectedInterpreterEmitter = new EventEmitter<void>();

    private readonly autoSelectedInterpreterByWorkspace = new Map<string, PythonEnvironment | undefined>();

    private globallyPreferredInterpreter: IPersistentState<
        PythonEnvironment | undefined
    > = this.stateFactory.createGlobalPersistentState<PythonEnvironment | undefined>(
        preferredGlobalInterpreter,
        undefined,
    );

    constructor(
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IPersistentStateFactory) private readonly stateFactory: IPersistentStateFactory,
        @inject(IFileSystem) private readonly fs: IFileSystem,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IInterpreterComparer) private readonly envTypeComparer: IInterpreterComparer,
        @inject(IInterpreterAutoSelectionProxyService) proxy: IInterpreterAutoSelectionProxyService,
        @inject(IInterpreterHelper) private readonly interpreterHelper: IInterpreterHelper,
        @inject(IExperimentService) private readonly experimentService: IExperimentService,
    ) {
        proxy.registerInstance!(this);
    }

    /**
     * Auto-select a Python environment from the list returned by environment discovery.
     * If there's a cached auto-selected environment -> return it.
     */
    public async autoSelectInterpreter(resource: Resource): Promise<void> {
        const key = this.getWorkspacePathKey(resource);
        const useCachedInterpreter = this.autoSelectedWorkspacePromises.has(key);

        if (!useCachedInterpreter) {
            const deferred = createDeferred<void>();
            this.autoSelectedWorkspacePromises.set(key, deferred);

            await this.initializeStore(resource);
            await this.clearWorkspaceStoreIfInvalid(resource);
            await this.autoselectInterpreterWithLocators(resource);

            deferred.resolve();
        }

        sendTelemetryEvent(EventName.PYTHON_INTERPRETER_AUTO_SELECTION, undefined, {
            useCachedInterpreter,
        });

        return this.autoSelectedWorkspacePromises.get(key)!.promise;
    }

    public get onDidChangeAutoSelectedInterpreter(): Event<void> {
        return this.didAutoSelectedInterpreterEmitter.event;
    }

    public getAutoSelectedInterpreter(resource: Resource): PythonEnvironment | undefined {
        // Do not execute anycode other than fetching fromm a property.
        // This method gets invoked from settings class, and this class in turn uses classes that relies on settings.
        // I.e. we can end up in a recursive loop.
        const workspaceState = this.getWorkspaceState(resource);
        if (workspaceState && workspaceState.value) {
            return workspaceState.value;
        }

        const workspaceFolderPath = this.getWorkspacePathKey(resource);
        if (this.autoSelectedInterpreterByWorkspace.has(workspaceFolderPath)) {
            return this.autoSelectedInterpreterByWorkspace.get(workspaceFolderPath);
        }

        return this.globallyPreferredInterpreter.value;
    }

    public async setWorkspaceInterpreter(resource: Uri, interpreter: PythonEnvironment | undefined): Promise<void> {
        await this.storeAutoSelectedInterpreter(resource, interpreter);
    }

    public async setGlobalInterpreter(interpreter: PythonEnvironment): Promise<void> {
        await this.storeAutoSelectedInterpreter(undefined, interpreter);
    }

    protected async clearWorkspaceStoreIfInvalid(resource: Resource): Promise<void> {
        const stateStore = this.getWorkspaceState(resource);
        if (stateStore && stateStore.value && !(await this.fs.fileExists(stateStore.value.path))) {
            await stateStore.updateValue(undefined);
        }
    }

    protected async storeAutoSelectedInterpreter(
        resource: Resource,
        interpreter: PythonEnvironment | undefined,
    ): Promise<void> {
        const workspaceFolderPath = this.getWorkspacePathKey(resource);
        if (workspaceFolderPath === workspacePathNameForGlobalWorkspaces) {
            // Update store only if this version is better.
            if (
                this.globallyPreferredInterpreter.value &&
                this.globallyPreferredInterpreter.value.version &&
                interpreter &&
                interpreter.version &&
                compareSemVerLikeVersions(this.globallyPreferredInterpreter.value.version, interpreter.version) > 0
            ) {
                return;
            }

            // Don't pass in manager instance, as we don't want any updates to take place.
            await this.globallyPreferredInterpreter.updateValue(interpreter);
            this.autoSelectedInterpreterByWorkspace.set(workspaceFolderPath, interpreter);
        } else {
            const workspaceState = this.getWorkspaceState(resource);
            if (workspaceState && interpreter) {
                await workspaceState.updateValue(interpreter);
            }
            this.autoSelectedInterpreterByWorkspace.set(workspaceFolderPath, interpreter);
        }
    }

    protected async initializeStore(resource: Resource): Promise<void> {
        const workspaceFolderPath = this.getWorkspacePathKey(resource);
        // Since we're initializing for this resource,
        // Ensure any cached information for this workspace have been removed.
        this.autoSelectedInterpreterByWorkspace.delete(workspaceFolderPath);
        if (this.globallyPreferredInterpreter) {
            return;
        }
        await this.clearStoreIfFileIsInvalid();
    }

    private async clearStoreIfFileIsInvalid() {
        this.globallyPreferredInterpreter = this.stateFactory.createGlobalPersistentState<
            PythonEnvironment | undefined
        >(preferredGlobalInterpreter, undefined);
        if (
            this.globallyPreferredInterpreter.value &&
            !(await this.fs.fileExists(this.globallyPreferredInterpreter.value.path))
        ) {
            await this.globallyPreferredInterpreter.updateValue(undefined);
        }
    }

    private getWorkspacePathKey(resource: Resource): string {
        return this.workspaceService.getWorkspaceFolderIdentifier(resource, workspacePathNameForGlobalWorkspaces);
    }

    private getWorkspaceState(resource: Resource): undefined | IPersistentState<PythonEnvironment | undefined> {
        const workspaceUri = this.interpreterHelper.getActiveWorkspaceUri(resource);
        if (workspaceUri) {
            const key = `autoSelectedWorkspacePythonInterpreter-${workspaceUri.folderUri.fsPath}`;
            return this.stateFactory.createWorkspacePersistentState(key, undefined);
        }
        return undefined;
    }

    private getAutoSelectionInterpretersQueryState(resource: Resource): IPersistentState<boolean | undefined> {
        const workspaceUri = this.interpreterHelper.getActiveWorkspaceUri(resource);
        const key = `autoSelectionInterpretersQueried-${workspaceUri?.folderUri.fsPath || 'global'}`;
        return this.stateFactory.createWorkspacePersistentState(key, undefined);
    }

    private getAutoSelectionQueriedOnceState(): IPersistentState<boolean | undefined> {
        const key = `autoSelectionInterpretersQueriedOnce`;
        return this.stateFactory.createGlobalPersistentState(key, undefined);
    }

    /**
     * Auto-selection logic:
     * 1. If there are cached interpreters (not the first session in this workspace)
     *      -> sort using the same logic as in the interpreter quickpick and return the first one;
     * 2. If not, we already fire all the locators, so wait for their response, sort the interpreters and return the first one.
     *
     * `getInterpreters` will check the cache first and return early if there are any cached interpreters,
     * and if not it will wait for locators to return.
     * As such, we can sort interpreters based on what it returns.
     */
    private async autoselectInterpreterWithLocators(resource: Resource): Promise<void> {
        // Do not perform a full interpreter search if we already have cached interpreters for this workspace.
        const queriedState = this.getAutoSelectionInterpretersQueryState(resource);
        const globalQueriedState = this.getAutoSelectionQueriedOnceState();
        if (globalQueriedState.value && queriedState.value !== true && resource) {
            await this.interpreterService.triggerRefresh({
                searchLocations: { roots: [resource], doNotIncludeNonRooted: true },
            });
        }

        await this.envTypeComparer.initialize(resource);
        const inExperiment = this.experimentService.inExperimentSync(DiscoveryUsingWorkers.experiment);
        const workspaceUri = this.interpreterHelper.getActiveWorkspaceUri(resource);
        let recommendedInterpreter: PythonEnvironment | undefined;
        if (inExperiment) {
            if (!globalQueriedState.value) {
                // Global interpreters are loaded the first time an extension loads, after which we don't need to
                // wait on global interpreter promise refresh.
                // Do not wait for validation of all interpreters to finish, we only need to validate the recommended interpreter.
                await this.interpreterService.getRefreshPromise({ stage: ProgressReportStage.allPathsDiscovered });
            }
            let interpreters = this.interpreterService.getInterpreters(resource);

            recommendedInterpreter = this.envTypeComparer.getRecommended(interpreters, workspaceUri?.folderUri);
            const details = recommendedInterpreter
                ? await this.interpreterService.getInterpreterDetails(recommendedInterpreter.path)
                : undefined;
            if (!details || !recommendedInterpreter) {
                await this.interpreterService.refreshPromise; // Interpreter is invalid, wait for all of validation to finish.
                interpreters = this.interpreterService.getInterpreters(resource);
                recommendedInterpreter = this.envTypeComparer.getRecommended(interpreters, workspaceUri?.folderUri);
            }
        } else {
            if (!globalQueriedState.value) {
                // Global interpreters are loaded the first time an extension loads, after which we don't need to
                // wait on global interpreter promise refresh.
                await this.interpreterService.refreshPromise;
            }
            const interpreters = this.interpreterService.getInterpreters(resource);

            recommendedInterpreter = this.envTypeComparer.getRecommended(interpreters, workspaceUri?.folderUri);
        }
        if (!recommendedInterpreter) {
            return;
        }
        if (workspaceUri) {
            this.setWorkspaceInterpreter(workspaceUri.folderUri, recommendedInterpreter);
        } else {
            this.setGlobalInterpreter(recommendedInterpreter);
        }

        queriedState.updateValue(true);
        globalQueriedState.updateValue(true);

        this.didAutoSelectedInterpreterEmitter.fire();
    }
}
