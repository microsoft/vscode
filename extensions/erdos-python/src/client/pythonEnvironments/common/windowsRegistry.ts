/* eslint-disable @typescript-eslint/no-explicit-any */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { HKCU, HKLM, Options, REG_SZ, Registry, RegistryItem } from 'winreg';
import * as path from 'path';
import { createDeferred } from '../../common/utils/async';
import { executeWorkerFile } from '../../common/process/worker/main';

export { HKCU, HKLM, REG_SZ, Options };

export interface IRegistryKey {
    hive: string;
    arch: string;
    key: string;
    parentKey?: IRegistryKey;
}

export interface IRegistryValue {
    hive: string;
    arch: string;
    key: string;
    name: string;
    type: string;
    value: string;
}

export async function readRegistryValues(options: Options, useWorkerThreads: boolean): Promise<IRegistryValue[]> {
    if (!useWorkerThreads) {
        // eslint-disable-next-line global-require
        const WinReg = require('winreg');
        const regKey = new WinReg(options);
        const deferred = createDeferred<RegistryItem[]>();
        regKey.values((err: Error, res: RegistryItem[]) => {
            if (err) {
                deferred.reject(err);
            }
            deferred.resolve(res);
        });
        return deferred.promise;
    }
    return executeWorkerFile(path.join(__dirname, 'registryValues.worker.js'), options);
}

export async function readRegistryKeys(options: Options, useWorkerThreads: boolean): Promise<IRegistryKey[]> {
    if (!useWorkerThreads) {
        // eslint-disable-next-line global-require
        const WinReg = require('winreg');
        const regKey = new WinReg(options);
        const deferred = createDeferred<Registry[]>();
        regKey.keys((err: Error, res: Registry[]) => {
            if (err) {
                deferred.reject(err);
            }
            deferred.resolve(res);
        });
        return deferred.promise;
    }
    return executeWorkerFile(path.join(__dirname, 'registryKeys.worker.js'), options);
}
