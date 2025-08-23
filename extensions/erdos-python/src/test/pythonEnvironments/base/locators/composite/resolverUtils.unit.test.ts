// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import * as winreg from '../../../../../client/pythonEnvironments/common/windowsRegistry';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import * as platformApis from '../../../../../client/common/utils/platform';
import {
    PythonEnvInfo,
    PythonEnvKind,
    PythonEnvSource,
    PythonEnvType,
    PythonVersion,
    UNKNOWN_PYTHON_VERSION,
} from '../../../../../client/pythonEnvironments/base/info';
import { buildEnvInfo, setEnvDisplayString } from '../../../../../client/pythonEnvironments/base/info/env';
import { InterpreterInformation } from '../../../../../client/pythonEnvironments/base/info/interpreter';
import { parseVersion } from '../../../../../client/pythonEnvironments/base/info/pythonVersion';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertEnvEqual } from '../envTestUtils';
import { Architecture } from '../../../../../client/common/utils/platform';
import {
    AnacondaCompanyName,
    CondaInfo,
} from '../../../../../client/pythonEnvironments/common/environmentManagers/conda';
import { resolveBasicEnv } from '../../../../../client/pythonEnvironments/base/locators/composite/resolverUtils';
import * as workspaceApis from '../../../../../client/common/vscodeApis/workspaceApis';

suite('Resolver Utils', () => {
    let getWorkspaceFolders: sinon.SinonStub;
    setup(() => {
        sinon.stub(externalDependencies, 'getPythonSetting').withArgs('condaPath').returns('conda');
        getWorkspaceFolders = sinon.stub(workspaceApis, 'getWorkspaceFolderPaths');
        getWorkspaceFolders.returns([]);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Pyenv', () => {
        const testPyenvRoot = path.join(TEST_LAYOUT_ROOT, 'pyenvhome', '.pyenv');
        const testPyenvVersionsDir = path.join(testPyenvRoot, 'versions');
        setup(() => {
            sinon.stub(platformApis, 'getEnvironmentVariable').withArgs('PYENV_ROOT').returns(testPyenvRoot);
        });

        teardown(() => {
            sinon.restore();
        });
        function getExpectedPyenvInfo1(): PythonEnvInfo | undefined {
            const envInfo = buildEnvInfo({
                kind: PythonEnvKind.Pyenv,
                executable: path.join(testPyenvVersionsDir, '3.9.0', 'bin', 'python'),
                version: {
                    major: 3,
                    minor: 9,
                    micro: 0,
                },
                source: [],
            });
            envInfo.location = path.join(testPyenvVersionsDir, '3.9.0');
            envInfo.name = '3.9.0';
            setEnvDisplayString(envInfo);
            return envInfo;
        }

        function getExpectedPyenvInfo2(): PythonEnvInfo | undefined {
            const envInfo = buildEnvInfo({
                kind: PythonEnvKind.Pyenv,
                executable: path.join(testPyenvVersionsDir, 'miniconda3-4.7.12', 'bin', 'python'),
                version: {
                    major: 3,
                    minor: 7,
                    micro: -1,
                },
                source: [],
                org: 'miniconda3',
                type: PythonEnvType.Conda,
            });
            envInfo.location = path.join(testPyenvVersionsDir, 'miniconda3-4.7.12');
            envInfo.name = 'base';
            setEnvDisplayString(envInfo);
            return envInfo;
        }

        test('resolveEnv', async () => {
            const executablePath = path.join(testPyenvVersionsDir, '3.9.0', 'bin', 'python');
            const expected = getExpectedPyenvInfo1();

            const actual = await resolveBasicEnv({ executablePath, kind: PythonEnvKind.Pyenv });
            assertEnvEqual(actual, expected);
        });

        test('resolveEnv (base conda env)', async () => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Linux);
            const executablePath = path.join(testPyenvVersionsDir, 'miniconda3-4.7.12', 'bin', 'python');
            const expected = getExpectedPyenvInfo2();

            const actual = await resolveBasicEnv({ executablePath, kind: PythonEnvKind.Pyenv });
            assertEnvEqual(actual, expected);
        });
    });

    suite('Microsoft store', () => {
        const testLocalAppData = path.join(TEST_LAYOUT_ROOT, 'storeApps');
        const testStoreAppRoot = path.join(testLocalAppData, 'Microsoft', 'WindowsApps');

        setup(() => {
            sinon.stub(platformApis, 'getEnvironmentVariable').withArgs('LOCALAPPDATA').returns(testLocalAppData);
        });

        teardown(() => {
            sinon.restore();
        });

        function createExpectedInterpreterInfo(
            executable: string,
            sysVersion?: string,
            sysPrefix?: string,
            versionStr?: string,
        ): InterpreterInformation {
            let version: PythonVersion;
            try {
                version = parseVersion(versionStr ?? path.basename(executable));
                if (sysVersion) {
                    version.sysVersion = sysVersion;
                }
            } catch (e) {
                version = UNKNOWN_PYTHON_VERSION;
            }
            return {
                version,
                arch: Architecture.x64,
                executable: {
                    filename: executable,
                    sysPrefix: sysPrefix ?? '',
                    ctime: -1,
                    mtime: -1,
                },
            };
        }

        test('resolveEnv', async () => {
            const python38path = path.join(testStoreAppRoot, 'python3.8.exe');
            const expected: PythonEnvInfo = {
                display: undefined,
                searchLocation: undefined,
                name: '',
                location: '',
                kind: PythonEnvKind.MicrosoftStore,
                distro: { org: 'Microsoft' },
                source: [PythonEnvSource.PathEnvVar],
                identifiedUsingNativeLocator: undefined,
                pythonRunCommand: undefined,
                ...createExpectedInterpreterInfo(python38path),
            };
            setEnvDisplayString(expected);

            const actual = await resolveBasicEnv({
                executablePath: python38path,
                kind: PythonEnvKind.MicrosoftStore,
            });

            assertEnvEqual(actual, expected);
        });

        test('resolveEnv(string): forbidden path', async () => {
            const python38path = path.join(testLocalAppData, 'Program Files', 'WindowsApps', 'python3.8.exe');
            const expected: PythonEnvInfo = {
                display: undefined,
                searchLocation: undefined,
                name: '',
                location: '',
                kind: PythonEnvKind.MicrosoftStore,
                distro: { org: 'Microsoft' },
                source: [PythonEnvSource.PathEnvVar],
                identifiedUsingNativeLocator: undefined,
                pythonRunCommand: undefined,
                ...createExpectedInterpreterInfo(python38path),
            };
            setEnvDisplayString(expected);

            const actual = await resolveBasicEnv({
                executablePath: python38path,
                kind: PythonEnvKind.MicrosoftStore,
            });

            assertEnvEqual(actual, expected);
        });
    });

    suite('Conda', () => {
        const condaPrefixNonWindows = path.join(TEST_LAYOUT_ROOT, 'conda2');
        const condaPrefixWindows = path.join(TEST_LAYOUT_ROOT, 'conda1');
        const condaInfo: CondaInfo = {
            conda_version: '4.8.0',
            python_version: '3.9.0',
            'sys.version': '3.9.0',
            'sys.prefix': '/some/env',
            root_prefix: path.dirname(TEST_LAYOUT_ROOT),
            envs: [],
            envs_dirs: [TEST_LAYOUT_ROOT],
        };

        function expectedEnvInfo(executable: string, location: string, name: string) {
            const info = buildEnvInfo({
                executable,
                kind: PythonEnvKind.Conda,
                org: AnacondaCompanyName,
                location,
                source: [],
                version: UNKNOWN_PYTHON_VERSION,
                fileInfo: undefined,
                name,
                type: PythonEnvType.Conda,
            });
            setEnvDisplayString(info);
            return info;
        }
        function createSimpleEnvInfo(
            interpreterPath: string,
            kind: PythonEnvKind,
            version: PythonVersion = UNKNOWN_PYTHON_VERSION,
            name = '',
            location = '',
        ): PythonEnvInfo {
            const info: PythonEnvInfo = {
                name,
                location,
                kind,
                executable: {
                    filename: interpreterPath,
                    sysPrefix: '',
                    ctime: -1,
                    mtime: -1,
                },
                display: undefined,
                version,
                arch: Architecture.Unknown,
                distro: { org: '' },
                searchLocation: undefined,
                source: [],
                identifiedUsingNativeLocator: undefined,
                pythonRunCommand: undefined,
            };
            info.type = PythonEnvType.Conda;
            setEnvDisplayString(info);
            return info;
        }

        teardown(() => {
            sinon.restore();
        });

        test('resolveEnv (Windows)', async () => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Windows);
            sinon.stub(externalDependencies, 'exec').callsFake(async (command: string, args: string[]) => {
                if (command === 'conda' && args[0] === 'info' && args[1] === '--json') {
                    return { stdout: JSON.stringify(condaInfo) };
                }
                throw new Error(`${command} is missing or is not executable`);
            });
            const actual = await resolveBasicEnv({
                executablePath: path.join(condaPrefixWindows, 'python.exe'),
                envPath: condaPrefixWindows,
                kind: PythonEnvKind.Conda,
            });
            assertEnvEqual(
                actual,
                expectedEnvInfo(
                    path.join(condaPrefixWindows, 'python.exe'),
                    condaPrefixWindows,
                    path.basename(condaPrefixWindows),
                ),
            );
        });

        test('resolveEnv (non-Windows)', async () => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Linux);
            sinon.stub(externalDependencies, 'exec').callsFake(async (command: string, args: string[]) => {
                if (command === 'conda' && args[0] === 'info' && args[1] === '--json') {
                    return { stdout: JSON.stringify(condaInfo) };
                }
                throw new Error(`${command} is missing or is not executable`);
            });
            const actual = await resolveBasicEnv({
                executablePath: path.join(condaPrefixNonWindows, 'bin', 'python'),
                kind: PythonEnvKind.Conda,
                envPath: condaPrefixNonWindows,
            });
            assertEnvEqual(
                actual,
                expectedEnvInfo(
                    path.join(condaPrefixNonWindows, 'bin', 'python'),
                    condaPrefixNonWindows,
                    path.basename(condaPrefixNonWindows),
                ),
            );
        });

        test('resolveEnv: If no conda binary found, resolve as an unknown environment', async () => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Windows);
            sinon.stub(externalDependencies, 'exec').callsFake(async (command: string) => {
                throw new Error(`${command} is missing or is not executable`);
            });
            const actual = await resolveBasicEnv({
                executablePath: path.join(TEST_LAYOUT_ROOT, 'conda1', 'python.exe'),
                kind: PythonEnvKind.Conda,
            });
            assertEnvEqual(
                actual,
                createSimpleEnvInfo(
                    path.join(TEST_LAYOUT_ROOT, 'conda1', 'python.exe'),
                    PythonEnvKind.Unknown,
                    undefined,
                    '',
                    path.join(TEST_LAYOUT_ROOT, 'conda1'),
                ),
            );
        });
    });

    suite('Simple envs', () => {
        const testVirtualHomeDir = path.join(TEST_LAYOUT_ROOT, 'virtualhome');
        setup(() => {
            getWorkspaceFolders.returns([testVirtualHomeDir]);
        });

        teardown(() => {
            sinon.restore();
        });

        function createExpectedEnvInfo(
            interpreterPath: string,
            kind: PythonEnvKind,
            version: PythonVersion = UNKNOWN_PYTHON_VERSION,
            name = '',
            location = '',
        ): PythonEnvInfo {
            const info: PythonEnvInfo = {
                name,
                location,
                kind,
                executable: {
                    filename: interpreterPath,
                    sysPrefix: '',
                    ctime: -1,
                    mtime: -1,
                },
                display: undefined,
                version,
                arch: Architecture.Unknown,
                distro: { org: '' },
                searchLocation: Uri.file(location),
                source: [],
                type: PythonEnvType.Virtual,
                identifiedUsingNativeLocator: undefined,
                pythonRunCommand: undefined,
            };
            setEnvDisplayString(info);
            return info;
        }

        test('resolveEnv', async () => {
            const expected = createExpectedEnvInfo(
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
                PythonEnvKind.Venv,
                undefined,
                'win1',
                path.join(testVirtualHomeDir, '.venvs', 'win1'),
            );
            const actual = await resolveBasicEnv({
                executablePath: path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
                kind: PythonEnvKind.Venv,
            });
            assertEnvEqual(actual, expected);
        });
    });

    suite('Globally-installed envs', () => {
        const testPosixKnownPathsRoot = path.join(TEST_LAYOUT_ROOT, 'posixroot');
        const testLocation3 = path.join(testPosixKnownPathsRoot, 'location3');
        setup(() => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Linux);
        });

        teardown(() => {
            sinon.restore();
        });

        function createExpectedEnvInfo(
            interpreterPath: string,
            kind: PythonEnvKind,
            version: PythonVersion = UNKNOWN_PYTHON_VERSION,
            name = '',
            location = '',
        ): PythonEnvInfo {
            const info: PythonEnvInfo = {
                name,
                location,
                kind,
                executable: {
                    filename: interpreterPath,
                    sysPrefix: '',
                    ctime: -1,
                    mtime: -1,
                },
                display: undefined,
                version,
                arch: Architecture.Unknown,
                distro: { org: '' },
                searchLocation: undefined,
                source: [],
                identifiedUsingNativeLocator: undefined,
                pythonRunCommand: undefined,
            };
            setEnvDisplayString(info);
            return info;
        }

        test('resolveEnv', async () => {
            const executable = path.join(testLocation3, 'python3.8');
            const expected = createExpectedEnvInfo(executable, PythonEnvKind.OtherGlobal, parseVersion('3.8'));
            const actual = await resolveBasicEnv({
                executablePath: executable,
                kind: PythonEnvKind.OtherGlobal,
            });
            assertEnvEqual(actual, expected);
        });
    });

    suite('Windows registry', () => {
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
                HKCU: [],
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
            sinon.stub(winreg, 'readRegistryValues').callsFake(fakeRegistryValues);
            sinon.stub(winreg, 'readRegistryKeys').callsFake(fakeRegistryKeys);
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Windows);
        });

        teardown(() => {
            sinon.restore();
        });

        test('If data provided by registry is more informative than kind resolvers, use it to update environment (64bit)', async () => {
            const interpreterPath = path.join(regTestRoot, 'py39', 'python.exe');
            const actual = await resolveBasicEnv({
                executablePath: interpreterPath,
                kind: PythonEnvKind.Unknown,
                source: [PythonEnvSource.WindowsRegistry],
            });
            const expected = buildEnvInfo({
                kind: PythonEnvKind.OtherGlobal, // Environment should be marked as "Global" instead of "Unknown".
                executable: interpreterPath,
                version: parseVersion('3.9.0rc2'), // Registry provides more complete version info.
                arch: Architecture.x64,
                org: 'PythonCore',
                source: [PythonEnvSource.WindowsRegistry],
            });
            setEnvDisplayString(expected);
            expected.distro.defaultDisplayName = 'Python 3.9 (64-bit)';
            assertEnvEqual(actual, expected);
        });

        test('If data provided by registry is more informative than kind resolvers, use it to update environment (32bit)', async () => {
            const interpreterPath = path.join(regTestRoot, 'python38', 'python.exe');
            const actual = await resolveBasicEnv({
                executablePath: interpreterPath,
                kind: PythonEnvKind.Unknown,
                source: [PythonEnvSource.WindowsRegistry, PythonEnvSource.PathEnvVar],
            });
            const expected = buildEnvInfo({
                kind: PythonEnvKind.OtherGlobal, // Environment should be marked as "Global" instead of "Unknown".
                executable: interpreterPath,
                version: parseVersion('3.8.5'), // Registry provides more complete version info.
                arch: Architecture.x86, // Provided by registry
                org: 'PythonCodingPack', // Provided by registry
                source: [PythonEnvSource.WindowsRegistry, PythonEnvSource.PathEnvVar],
            });
            setEnvDisplayString(expected);
            expected.distro.defaultDisplayName = 'Python 3.8 (32-bit)';
            assertEnvEqual(actual, expected);
        });

        test('If data provided by registry is less informative than kind resolvers, do not use it to update environment', async () => {
            sinon.stub(externalDependencies, 'exec').callsFake(async (command: string) => {
                throw new Error(`${command} is missing or is not executable`);
            });
            const interpreterPath = path.join(regTestRoot, 'conda3', 'python.exe');
            const actual = await resolveBasicEnv({
                executablePath: interpreterPath,
                kind: PythonEnvKind.Conda,
                source: [PythonEnvSource.WindowsRegistry],
            });
            const expected = buildEnvInfo({
                location: path.join(regTestRoot, 'conda3'),
                // Environment is not marked as Conda, update it to Global.
                kind: PythonEnvKind.OtherGlobal,
                executable: interpreterPath,
                // Registry does not provide the minor version, so keep version provided by Conda resolver instead.
                version: parseVersion('3.8.5'),
                arch: Architecture.x64, // Provided by registry
                org: 'ContinuumAnalytics', // Provided by registry
                name: '',
                source: [PythonEnvSource.WindowsRegistry],
                type: PythonEnvType.Conda,
            });
            setEnvDisplayString(expected);
            expected.distro.defaultDisplayName = 'Anaconda py38_4.8.3';
            assertEnvEqual(actual, expected);
        });
    });
});
