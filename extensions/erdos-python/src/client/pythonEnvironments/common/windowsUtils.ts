// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { uniqBy } from 'lodash';
import * as path from 'path';
import { isTestExecution } from '../../common/constants';
import { traceError, traceVerbose } from '../../logging';
import {
    HKCU,
    HKLM,
    IRegistryKey,
    IRegistryValue,
    readRegistryKeys,
    readRegistryValues,
    REG_SZ,
} from './windowsRegistry';

/* eslint-disable global-require */

/**
 * Determine if the given filename looks like the simplest Python executable.
 */
export function matchBasicPythonBinFilename(filename: string): boolean {
    return path.basename(filename).toLowerCase() === 'python.exe';
}

/**
 * Checks if a given path ends with python*.exe
 * @param {string} interpreterPath : Path to python interpreter.
 * @returns {boolean} : Returns true if the path matches pattern for windows python executable.
 */
export function matchPythonBinFilename(filename: string): boolean {
    /**
     * This Reg-ex matches following file names:
     * python.exe
     * python3.exe
     * python38.exe
     * python3.8.exe
     */
    const windowsPythonExes = /^python(\d+(.\d+)?)?\.exe$/;

    return windowsPythonExes.test(path.basename(filename));
}

export interface IRegistryInterpreterData {
    interpreterPath: string;
    versionStr?: string;
    sysVersionStr?: string;
    bitnessStr?: string;
    companyDisplayName?: string;
    distroOrgName?: string;
}

async function getInterpreterDataFromKey(
    { arch, hive, key }: IRegistryKey,
    distroOrgName: string,
    useWorkerThreads: boolean,
): Promise<IRegistryInterpreterData | undefined> {
    const result: IRegistryInterpreterData = {
        interpreterPath: '',
        distroOrgName,
    };

    const values: IRegistryValue[] = await readRegistryValues({ arch, hive, key }, useWorkerThreads);
    for (const value of values) {
        switch (value.name) {
            case 'SysArchitecture':
                result.bitnessStr = value.value;
                break;
            case 'SysVersion':
                result.sysVersionStr = value.value;
                break;
            case 'Version':
                result.versionStr = value.value;
                break;
            case 'DisplayName':
                result.companyDisplayName = value.value;
                break;
            default:
                break;
        }
    }

    const subKeys: IRegistryKey[] = await readRegistryKeys({ arch, hive, key }, useWorkerThreads);
    const subKey = subKeys.map((s) => s.key).find((s) => s.endsWith('InstallPath'));
    if (subKey) {
        const subKeyValues: IRegistryValue[] = await readRegistryValues({ arch, hive, key: subKey }, useWorkerThreads);
        const value = subKeyValues.find((v) => v.name === 'ExecutablePath');
        if (value) {
            result.interpreterPath = value.value;
            if (value.type !== REG_SZ) {
                traceVerbose(`Registry interpreter path type [${value.type}]: ${value.value}`);
            }
        }
    }

    if (result.interpreterPath.length > 0) {
        return result;
    }
    return undefined;
}

export async function getInterpreterDataFromRegistry(
    arch: string,
    hive: string,
    key: string,
    useWorkerThreads: boolean,
): Promise<IRegistryInterpreterData[]> {
    const subKeys = await readRegistryKeys({ arch, hive, key }, useWorkerThreads);
    const distroOrgName = key.substr(key.lastIndexOf('\\') + 1);
    const allData = await Promise.all(
        subKeys.map((subKey) => getInterpreterDataFromKey(subKey, distroOrgName, useWorkerThreads)),
    );
    return (allData.filter((data) => data !== undefined) || []) as IRegistryInterpreterData[];
}

let registryInterpretersCache: IRegistryInterpreterData[] | undefined;

/**
 * Returns windows registry interpreters from memory, returns undefined if memory is empty.
 * getRegistryInterpreters() must be called prior to this to populate memory.
 */
export function getRegistryInterpretersSync(): IRegistryInterpreterData[] | undefined {
    return !isTestExecution() ? registryInterpretersCache : undefined;
}

let registryInterpretersPromise: Promise<IRegistryInterpreterData[]> | undefined;

export async function getRegistryInterpreters(): Promise<IRegistryInterpreterData[]> {
    if (!isTestExecution() && registryInterpretersPromise !== undefined) {
        return registryInterpretersPromise;
    }
    registryInterpretersPromise = getRegistryInterpretersImpl();
    return registryInterpretersPromise;
}

async function getRegistryInterpretersImpl(useWorkerThreads = false): Promise<IRegistryInterpreterData[]> {
    let registryData: IRegistryInterpreterData[] = [];

    for (const arch of ['x64', 'x86']) {
        for (const hive of [HKLM, HKCU]) {
            const root = '\\SOFTWARE\\Python';
            let keys: string[] = [];
            try {
                keys = (await readRegistryKeys({ arch, hive, key: root }, useWorkerThreads)).map((k) => k.key);
            } catch (ex) {
                traceError(`Failed to access Registry: ${arch}\\${hive}\\${root}`, ex);
            }

            for (const key of keys) {
                registryData = registryData.concat(
                    await getInterpreterDataFromRegistry(arch, hive, key, useWorkerThreads),
                );
            }
        }
    }
    registryInterpretersCache = uniqBy(registryData, (r: IRegistryInterpreterData) => r.interpreterPath);
    return registryInterpretersCache;
}
