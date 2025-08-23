// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IWorkspaceService } from './common/application/types';
import { isTestExecution } from './common/constants';
import { ITerminalHelper } from './common/terminal/types';
import { IInterpreterPathService, Resource } from './common/types';
import { IStopWatch } from './common/utils/stopWatch';
import { IInterpreterAutoSelectionService } from './interpreter/autoSelection/types';
import { ICondaService, IInterpreterService } from './interpreter/contracts';
import { IServiceContainer } from './ioc/types';
import { traceError } from './logging';
import { EnvironmentType, PythonEnvironment } from './pythonEnvironments/info';
import { sendTelemetryEvent } from './telemetry';
import { EventName } from './telemetry/constants';
import { EditorLoadTelemetry } from './telemetry/types';
import { IStartupDurations } from './types';
import { useEnvExtension } from './envExt/api.internal';

export async function sendStartupTelemetry(
    activatedPromise: Promise<any>,
    durations: IStartupDurations,
    stopWatch: IStopWatch,
    serviceContainer: IServiceContainer,
    isFirstSession: boolean,
) {
    if (isTestExecution()) {
        return;
    }

    try {
        await activatedPromise;
        durations.totalNonBlockingActivateTime = stopWatch.elapsedTime - durations.startActivateTime;
        const props = await getActivationTelemetryProps(serviceContainer, isFirstSession);
        sendTelemetryEvent(EventName.EDITOR_LOAD, durations, props);
    } catch (ex) {
        traceError('sendStartupTelemetry() failed.', ex);
    }
}

export async function sendErrorTelemetry(
    ex: Error,
    durations: IStartupDurations,
    serviceContainer?: IServiceContainer,
) {
    try {
        let props: any = {};
        if (serviceContainer) {
            try {
                props = await getActivationTelemetryProps(serviceContainer);
            } catch (ex) {
                traceError('getActivationTelemetryProps() failed.', ex);
            }
        }
        sendTelemetryEvent(EventName.EDITOR_LOAD, durations, props, ex);
    } catch (exc2) {
        traceError('sendErrorTelemetry() failed.', exc2);
    }
}

function isUsingGlobalInterpreterInWorkspace(currentPythonPath: string, serviceContainer: IServiceContainer): boolean {
    const service = serviceContainer.get<IInterpreterAutoSelectionService>(IInterpreterAutoSelectionService);
    const globalInterpreter = service.getAutoSelectedInterpreter(undefined);
    if (!globalInterpreter) {
        return false;
    }
    return currentPythonPath === globalInterpreter.path;
}

export function hasUserDefinedPythonPath(resource: Resource, serviceContainer: IServiceContainer) {
    const interpreterPathService = serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
    let settings = interpreterPathService.inspect(resource);
    return (settings.workspaceFolderValue && settings.workspaceFolderValue !== 'python') ||
        (settings.workspaceValue && settings.workspaceValue !== 'python') ||
        (settings.globalValue && settings.globalValue !== 'python')
        ? true
        : false;
}

async function getActivationTelemetryProps(
    serviceContainer: IServiceContainer,
    isFirstSession?: boolean,
): Promise<EditorLoadTelemetry> {
    // TODO: Not all of this data is showing up in the database...

    // TODO: If any one of these parts fails we send no info.  We should
    // be able to partially populate as much as possible instead
    // (through granular try-catch statements).
    const appName = vscode.env.appName;
    const workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    const workspaceFolderCount = workspaceService.workspaceFolders?.length || 0;
    const terminalHelper = serviceContainer.get<ITerminalHelper>(ITerminalHelper);
    const terminalShellType = terminalHelper.identifyTerminalShell();
    if (!workspaceService.isTrusted) {
        return { workspaceFolderCount, terminal: terminalShellType, isFirstSession };
    }
    const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
    const mainWorkspaceUri = workspaceService.workspaceFolders?.length
        ? workspaceService.workspaceFolders[0].uri
        : undefined;
    const hasPythonThree = await interpreterService.hasInterpreters(async (item) => item.version?.major === 3);
    // If an unknown type environment can be found from windows registry or path env var,
    // consider them as global type instead of unknown. Such types can only be known after
    // windows registry is queried. So wait for the refresh of windows registry locator to
    // finish. API getActiveInterpreter() does not block on windows registry by default as
    // it is slow.
    await interpreterService.refreshPromise;
    let interpreter: PythonEnvironment | undefined;

    // include main workspace uri if using env extension
    if (useEnvExtension()) {
        interpreter = await interpreterService
            .getActiveInterpreter(mainWorkspaceUri)
            .catch<PythonEnvironment | undefined>(() => undefined);
    } else {
        interpreter = await interpreterService
            .getActiveInterpreter()
            .catch<PythonEnvironment | undefined>(() => undefined);
    }

    const pythonVersion = interpreter && interpreter.version ? interpreter.version.raw : undefined;
    const interpreterType = interpreter ? interpreter.envType : undefined;
    if (interpreterType === EnvironmentType.Unknown) {
        traceError('Active interpreter type is detected as Unknown', JSON.stringify(interpreter));
    }
    let condaVersion = undefined;
    if (interpreterType === EnvironmentType.Conda) {
        const condaLocator = serviceContainer.get<ICondaService>(ICondaService);
        condaVersion = await condaLocator
            .getCondaVersion()
            .then((ver) => (ver ? ver.raw : ''))
            .catch<string>(() => '');
    }
    const usingUserDefinedInterpreter = hasUserDefinedPythonPath(mainWorkspaceUri, serviceContainer);
    const usingGlobalInterpreter = interpreter
        ? isUsingGlobalInterpreterInWorkspace(interpreter.path, serviceContainer)
        : false;

    return {
        condaVersion,
        terminal: terminalShellType,
        pythonVersion,
        interpreterType,
        workspaceFolderCount,
        hasPythonThree,
        usingUserDefinedInterpreter,
        usingGlobalInterpreter,
        appName,
        isFirstSession,
    };
}
