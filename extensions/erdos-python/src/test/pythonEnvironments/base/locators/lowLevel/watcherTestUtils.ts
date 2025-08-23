// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert } from 'chai';
import * as path from 'path';
import * as fs from '../../../../../client/common/platform/fs-paths';
import { FileChangeType } from '../../../../../client/common/platform/fileSystemWatcher';
import { IDisposable } from '../../../../../client/common/types';
import { createDeferred, Deferred, sleep } from '../../../../../client/common/utils/async';
import { getOSType, OSType } from '../../../../../client/common/utils/platform';
import { traceWarn } from '../../../../../client/logging';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { BasicEnvInfo, ILocator } from '../../../../../client/pythonEnvironments/base/locator';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { PythonEnvsChangedEvent } from '../../../../../client/pythonEnvironments/base/watcher';
import { getInterpreterPathFromDir } from '../../../../../client/pythonEnvironments/common/commonUtils';
import * as externalDeps from '../../../../../client/pythonEnvironments/common/externalDependencies';
import { deleteFiles, PYTHON_PATH } from '../../../../common';
import { TEST_TIMEOUT } from '../../../../constants';
import { run } from '../envTestUtils';

/**
 * A utility class used to create, delete, or modify environments. Primarily used for watcher
 * tests, where we need to create environments.
 */
class Venvs {
    constructor(private readonly root: string, private readonly prefix = '.virtualenv-') {}

    public async create(name: string): Promise<{ executable: string; envDir: string }> {
        const envName = this.resolve(name);
        const argv = [PYTHON_PATH.fileToCommandArgumentForPythonExt(), '-m', 'virtualenv', envName];
        try {
            await run(argv, { cwd: this.root });
        } catch (err) {
            throw new Error(`Failed to create Env ${path.basename(envName)} Error: ${err}`);
        }
        const dirToLookInto = path.join(this.root, envName);
        const filename = await getInterpreterPathFromDir(dirToLookInto);
        if (!filename) {
            throw new Error(`No environment to update exists in ${dirToLookInto}`);
        }
        return { executable: filename, envDir: path.dirname(path.dirname(filename)) };
    }

    /**
     * Creates a dummy environment by creating a fake executable.
     * @param name environment suffix name to create
     */
    public async createDummyEnv(
        name: string,
        kind: PythonEnvKind | undefined,
    ): Promise<{ executable: string; envDir: string }> {
        const envName = this.resolve(name);
        const interpreterPath = path.join(this.root, envName, getOSType() === OSType.Windows ? 'python.exe' : 'python');
        const configPath = path.join(this.root, envName, 'pyvenv.cfg');
        try {
            await fs.createFile(interpreterPath);
            if (kind === PythonEnvKind.Venv) {
                await fs.createFile(configPath);
                await fs.writeFile(configPath, 'version = 3.9.2');
            }
        } catch (err) {
            throw new Error(`Failed to create python executable ${interpreterPath}, Error: ${err}`);
        }
        return { executable: interpreterPath, envDir: path.dirname(interpreterPath) };
    }

    // eslint-disable-next-line class-methods-use-this
    public async update(filename: string): Promise<void> {
        try {
            await fs.writeFile(filename, 'Environment has been updated');
        } catch (err) {
            throw new Error(`Failed to update Workspace virtualenv executable ${filename}, Error: ${err}`);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    public async delete(filename: string): Promise<void> {
        try {
            await fs.remove(filename);
        } catch (err) {
            traceWarn(`Failed to clean up ${filename}`);
        }
    }

    public async cleanUp(): Promise<void> {
        const globPattern = path.join(this.root, `${this.prefix}*`);
        await deleteFiles(globPattern);
    }

    private resolve(name: string): string {
        // Ensure env is random to avoid conflicts in tests (corrupting test data)
        const now = new Date().getTime().toString().substr(-8);
        return `${this.prefix}${name}${now}`;
    }
}

type locatorFactoryFuncType1 = () => Promise<ILocator<BasicEnvInfo> & IDisposable>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type locatorFactoryFuncType2 = (_: any) => Promise<ILocator<BasicEnvInfo> & IDisposable>;

export type locatorFactoryFuncType = locatorFactoryFuncType1 & locatorFactoryFuncType2;

/**
 * Test if we're able to:
 * * Detect a new environment
 * * Detect when an environment has been deleted
 * * Detect when an environment has been updated
 * @param root The root folder where we create, delete, or modify environments.
 * @param createLocatorFactoryFunc The factory function used to create the locator.
 */
export function testLocatorWatcher(
    root: string,
    createLocatorFactoryFunc: locatorFactoryFuncType,
    options?: {
        /**
         * Argument to the locator factory function if any.
         */
        arg?: string;
        /**
         * Environment kind to check for in watcher events.
         * If not specified the check is skipped is default. This is because detecting kind of virtual env
         * often depends on the file structure around the executable, so we need to wait before attempting
         * to verify it. Omitting that check in those cases as we can never deterministically say when it's
         * ready to check.
         */
        kind?: PythonEnvKind;
        /**
         * For search based locators it is possible to verify if the environment is now being located, as it
         * can be searched for. But for non-search based locators, for eg. which rely on running commands to
         * get environments, it's not possible to verify it without executing actual commands, installing tools
         * etc, so this option is useful for those locators.
         */
        doNotVerifyIfLocated?: boolean;
    },
): void {
    let locator: ILocator<BasicEnvInfo> & IDisposable;
    const venvs = new Venvs(root);

    async function waitForChangeToBeDetected(deferred: Deferred<void>) {
        const timeout = setTimeout(() => {
            clearTimeout(timeout);
            deferred.reject(new Error('Environment not detected'));
        }, TEST_TIMEOUT);
        await deferred.promise;
    }

    async function isLocated(executable: string): Promise<boolean> {
        const items = await getEnvs(locator.iterEnvs());
        return items.some((item) => externalDeps.arePathsSame(item.executablePath, executable));
    }

    suiteSetup(async function () {
        if (getOSType() === OSType.Linux) {
            this.skip();
        }
        await venvs.cleanUp();
    });
    async function setupLocator(onChanged: (e: PythonEnvsChangedEvent) => Promise<void>) {
        locator = options?.arg ? await createLocatorFactoryFunc(options.arg) : await createLocatorFactoryFunc();
        locator.onChanged(onChanged);
        await getEnvs(locator.iterEnvs()); // Force the FS watcher to start.
        // Wait for watchers to get ready
        await sleep(2000);
    }

    teardown(async () => {
        if (locator) {
            await locator.dispose();
        }
        await venvs.cleanUp();
    });

    test('Detect a new environment', async () => {
        let actualEvent: PythonEnvsChangedEvent;
        const deferred = createDeferred<void>();
        await setupLocator(async (e) => {
            actualEvent = e;
            deferred.resolve();
        });

        const { executable, envDir } = await venvs.create('one');
        await waitForChangeToBeDetected(deferred);
        if (!options?.doNotVerifyIfLocated) {
            const isFound = await isLocated(executable);
            assert.ok(isFound);
        }

        assert.strictEqual(actualEvent!.type, FileChangeType.Created, 'Wrong event emitted');
        if (options?.kind) {
            assert.strictEqual(actualEvent!.kind, options.kind, 'Wrong event emitted');
        }
        assert.notStrictEqual(actualEvent!.searchLocation, undefined, 'Wrong event emitted');
        assert.ok(
            externalDeps.arePathsSame(actualEvent!.searchLocation!.fsPath, path.dirname(envDir)),
            'Wrong event emitted',
        );
    }).timeout(TEST_TIMEOUT * 2);

    test('Detect when an environment has been deleted', async () => {
        let actualEvent: PythonEnvsChangedEvent;
        const deferred = createDeferred<void>();
        const { executable, envDir } = await venvs.create('one');
        await setupLocator(async (e) => {
            if (e.type === FileChangeType.Deleted) {
                actualEvent = e;
                deferred.resolve();
            }
        });

        // VSCode API has a limitation where it fails to fire event when environment folder is deleted directly:
        // https://github.com/microsoft/vscode/issues/110923
        // Using chokidar directly in tests work, but it has permission issues on Windows that you cannot delete a
        // folder if it has a subfolder that is being watched inside: https://github.com/paulmillr/chokidar/issues/422
        // Hence we test directly deleting the executable, and not the whole folder using `workspaceVenvs.cleanUp()`.
        await venvs.delete(executable);
        await waitForChangeToBeDetected(deferred);
        if (!options?.doNotVerifyIfLocated) {
            const isFound = await isLocated(executable);
            assert.notOk(isFound);
        }

        assert.notStrictEqual(actualEvent!, undefined, 'Wrong event emitted');
        if (options?.kind) {
            assert.strictEqual(actualEvent!.kind, options.kind, 'Wrong event emitted');
        }
        assert.notStrictEqual(actualEvent!.searchLocation, undefined, 'Wrong event emitted');
        assert.ok(
            externalDeps.arePathsSame(actualEvent!.searchLocation!.fsPath, path.dirname(envDir)),
            'Wrong event emitted',
        );
    }).timeout(TEST_TIMEOUT * 2);

    test('Detect when an environment has been updated', async () => {
        let actualEvent: PythonEnvsChangedEvent;
        const deferred = createDeferred<void>();
        // Create a dummy environment so we can update its executable later. We can't choose a real environment here.
        // Executables inside real environments can be symlinks, so writing on them can result in the real executable
        // being updated instead of the symlink.
        const { executable, envDir } = await venvs.createDummyEnv('one', options?.kind);
        await setupLocator(async (e) => {
            if (e.type === FileChangeType.Changed) {
                actualEvent = e;
                deferred.resolve();
            }
        });

        await venvs.update(executable);
        await waitForChangeToBeDetected(deferred);
        assert.notStrictEqual(actualEvent!, undefined, 'Event was not emitted');
        if (options?.kind) {
            assert.strictEqual(actualEvent!.kind, options.kind, 'Kind is not as expected');
        }
        assert.notStrictEqual(actualEvent!.searchLocation, undefined, 'Search location is not set');
        assert.ok(
            externalDeps.arePathsSame(actualEvent!.searchLocation!.fsPath, path.dirname(envDir)),
            `Paths don't match ${actualEvent!.searchLocation!.fsPath} != ${path.dirname(envDir)}`,
        );
    }).timeout(TEST_TIMEOUT * 2);
}
