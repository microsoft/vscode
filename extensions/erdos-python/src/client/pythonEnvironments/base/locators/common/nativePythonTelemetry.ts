// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { traceError } from '../../../../logging';
import { sendTelemetryEvent } from '../../../../telemetry';
import { EventName } from '../../../../telemetry/constants';

export type NativePythonTelemetry = MissingCondaEnvironments | MissingPoetryEnvironments | RefreshPerformance;

export type MissingCondaEnvironments = {
    event: 'MissingCondaEnvironments';
    data: {
        missingCondaEnvironments: {
            missing: number;
            envDirsNotFound?: number;
            userProvidedCondaExe?: boolean;
            rootPrefixNotFound?: boolean;
            condaPrefixNotFound?: boolean;
            condaManagerNotFound?: boolean;
            sysRcNotFound?: boolean;
            userRcNotFound?: boolean;
            otherRcNotFound?: boolean;
            missingEnvDirsFromSysRc?: number;
            missingEnvDirsFromUserRc?: number;
            missingEnvDirsFromOtherRc?: number;
            missingFromSysRcEnvDirs?: number;
            missingFromUserRcEnvDirs?: number;
            missingFromOtherRcEnvDirs?: number;
        };
    };
};

export type MissingPoetryEnvironments = {
    event: 'MissingPoetryEnvironments';
    data: {
        missingPoetryEnvironments: {
            missing: number;
            missingInPath: number;
            userProvidedPoetryExe?: boolean;
            poetryExeNotFound?: boolean;
            globalConfigNotFound?: boolean;
            cacheDirNotFound?: boolean;
            cacheDirIsDifferent?: boolean;
            virtualenvsPathNotFound?: boolean;
            virtualenvsPathIsDifferent?: boolean;
            inProjectIsDifferent?: boolean;
        };
    };
};

export type RefreshPerformance = {
    event: 'RefreshPerformance';
    data: {
        refreshPerformance: {
            total: number;
            breakdown: {
                Locators: number;
                Path: number;
                GlobalVirtualEnvs: number;
                Workspaces: number;
            };
            locators: {
                Conda?: number;
                Homebrew?: number;
                LinuxGlobalPython?: number;
                MacCmdLineTools?: number;
                MacPythonOrg?: number;
                MacXCode?: number;
                PipEnv?: number;
                PixiEnv?: number;
                Poetry?: number;
                PyEnv?: number;
                Venv?: number;
                VirtualEnv?: number;
                VirtualEnvWrapper?: number;
                WindowsRegistry?: number;
                WindowsStore?: number;
            };
        };
    };
};

let refreshTelemetrySent = false;

export function sendNativeTelemetry(
    data: NativePythonTelemetry,
    initialRefreshMetrics: {
        timeToSpawn: number;
        timeToConfigure: number;
        timeToRefresh: number;
    },
): void {
    switch (data.event) {
        case 'MissingCondaEnvironments': {
            sendTelemetryEvent(
                EventName.NATIVE_FINDER_MISSING_CONDA_ENVS,
                undefined,
                data.data.missingCondaEnvironments,
            );
            break;
        }
        case 'MissingPoetryEnvironments': {
            sendTelemetryEvent(
                EventName.NATIVE_FINDER_MISSING_POETRY_ENVS,
                undefined,
                data.data.missingPoetryEnvironments,
            );
            break;
        }
        case 'RefreshPerformance': {
            if (refreshTelemetrySent) {
                break;
            }
            refreshTelemetrySent = true;
            sendTelemetryEvent(EventName.NATIVE_FINDER_PERF, {
                duration: data.data.refreshPerformance.total,
                totalDuration: data.data.refreshPerformance.total,
                breakdownGlobalVirtualEnvs: data.data.refreshPerformance.breakdown.GlobalVirtualEnvs,
                breakdownLocators: data.data.refreshPerformance.breakdown.Locators,
                breakdownPath: data.data.refreshPerformance.breakdown.Path,
                breakdownWorkspaces: data.data.refreshPerformance.breakdown.Workspaces,
                locatorConda: data.data.refreshPerformance.locators.Conda || 0,
                locatorHomebrew: data.data.refreshPerformance.locators.Homebrew || 0,
                locatorLinuxGlobalPython: data.data.refreshPerformance.locators.LinuxGlobalPython || 0,
                locatorMacCmdLineTools: data.data.refreshPerformance.locators.MacCmdLineTools || 0,
                locatorMacPythonOrg: data.data.refreshPerformance.locators.MacPythonOrg || 0,
                locatorMacXCode: data.data.refreshPerformance.locators.MacXCode || 0,
                locatorPipEnv: data.data.refreshPerformance.locators.PipEnv || 0,
                locatorPixiEnv: data.data.refreshPerformance.locators.PixiEnv || 0,
                locatorPoetry: data.data.refreshPerformance.locators.Poetry || 0,
                locatorPyEnv: data.data.refreshPerformance.locators.PyEnv || 0,
                locatorVenv: data.data.refreshPerformance.locators.Venv || 0,
                locatorVirtualEnv: data.data.refreshPerformance.locators.VirtualEnv || 0,
                locatorVirtualEnvWrapper: data.data.refreshPerformance.locators.VirtualEnvWrapper || 0,
                locatorWindowsRegistry: data.data.refreshPerformance.locators.WindowsRegistry || 0,
                locatorWindowsStore: data.data.refreshPerformance.locators.WindowsStore || 0,
                timeToSpawn: initialRefreshMetrics.timeToSpawn,
                timeToConfigure: initialRefreshMetrics.timeToConfigure,
                timeToRefresh: initialRefreshMetrics.timeToRefresh,
            });
            break;
        }
        default: {
            traceError(`Unhandled Telemetry Event type ${JSON.stringify(data)}`);
        }
    }
}
