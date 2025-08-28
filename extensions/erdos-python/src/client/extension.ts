'use strict';

// This line should always be right on top.

if ((Reflect as any).metadata === undefined) {
    require('reflect-metadata');
}

//===============================================
// We start tracking the extension's startup time at this point.  The
// locations at which we record various Intervals are marked below in
// the same way as this.

const durations = {} as IStartupDurations;
import { StopWatch } from './common/utils/stopWatch';
// Do not move this line of code (used to measure extension load times).
const stopWatch = new StopWatch();

// Initialize file logging here. This should not depend on too many things.
import { initializeFileLogging, traceError } from './logging';
const logDispose: { dispose: () => void }[] = [];
initializeFileLogging(logDispose);

//===============================================
// loading starts here

import { ProgressLocation, ProgressOptions, window } from 'vscode';
import { buildApi } from './api';
import { IApplicationShell, IWorkspaceService } from './common/application/types';
import { IDisposableRegistry, IExperimentService, IExtensionContext } from './common/types';
import { createDeferred } from './common/utils/async';
import { Common } from './common/utils/localize';
import { activateComponents, activateFeatures } from './extensionActivation';
import { initializeStandard, initializeComponents, initializeGlobals } from './extensionInit';
import { IServiceContainer } from './ioc/types';
import { sendErrorTelemetry, sendStartupTelemetry } from './startupTelemetry';
import { IStartupDurations } from './types';
import { runAfterActivation } from './common/utils/runAfterActivation';
import { IInterpreterService } from './interpreter/contracts';
import { PythonExtension } from './api/types';
import { WorkspaceService } from './common/application/workspace';
import { disposeAll } from './common/utils/resourceLifecycle';
import { ProposedExtensionAPI } from './proposedApiTypes';
import { buildProposedApi } from './proposedApi';
import { GLOBAL_PERSISTENT_KEYS } from './common/persistentState';
import { registerTools } from './chat';
import { IRecommendedEnvironmentService } from './interpreter/configuration/types';
import { activateErdos } from './erdos/extension';

durations.codeLoadingTime = stopWatch.elapsedTime;

//===============================================
// loading ends here

// These persist between activations:
let activatedServiceContainer: IServiceContainer | undefined;

/////////////////////////////
// public functions

export async function activate(context: IExtensionContext): Promise<PythonExtension> {
    let api: PythonExtension;
    let ready: Promise<void>;
    let serviceContainer: IServiceContainer;
    let isFirstSession: boolean | undefined;
    try {
        isFirstSession = context.globalState.get(GLOBAL_PERSISTENT_KEYS, []).length === 0;
        const workspaceService = new WorkspaceService();
        context.subscriptions.push(
            workspaceService.onDidGrantWorkspaceTrust(async () => {
                await deactivate();
                await activate(context);
            }),
        );
        [api, ready, serviceContainer] = await activateUnsafe(context, stopWatch, durations);
    } catch (ex) {
        // We want to completely handle the error
        // before notifying VS Code.
        await handleError(ex as Error, durations);
        throw ex; // re-raise
    }
    // Send the "success" telemetry only if activation did not fail.
    // Otherwise Telemetry is send via the error handler.
    sendStartupTelemetry(ready, durations, stopWatch, serviceContainer, isFirstSession)
        // Run in the background.
        .ignoreErrors();

    activateErdos(serviceContainer)
        .catch(error => {
            console.error('activateErdos failed:', error);
            throw error; // Re-throw so we see the failure
        });
    return api;
}

export async function deactivate(): Promise<void> {
    // Make sure to shutdown anybody who needs it.
    if (activatedServiceContainer) {
        const disposables = activatedServiceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        await disposeAll(disposables);
        // Remove everything that is already disposed.
        while (disposables.pop()) { }
    }
}

/////////////////////////////
// activation helpers

async function activateUnsafe(
    context: IExtensionContext,
    startupStopWatch: StopWatch,
    startupDurations: IStartupDurations,
): Promise<[PythonExtension & ProposedExtensionAPI, Promise<void>, IServiceContainer]> {
    // Add anything that we got from initializing logs to dispose.
    context.subscriptions.push(...logDispose);

    const activationDeferred = createDeferred<void>();
    displayProgress(activationDeferred.promise);
    startupDurations.startActivateTime = startupStopWatch.elapsedTime;
    const activationStopWatch = new StopWatch();

    //===============================================
    // activation starts here

    // First we initialize.
    const ext = initializeGlobals(context);
    activatedServiceContainer = ext.legacyIOC.serviceContainer;
    // Note standard utils especially experiment and platform code are fundamental to the extension
    // and should be available before we activate anything else.Hence register them first.
    initializeStandard(ext);
    // We need to activate experiments before initializing components as objects are created or not created based on experiments.
    const experimentService = activatedServiceContainer.get<IExperimentService>(IExperimentService);
    // This guarantees that all experiment information has loaded & all telemetry will contain experiment info.
    await experimentService.activate();
    const components = await initializeComponents(ext);

    // Then we finish activating.
    const componentsActivated = await activateComponents(ext, components, activationStopWatch);
    await activateFeatures(ext, components);

    const nonBlocking = componentsActivated.map((r) => r.fullyReady);
    const activationPromise = (async () => {
        await Promise.all(nonBlocking);
    })();

    //===============================================
    // activation ends here

    startupDurations.totalActivateTime = startupStopWatch.elapsedTime - startupDurations.startActivateTime;
    activationDeferred.resolve();

    setTimeout(async () => {
        if (activatedServiceContainer) {
            const workspaceService = activatedServiceContainer.get<IWorkspaceService>(IWorkspaceService);
            if (workspaceService.isTrusted) {
                const interpreterManager = activatedServiceContainer.get<IInterpreterService>(IInterpreterService);
                const workspaces = workspaceService.workspaceFolders ?? [];
                await interpreterManager
                    .refresh(workspaces.length > 0 ? workspaces[0].uri : undefined)
                    .catch((ex) => traceError('Python Extension: interpreterManager.refresh', ex));
            }
        }

        runAfterActivation();
    });

    const api = buildApi(
        activationPromise,
        ext.legacyIOC.serviceManager,
        ext.legacyIOC.serviceContainer,
        components.pythonEnvs,
    );
    const proposedApi = buildProposedApi(components.pythonEnvs, ext.legacyIOC.serviceContainer);
    registerTools(context, components.pythonEnvs, api.environments, ext.legacyIOC.serviceContainer);
    ext.legacyIOC.serviceContainer
        .get<IRecommendedEnvironmentService>(IRecommendedEnvironmentService)
        .registerEnvApi(api.environments);
    return [{ ...api, ...proposedApi }, activationPromise, ext.legacyIOC.serviceContainer];
}

function displayProgress(promise: Promise<any>) {
    const progressOptions: ProgressOptions = { location: ProgressLocation.Window, title: Common.loadingExtension };
    window.withProgress(progressOptions, () => promise);
}

/////////////////////////////
// error handling

async function handleError(ex: Error, startupDurations: IStartupDurations) {
    notifyUser(
        "Extension activation failed, run the 'Developer: Toggle Developer Tools' command for more information.",
    );
    traceError('extension activation failed', ex);

    await sendErrorTelemetry(ex, startupDurations, activatedServiceContainer);
}

interface IAppShell {
    showErrorMessage(string: string): Promise<void>;
}

function notifyUser(msg: string) {
    try {
        let appShell: IAppShell = (window as any) as IAppShell;
        if (activatedServiceContainer) {
            appShell = (activatedServiceContainer.get<IApplicationShell>(IApplicationShell) as any) as IAppShell;
        }
        appShell.showErrorMessage(msg).ignoreErrors();
    } catch (ex) {
        traceError('Failed to Notify User', ex);
    }
}
