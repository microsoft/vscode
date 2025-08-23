// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { PythonEnvKind, PythonEnvSource } from '../../../../../client/pythonEnvironments/base/info';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import * as winreg from '../../../../../client/pythonEnvironments/common/windowsRegistry';
import {
    WindowsRegistryLocator,
    WINDOWS_REG_PROVIDER_ID,
} from '../../../../../client/pythonEnvironments/base/locators/lowLevel/windowsRegistryLocator';
import { createBasicEnv } from '../../common';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';

suite('Windows Registry', () => {
    let stubReadRegistryValues: sinon.SinonStub;
    let stubReadRegistryKeys: sinon.SinonStub;
    let locator: WindowsRegistryLocator;

    const regTestRoot = path.join(TEST_LAYOUT_ROOT, 'winreg');

    const registryData = {
        x64: {
            HKLM: [
                {
                    key: '\\SOFTWARE\\Python',
                    values: { '': '' },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCore', '\\SOFTWARE\\Python\\ContinuumAnalytics'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCore',
                    values: {
                        '': '',
                        DisplayName: 'Python Software Foundation',
                        SupportUrl: 'www.python.org',
                    },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCore\\3.9'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCore\\3.9',
                    values: {
                        '': '',
                        DisplayName: 'Python 3.9 (64-bit)',
                        SupportUrl: 'www.python.org',
                        SysArchitecture: '64bit',
                        SysVersion: '3.9',
                        Version: '3.9.0rc2',
                    },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCore\\3.9\\InstallPath'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCore\\3.9\\InstallPath',
                    values: {
                        '': '',
                        ExecutablePath: path.join(regTestRoot, 'py39', 'python.exe'),
                    },
                    subKeys: [] as string[],
                },
                {
                    key: '\\SOFTWARE\\Python\\ContinuumAnalytics',
                    values: {
                        '': '',
                    },
                    subKeys: ['\\SOFTWARE\\Python\\ContinuumAnalytics\\Anaconda38-64'],
                },
                {
                    key: '\\SOFTWARE\\Python\\ContinuumAnalytics\\Anaconda38-64',
                    values: {
                        '': '',
                        DisplayName: 'Anaconda py38_4.8.3',
                        SupportUrl: 'github.com/continuumio/anaconda-issues',
                        SysArchitecture: '64bit',
                        SysVersion: '3.8',
                        Version: 'py38_4.8.3',
                    },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCore\\Anaconda38-64\\InstallPath'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCore\\Anaconda38-64\\InstallPath',
                    values: {
                        '': '',
                        ExecutablePath: path.join(regTestRoot, 'conda3', 'python.exe'),
                    },
                    subKeys: [] as string[],
                },
            ],
            HKCU: [
                {
                    key: '\\SOFTWARE\\Python',
                    values: { '': '' },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCore'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCore',
                    values: {
                        '': '',
                        DisplayName: 'Python Software Foundation',
                        SupportUrl: 'www.python.org',
                    },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCore\\3.7'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCore\\3.7',
                    values: {
                        '': '',
                        DisplayName: 'Python 3.7 (64-bit)',
                        SupportUrl: 'www.python.org',
                        SysArchitecture: '64bit',
                        SysVersion: '3.7',
                        Version: '3.7.7',
                    },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCore\\3.7\\InstallPath'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCore\\3.7\\InstallPath',
                    values: {
                        '': '',
                        ExecutablePath: path.join(regTestRoot, 'python37', 'python.exe'),
                    },
                    subKeys: [] as string[],
                },
            ],
        },
        x86: {
            HKLM: [],
            HKCU: [
                {
                    key: '\\SOFTWARE\\Python',
                    values: { '': '' },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCodingPack'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCodingPack',
                    values: {
                        '': '',
                        DisplayName: 'Python Software Foundation',
                        SupportUrl: 'www.python.org',
                    },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCodingPack\\3.8'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCodingPack\\3.8',
                    values: {
                        '': '',
                        DisplayName: 'Python 3.8 (32-bit)',
                        SupportUrl: 'www.python.org',
                        SysArchitecture: '32bit',
                        SysVersion: '3.8.5',
                    },
                    subKeys: ['\\SOFTWARE\\Python\\PythonCodingPack\\3.8\\InstallPath'],
                },
                {
                    key: '\\SOFTWARE\\Python\\PythonCodingPack\\3.8\\InstallPath',
                    values: {
                        '': '',
                        ExecutablePath: path.join(regTestRoot, 'python38', 'python.exe'),
                    },
                    subKeys: [] as string[],
                },
            ],
        },
    };

    function fakeRegistryValues({ arch, hive, key }: winreg.Options): Promise<winreg.IRegistryValue[]> {
        const regArch = arch === 'x86' ? registryData.x86 : registryData.x64;
        const regHive = hive === winreg.HKCU ? regArch.HKCU : regArch.HKLM;
        for (const k of regHive) {
            if (k.key === key) {
                const values: winreg.IRegistryValue[] = [];
                for (const [name, value] of Object.entries(k.values)) {
                    values.push({
                        arch: arch ?? 'x64',
                        hive: hive ?? winreg.HKLM,
                        key: k.key,
                        name,
                        type: winreg.REG_SZ,
                        value: value ?? '',
                    });
                }
                return Promise.resolve(values);
            }
        }
        return Promise.resolve([]);
    }

    function fakeRegistryKeys({ arch, hive, key }: winreg.Options): Promise<winreg.IRegistryKey[]> {
        const regArch = arch === 'x86' ? registryData.x86 : registryData.x64;
        const regHive = hive === winreg.HKCU ? regArch.HKCU : regArch.HKLM;
        for (const k of regHive) {
            if (k.key === key) {
                const keys = k.subKeys.map((s) => ({
                    arch: arch ?? 'x64',
                    hive: hive ?? winreg.HKLM,
                    key: s,
                }));
                return Promise.resolve(keys);
            }
        }
        return Promise.resolve([]);
    }

    setup(async () => {
        sinon.stub(externalDependencies, 'inExperiment').returns(true);
        stubReadRegistryValues = sinon.stub(winreg, 'readRegistryValues');
        stubReadRegistryKeys = sinon.stub(winreg, 'readRegistryKeys');
        stubReadRegistryValues.callsFake(fakeRegistryValues);
        stubReadRegistryKeys.callsFake(fakeRegistryKeys);

        locator = new WindowsRegistryLocator();
    });

    teardown(() => {
        sinon.restore();
    });

    test('iterEnvs()', async () => {
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.OtherGlobal, path.join(regTestRoot, 'py39', 'python.exe')),
            createBasicEnv(PythonEnvKind.OtherGlobal, path.join(regTestRoot, 'conda3', 'python.exe')),
            createBasicEnv(PythonEnvKind.OtherGlobal, path.join(regTestRoot, 'python37', 'python.exe')),
            createBasicEnv(PythonEnvKind.OtherGlobal, path.join(regTestRoot, 'python38', 'python.exe')),
        ].map((e) => ({ ...e, source: [PythonEnvSource.WindowsRegistry] }));

        const lazyIterator = locator.iterEnvs(undefined, true);
        const envs = await getEnvs(lazyIterator);
        expect(envs.length).to.equal(0);

        const iterator = locator.iterEnvs({ providerId: WINDOWS_REG_PROVIDER_ID }, true);
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): query is undefined', async () => {
        // Iterate no envs when query is `undefined`, i.e notify completion immediately.
        const lazyIterator = locator.iterEnvs(undefined, true);
        const envs = await getEnvs(lazyIterator);
        expect(envs.length).to.equal(0);
    });

    test('iterEnvs(): no registry permission', async () => {
        stubReadRegistryKeys.callsFake(() => {
            throw Error();
        });

        const iterator = locator.iterEnvs({ providerId: WINDOWS_REG_PROVIDER_ID }, true);
        const actualEnvs = await getEnvs(iterator);

        assert.deepStrictEqual(actualEnvs, []);
    });

    test('iterEnvs(): partial registry permission', async () => {
        stubReadRegistryKeys.callsFake(({ arch, hive, key }: winreg.Options) => {
            if (hive === winreg.HKLM) {
                throw Error();
            }
            return fakeRegistryKeys({ arch, hive, key });
        });

        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.OtherGlobal, path.join(regTestRoot, 'python37', 'python.exe')),
            createBasicEnv(PythonEnvKind.OtherGlobal, path.join(regTestRoot, 'python38', 'python.exe')),
        ].map((e) => ({ ...e, source: [PythonEnvSource.WindowsRegistry] }));

        const iterator = locator.iterEnvs({ providerId: WINDOWS_REG_PROVIDER_ID }, true);
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });
});
