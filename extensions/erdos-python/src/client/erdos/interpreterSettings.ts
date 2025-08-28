/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { traceError, traceInfo, traceVerbose } from '../logging';
import { getConfiguration } from '../common/vscodeApis/workspaceApis';
import { arePathsSame, isParentPath, isDirectorySync } from '../pythonEnvironments/common/externalDependencies';
import {
    INTERPRETERS_EXCLUDE_SETTING_KEY,
    INTERPRETERS_INCLUDE_SETTING_KEY,
    INTERPRETERS_OVERRIDE_SETTING_KEY,
} from '../common/constants';
import { untildify } from '../common/helpers';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { Resource, InspectInterpreterSettingType } from '../common/types';
import {
    comparePythonVersionDescending,
    isVersionSupported,
} from '../interpreter/configuration/environmentTypeComparer';

function getIncludedInterpreters(): string[] {
    const interpretersInclude = getConfiguration('python').get<string[]>(INTERPRETERS_INCLUDE_SETTING_KEY) ?? [];
    if (interpretersInclude.length > 0) {
        return interpretersInclude
            .map((item) => untildify(item))
            .filter((item) => {
                if (path.isAbsolute(item)) {
                    return true;
                }
                traceInfo(`[shouldIncludeInterpreter]: included interpreter path ${item} is not absolute...ignoring`);
                return false;
            });
    }
    traceVerbose(`[shouldIncludeInterpreter]: No interpreters specified via ${INTERPRETERS_INCLUDE_SETTING_KEY}`);
    return [];
}

function getExcludedInterpreters(): string[] {
    const interpretersExclude = getConfiguration('python').get<string[]>(INTERPRETERS_EXCLUDE_SETTING_KEY) ?? [];
    if (interpretersExclude.length > 0) {
        return interpretersExclude
            .map((item) => untildify(item))
            .filter((item) => {
                if (path.isAbsolute(item)) {
                    return true;
                }
                traceInfo(`[shouldIncludeInterpreter]: excluded interpreter path ${item} is not absolute...ignoring`);
                return false;
            });
    }
    traceVerbose(`[shouldIncludeInterpreter]: No interpreters specified via ${INTERPRETERS_EXCLUDE_SETTING_KEY}`);
    return [];
}

function getOverrideInterpreters(): string[] {
    const interpretersOverride = getConfiguration('python').get<string[]>(INTERPRETERS_OVERRIDE_SETTING_KEY) ?? [];
    if (interpretersOverride.length > 0) {
        return interpretersOverride
            .map((item) => untildify(item))
            .filter((item) => {
                if (path.isAbsolute(item)) {
                    return true;
                }
                traceInfo(`[shouldIncludeInterpreter]: override interpreter path ${item} is not absolute...ignoring`);
                return false;
            });
    }
    traceVerbose(`[shouldIncludeInterpreter]: No interpreters specified via ${INTERPRETERS_OVERRIDE_SETTING_KEY}`);
    return [];
}

export function getCustomEnvDirs(): string[] {
    const overrideInterpreters = getOverrideInterpreters();
    if (overrideInterpreters.length > 0) {
        return mapInterpretersToInstallDirs(overrideInterpreters);
    }

    const includedInterpreters = getIncludedInterpreters();
    if (includedInterpreters.length > 0) {
        return mapInterpretersToInstallDirs(includedInterpreters);
    }

    return [];
}

export function shouldIncludeInterpreter(interpreterPath: string): boolean {
    const override = isOverrideInterpreter(interpreterPath);
    if (override !== undefined) {
        if (override) {
            traceInfo(
                `[shouldIncludeInterpreter] Interpreter ${interpreterPath} included via ${INTERPRETERS_OVERRIDE_SETTING_KEY} setting`,
            );
            return true;
        }
        traceInfo(
            `[shouldIncludeInterpreter] Interpreter ${interpreterPath} is excluded since it is not specified in ${INTERPRETERS_OVERRIDE_SETTING_KEY} setting`,
        );
        return false;
    }

    const excluded = isExcludedInterpreter(interpreterPath);
    if (excluded === true) {
        traceInfo(
            `[shouldIncludeInterpreter] Interpreter ${interpreterPath} excluded via ${INTERPRETERS_EXCLUDE_SETTING_KEY} setting`,
        );
        return false;
    }

    const included = isIncludedInterpreter(interpreterPath);
    if (included === true) {
        traceInfo(
            `[shouldIncludeInterpreter] Interpreter ${interpreterPath} included via ${INTERPRETERS_INCLUDE_SETTING_KEY} setting`,
        );
        return true;
    }

    traceVerbose(`[shouldIncludeInterpreter] Interpreter ${interpreterPath} not explicitly included or excluded`);
    return true;
}

export async function isCustomEnvironment(interpreterPath: string): Promise<boolean> {
    const overrideInterpreters = getOverrideInterpreters();
    const includeInterpreters = getIncludedInterpreters();
    const customDirs = mapInterpretersToInstallDirs([...overrideInterpreters, ...includeInterpreters]);
    return customDirs.some((dir) => isParentPath(interpreterPath, dir));
}

function isIncludedInterpreter(interpreterPath: string): boolean | undefined {
    const interpretersInclude = getIncludedInterpreters();
    if (interpretersInclude.length === 0) {
        return undefined;
    }
    return interpretersInclude.some(
        (includePath) => isParentPath(interpreterPath, includePath) || arePathsSame(interpreterPath, includePath),
    );
}

function isExcludedInterpreter(interpreterPath: string): boolean | undefined {
    const interpretersExclude = getExcludedInterpreters();
    if (interpretersExclude.length === 0) {
        return undefined;
    }
    return interpretersExclude.some(
        (excludePath) => isParentPath(interpreterPath, excludePath) || arePathsSame(interpreterPath, excludePath),
    );
}

function isOverrideInterpreter(interpreterPath: string): boolean | undefined {
    const interpretersOverride = getOverrideInterpreters();
    if (interpretersOverride.length === 0) {
        return undefined;
    }
    return interpretersOverride.some(
        (overridePath) => isParentPath(interpreterPath, overridePath) || arePathsSame(interpreterPath, overridePath),
    );
}

interface InterpreterDebugInfo {
    name: string;
    path: string;
    versionInfo: {
        version: string;
        supportedVersion: boolean;
    };
    envInfo: {
        envName: string;
        envType: string;
    };
    enablementInfo: {
        visibleInUI: boolean;
        includedInSettings: boolean | undefined;
        excludedInSettings: boolean | undefined;
    };
}

export function printInterpreterDebugInfo(interpreters: PythonEnvironment[]): void {
    const interpreterSettingInfo = {
        defaultInterpreterPath: getConfiguration('python').get<string>('defaultInterpreterPath'),
        'interpreters.include': getIncludedInterpreters(),
        'interpreters.exclude': getExcludedInterpreters(),
        'interpreters.override': getOverrideInterpreters(),
    };

    const debugInfo = interpreters
        .sort((a, b) => {
            const pathCompare = a.path.localeCompare(b.path);
            if (pathCompare !== 0) {
                return pathCompare;
            }
            return comparePythonVersionDescending(a.version, b.version);
        })
        .map(
            (interpreter): InterpreterDebugInfo => ({
                name: interpreter.detailedDisplayName ?? interpreter.displayName ?? 'Python',
                path: interpreter.path,
                versionInfo: {
                    version: interpreter.version?.raw ?? 'Unknown',
                    supportedVersion: isVersionSupported(interpreter.version),
                },
                envInfo: {
                    envType: interpreter.envType,
                    envName: interpreter.envName ?? '',
                },
                enablementInfo: {
                    visibleInUI: shouldIncludeInterpreter(interpreter.path),
                    includedInSettings: isIncludedInterpreter(interpreter.path),
                    excludedInSettings: isExcludedInterpreter(interpreter.path),
                },
            }),
        );

    traceInfo('=====================================================================');
    traceInfo('=============== [START] PYTHON INTERPRETER DEBUG INFO ===============');
    traceInfo('=====================================================================');
    traceInfo('Python interpreter settings:', interpreterSettingInfo);
    traceInfo('Python interpreters discovered:', debugInfo);
    traceInfo('=====================================================================');
    traceInfo('================ [END] PYTHON INTERPRETER DEBUG INFO ================');
    traceInfo('=====================================================================');
}

function mapInterpretersToInstallDirs(interpreterPaths: string[]): string[] {
    return Array.from(
        new Set(
            interpreterPaths.map((interpreterPath) => {
                if (isDirectorySync(interpreterPath)) {
                    return interpreterPath;
                }

                let parentDir: string | undefined;
                let installDir: string | undefined;
                try {
                    parentDir = path.dirname(interpreterPath);
                    installDir = path.dirname(parentDir);
                } catch (error) {
                    traceError(
                        `[mapInterpretersToInterpreterDirs]: Failed to get install directory for Python interpreter ${interpreterPath}`,
                        error,
                    );
                }

                if (installDir) {
                    traceVerbose(
                        `[mapInterpretersToInterpreterDirs]: Mapped ${interpreterPath} to installation directory ${installDir}`,
                    );
                    return installDir;
                }

                if (parentDir) {
                    traceInfo(
                        `[mapInterpretersToInterpreterDirs]: Expected ${interpreterPath} to be located in a Python installation directory. It may not be discoverable.`,
                    );
                    return parentDir;
                }

                traceInfo(
                    `[mapInterpretersToInterpreterDirs]: Unable to map ${interpreterPath} to an installation directory. It may not be discoverable.`,
                );
                return interpreterPath;
            }),
        ),
    );
}

export function getUserDefaultInterpreter(scope?: Resource): InspectInterpreterSettingType {
    const configuration = getConfiguration('python', scope);
    const defaultInterpreterPath: InspectInterpreterSettingType =
        configuration?.inspect<string>('defaultInterpreterPath') ?? {};

    const processPath = (value: string | undefined): string => {
        if (value === 'python') {
            return '';
        }
        if (value) {
            value = untildify(value);
            if (!path.isAbsolute(value)) {
                traceInfo(`[getUserDefaultInterpreter]: interpreter path ${value} is not absolute...ignoring`);
                return '';
            }
            return value;
        }
        return value ?? '';
    };

    defaultInterpreterPath.globalValue = processPath(defaultInterpreterPath.globalValue);
    defaultInterpreterPath.workspaceValue = processPath(defaultInterpreterPath.workspaceValue);
    defaultInterpreterPath.workspaceFolderValue = processPath(defaultInterpreterPath.workspaceFolderValue);
    return defaultInterpreterPath;
}
