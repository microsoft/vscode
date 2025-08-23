// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert, expect } from 'chai';
import { cloneDeep } from 'lodash';
import * as path from 'path';
import * as sinon from 'sinon';
import { EventEmitter, Uri } from 'vscode';
import { ExecutionResult } from '../../../../../client/common/process/types';
import { IDisposableRegistry } from '../../../../../client/common/types';
import { Architecture } from '../../../../../client/common/utils/platform';
import * as platformApis from '../../../../../client/common/utils/platform';
import {
    PythonEnvInfo,
    PythonEnvKind,
    PythonEnvType,
    PythonVersion,
    UNKNOWN_PYTHON_VERSION,
} from '../../../../../client/pythonEnvironments/base/info';
import { getEmptyVersion, parseVersion } from '../../../../../client/pythonEnvironments/base/info/pythonVersion';
import {
    BasicEnvInfo,
    isProgressEvent,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonEnvUpdatedEvent,
} from '../../../../../client/pythonEnvironments/base/locator';
import { PythonEnvsResolver } from '../../../../../client/pythonEnvironments/base/locators/composite/envsResolver';
import { PythonEnvsChangedEvent } from '../../../../../client/pythonEnvironments/base/watcher';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import {
    getEnvironmentInfoService,
    IEnvironmentInfoService,
} from '../../../../../client/pythonEnvironments/base/info/environmentInfoService';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertEnvEqual, assertEnvsEqual } from '../envTestUtils';
import { createBasicEnv, getEnvs, getEnvsWithUpdates, SimpleLocator } from '../../common';
import { getOSType, OSType } from '../../../../common';
import { CondaInfo } from '../../../../../client/pythonEnvironments/common/environmentManagers/conda';
import { createDeferred } from '../../../../../client/common/utils/async';
import * as workspaceApis from '../../../../../client/common/vscodeApis/workspaceApis';

suite('Python envs locator - Environments Resolver', () => {
    let envInfoService: IEnvironmentInfoService;
    let disposables: IDisposableRegistry;
    const testVirtualHomeDir = path.join(TEST_LAYOUT_ROOT, 'virtualhome');

    setup(() => {
        disposables = [];
        envInfoService = getEnvironmentInfoService(disposables);
    });
    teardown(() => {
        sinon.restore();
        disposables.forEach((d) => d.dispose());
    });

    /**
     * Returns the expected environment to be returned by Environment info service
     */
    function createExpectedEnvInfo(
        env: PythonEnvInfo,
        expectedDisplay: string,
        expectedDetailedDisplay: string,
    ): PythonEnvInfo {
        const updatedEnv = cloneDeep(env);
        updatedEnv.version = {
            ...parseVersion('3.8.3-final'),
            sysVersion: '3.8.3 (tags/v3.8.3:6f8c832, May 13 2020, 22:37:02) [MSC v.1924 64 bit (AMD64)]',
        };
        updatedEnv.executable.filename = env.executable.filename;
        updatedEnv.executable.sysPrefix = 'path';
        updatedEnv.arch = Architecture.x64;
        updatedEnv.display = expectedDisplay;
        updatedEnv.detailedDisplayName = expectedDetailedDisplay;
        updatedEnv.identifiedUsingNativeLocator = updatedEnv.identifiedUsingNativeLocator ?? undefined;
        updatedEnv.pythonRunCommand = updatedEnv.pythonRunCommand ?? undefined;
        if (env.kind === PythonEnvKind.Conda) {
            env.type = PythonEnvType.Conda;
        }
        return updatedEnv;
    }

    function createExpectedResolvedEnvInfo(
        interpreterPath: string,
        kind: PythonEnvKind,
        version: PythonVersion = UNKNOWN_PYTHON_VERSION,
        name = '',
        location = '',
        display: string | undefined = undefined,
        type?: PythonEnvType,
        detailedDisplay?: string,
    ): PythonEnvInfo {
        return {
            name,
            location,
            kind,
            executable: {
                filename: interpreterPath,
                sysPrefix: '',
                ctime: -1,
                mtime: -1,
            },
            display,
            detailedDisplayName: detailedDisplay ?? display,
            version,
            arch: Architecture.Unknown,
            distro: { org: '' },
            searchLocation: Uri.file(location),
            source: [],
            type,
            identifiedUsingNativeLocator: undefined,
            pythonRunCommand: undefined,
        };
    }
    suite('iterEnvs()', () => {
        let stubShellExec: sinon.SinonStub;
        setup(() => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Windows);
            stubShellExec = sinon.stub(externalDependencies, 'shellExecute');
            stubShellExec.returns(
                new Promise<ExecutionResult<string>>((resolve) => {
                    resolve({
                        stdout:
                            '{"versionInfo": [3, 8, 3, "final", 0], "sysPrefix": "path", "sysVersion": "3.8.3 (tags/v3.8.3:6f8c832, May 13 2020, 22:37:02) [MSC v.1924 64 bit (AMD64)]", "is64Bit": true}',
                    });
                }),
            );
            sinon.stub(workspaceApis, 'getWorkspaceFolderPaths').returns([testVirtualHomeDir]);
        });

        teardown(() => {
            sinon.restore();
        });

        test('Iterator yields environments after resolving basic envs received from parent iterator', async () => {
            const env1 = createBasicEnv(
                PythonEnvKind.Venv,
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
            );
            const resolvedEnvReturnedByBasicResolver = createExpectedResolvedEnvInfo(
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
                PythonEnvKind.Venv,
                undefined,
                'win1',
                path.join(testVirtualHomeDir, '.venvs', 'win1'),
                "Python ('win1')",
                PythonEnvType.Virtual,
                "Python ('win1': venv)",
            );
            const envsReturnedByParentLocator = [env1];
            const parentLocator = new SimpleLocator<BasicEnvInfo>(envsReturnedByParentLocator);
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            const iterator = resolver.iterEnvs();
            const envs = await getEnvs(iterator);

            assertEnvsEqual(envs, [resolvedEnvReturnedByBasicResolver]);
        });

        test('Updates for environments are sent correctly followed by the null event', async () => {
            // Arrange
            const env1 = createBasicEnv(
                PythonEnvKind.Venv,
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
            );
            const resolvedEnvReturnedByBasicResolver = createExpectedResolvedEnvInfo(
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
                PythonEnvKind.Venv,
                undefined,
                'win1',
                path.join(testVirtualHomeDir, '.venvs', 'win1'),
                undefined,
                PythonEnvType.Virtual,
            );
            const envsReturnedByParentLocator = [env1];
            const parentLocator = new SimpleLocator<BasicEnvInfo>(envsReturnedByParentLocator);
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            const iterator = resolver.iterEnvs();
            const envs = await getEnvsWithUpdates(iterator);

            assertEnvsEqual(envs, [
                createExpectedEnvInfo(
                    resolvedEnvReturnedByBasicResolver,
                    "Python 3.8.3 ('win1')",
                    "Python 3.8.3 ('win1': venv)",
                ),
            ]);
        });

        test('If fetching interpreter info fails, it is not reported in the final list of envs', async () => {
            // Arrange
            stubShellExec.returns(
                new Promise<ExecutionResult<string>>((resolve) => {
                    resolve({
                        stdout: '',
                    });
                }),
            );
            // Arrange
            const env1 = createBasicEnv(
                PythonEnvKind.Venv,
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
            );
            const envsReturnedByParentLocator = [env1];
            const parentLocator = new SimpleLocator<BasicEnvInfo>(envsReturnedByParentLocator);
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            // Act
            const iterator = resolver.iterEnvs();
            const envs = await getEnvsWithUpdates(iterator);

            // Assert
            assertEnvsEqual(envs, []);
        });

        test('Updates to environments from the incoming iterator are applied properly', async () => {
            // Arrange
            const env = createBasicEnv(
                PythonEnvKind.Unknown,
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
            );
            const updatedEnv = createBasicEnv(
                PythonEnvKind.VirtualEnv, // Ensure this type is discarded.
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
            );
            const resolvedUpdatedEnvReturnedByBasicResolver = createExpectedResolvedEnvInfo(
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
                PythonEnvKind.Venv,
                undefined,
                'win1',
                path.join(testVirtualHomeDir, '.venvs', 'win1'),
                undefined,
                PythonEnvType.Virtual,
            );
            const envsReturnedByParentLocator = [env];
            const didUpdate = new EventEmitter<PythonEnvUpdatedEvent<BasicEnvInfo> | ProgressNotificationEvent>();
            const parentLocator = new SimpleLocator<BasicEnvInfo>(envsReturnedByParentLocator, {
                onUpdated: didUpdate.event,
            });
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            // Act
            const iterator = resolver.iterEnvs();
            const iteratorUpdateCallback = () => {
                didUpdate.fire({ stage: ProgressReportStage.discoveryStarted });
                didUpdate.fire({ index: 0, old: env, update: updatedEnv });
                didUpdate.fire({ stage: ProgressReportStage.discoveryFinished }); // It is essential for the incoming iterator to fire event signifying it's done
            };
            const envs = await getEnvsWithUpdates(iterator, iteratorUpdateCallback);

            // Assert
            assertEnvsEqual(envs, [
                createExpectedEnvInfo(
                    resolvedUpdatedEnvReturnedByBasicResolver,
                    "Python 3.8.3 ('win1')",
                    "Python 3.8.3 ('win1': venv)",
                ),
            ]);
            didUpdate.dispose();
        });

        test('Ensure progress updates are emitted correctly', async () => {
            // Arrange
            const shellExecDeferred = createDeferred<void>();
            stubShellExec.reset();
            stubShellExec.returns(
                shellExecDeferred.promise.then(
                    () =>
                        new Promise<ExecutionResult<string>>((resolve) => {
                            resolve({
                                stdout:
                                    '{"versionInfo": [3, 8, 3, "final", 0], "sysPrefix": "path", "sysVersion": "3.8.3 (tags/v3.8.3:6f8c832, May 13 2020, 22:37:02) [MSC v.1924 64 bit (AMD64)]", "is64Bit": true}',
                            });
                        }),
                ),
            );
            const env = createBasicEnv(
                PythonEnvKind.Venv,
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
            );
            const updatedEnv = createBasicEnv(
                PythonEnvKind.Poetry,
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
            );
            const envsReturnedByParentLocator = [env];
            const didUpdate = new EventEmitter<PythonEnvUpdatedEvent<BasicEnvInfo> | ProgressNotificationEvent>();
            const parentLocator = new SimpleLocator<BasicEnvInfo>(envsReturnedByParentLocator, {
                onUpdated: didUpdate.event,
            });
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            const iterator = resolver.iterEnvs();
            let stage: ProgressReportStage | undefined;
            let waitForProgressEvent = createDeferred<void>();
            iterator.onUpdated!(async (event) => {
                if (isProgressEvent(event)) {
                    stage = event.stage;
                    waitForProgressEvent.resolve();
                }
            });
            // Act
            let result = await iterator.next();
            while (!result.done) {
                result = await iterator.next();
            }
            didUpdate.fire({ stage: ProgressReportStage.discoveryStarted });
            await waitForProgressEvent.promise;
            // Assert
            expect(stage).to.equal(ProgressReportStage.discoveryStarted);

            // Act
            waitForProgressEvent = createDeferred<void>();
            didUpdate.fire({ index: 0, old: env, update: updatedEnv });
            didUpdate.fire({ stage: ProgressReportStage.discoveryFinished });
            await waitForProgressEvent.promise;
            // Assert
            expect(stage).to.equal(ProgressReportStage.allPathsDiscovered);

            // Act
            waitForProgressEvent = createDeferred<void>();
            shellExecDeferred.resolve();
            await waitForProgressEvent.promise;
            // Assert
            expect(stage).to.equal(ProgressReportStage.discoveryFinished);
            didUpdate.dispose();
        });
    });

    test('onChanged fires iff onChanged from resolver fires', () => {
        const parentLocator = new SimpleLocator([]);
        const event1: PythonEnvsChangedEvent = {};
        const event2: PythonEnvsChangedEvent = { kind: PythonEnvKind.Unknown };
        const expected = [event1, event2];
        const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

        const events: PythonEnvsChangedEvent[] = [];
        resolver.onChanged((e) => events.push(e));

        parentLocator.fire(event1);
        parentLocator.fire(event2);

        assert.deepEqual(events, expected);
    });

    suite('resolveEnv()', () => {
        let stubShellExec: sinon.SinonStub;
        const envsWithoutPython = path.join(TEST_LAYOUT_ROOT, 'envsWithoutPython');
        function condaInfo(condaPrefix: string): CondaInfo {
            return {
                conda_version: '4.8.0',
                python_version: '3.9.0',
                'sys.version': '3.9.0',
                'sys.prefix': '/some/env',
                root_prefix: '/some/prefix',
                envs: [condaPrefix],
                envs_dirs: [path.dirname(condaPrefix)],
            };
        }
        setup(() => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Windows);
            stubShellExec = sinon.stub(externalDependencies, 'shellExecute');
            stubShellExec.returns(
                new Promise<ExecutionResult<string>>((resolve) => {
                    resolve({
                        stdout:
                            '{"versionInfo": [3, 8, 3, "final", 0], "sysPrefix": "path", "sysVersion": "3.8.3 (tags/v3.8.3:6f8c832, May 13 2020, 22:37:02) [MSC v.1924 64 bit (AMD64)]", "is64Bit": true}',
                    });
                }),
            );
            sinon.stub(workspaceApis, 'getWorkspaceFolderPaths').returns([testVirtualHomeDir]);
        });

        teardown(() => {
            sinon.restore();
        });

        test('Calls into basic resolver to get environment info, then calls environnment service to resolve environment further and return it', async function () {
            if (getOSType() !== OSType.Windows) {
                this.skip();
            }
            const resolvedEnvReturnedByBasicResolver = createExpectedResolvedEnvInfo(
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
                PythonEnvKind.Venv,
                undefined,
                'win1',
                path.join(testVirtualHomeDir, '.venvs', 'win1'),
                undefined,
                PythonEnvType.Virtual,
            );
            const parentLocator = new SimpleLocator([]);
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            const expected = await resolver.resolveEnv(path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'));

            assertEnvEqual(
                expected,
                createExpectedEnvInfo(
                    resolvedEnvReturnedByBasicResolver,
                    "Python 3.8.3 ('win1')",
                    "Python 3.8.3 ('win1': venv)",
                ),
            );
        });

        test('Resolver should return empty version info for envs lacking an interpreter', async function () {
            if (getOSType() !== OSType.Windows) {
                this.skip();
            }
            sinon.stub(externalDependencies, 'getPythonSetting').withArgs('condaPath').returns('conda');
            sinon.stub(externalDependencies, 'exec').callsFake(async (command: string, args: string[]) => {
                if (command === 'conda' && args[0] === 'info' && args[1] === '--json') {
                    return { stdout: JSON.stringify(condaInfo(path.join(envsWithoutPython, 'condaLackingPython'))) };
                }
                throw new Error(`${command} is missing or is not executable`);
            });
            const parentLocator = new SimpleLocator([]);
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            const expected = await resolver.resolveEnv(path.join(envsWithoutPython, 'condaLackingPython'));

            assert.deepEqual(expected?.version, getEmptyVersion());
            assert.equal(expected?.display, "Python ('condaLackingPython')");
            assert.equal(expected?.detailedDisplayName, "Python ('condaLackingPython': conda)");
        });

        test('If running interpreter info throws error, return undefined', async () => {
            stubShellExec.returns(
                new Promise<ExecutionResult<string>>((_resolve, reject) => {
                    reject();
                }),
            );
            const parentLocator = new SimpleLocator([]);
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            const expected = await resolver.resolveEnv(path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'));

            assert.deepEqual(expected, undefined);
        });

        test('If parsing interpreter info fails, return undefined', async () => {
            stubShellExec.returns(
                new Promise<ExecutionResult<string>>((resolve) => {
                    resolve({
                        stderr: 'Kaboom',
                        stdout: '',
                    });
                }),
            );
            const parentLocator = new SimpleLocator([]);
            const resolver = new PythonEnvsResolver(parentLocator, envInfoService);

            const expected = await resolver.resolveEnv(path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'));

            assert.deepEqual(expected, undefined);
        });
    });
});
