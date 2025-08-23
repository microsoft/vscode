// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import { exec } from 'child_process';
import { cloneDeep, zip } from 'lodash';
import { promisify } from 'util';
import * as fsapi from '../../../../client/common/platform/fs-paths';
import { PythonEnvInfo, PythonVersion, UNKNOWN_PYTHON_VERSION } from '../../../../client/pythonEnvironments/base/info';
import { getEmptyVersion } from '../../../../client/pythonEnvironments/base/info/pythonVersion';
import { BasicEnvInfo } from '../../../../client/pythonEnvironments/base/locator';

const execAsync = promisify(exec);
export async function run(argv: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<void> {
    const cmdline = argv.join(' ');
    const { stderr } = await execAsync(cmdline, options ?? {});
    if (stderr && stderr.length > 0) {
        throw Error(stderr);
    }
}

function normalizeVersion(version: PythonVersion): PythonVersion {
    if (version === UNKNOWN_PYTHON_VERSION) {
        version = getEmptyVersion();
    }
    // Force `undefined` to be set if nothing set.
    // eslint-disable-next-line no-self-assign
    version.release = version.release;
    // eslint-disable-next-line no-self-assign
    version.sysVersion = version.sysVersion;
    return version;
}

export function assertVersionsEqual(actual: PythonVersion | undefined, expected: PythonVersion | undefined): void {
    if (actual) {
        actual = normalizeVersion(actual);
    }
    if (expected) {
        expected = normalizeVersion(expected);
    }
    assert.deepStrictEqual(actual, expected);
}

export async function createFile(filename: string, text = ''): Promise<string> {
    await fsapi.writeFile(filename, text);
    return filename;
}

export async function deleteFile(filename: string): Promise<void> {
    await fsapi.remove(filename);
}

export function assertEnvEqual(actual: PythonEnvInfo | undefined, expected: PythonEnvInfo | undefined): void {
    assert.notStrictEqual(actual, undefined);
    assert.notStrictEqual(expected, undefined);

    if (actual) {
        // Make sure to clone so we do not alter the original object
        actual = cloneDeep(actual);
        expected = cloneDeep(expected);
        // No need to match these, so reset them
        actual.executable.ctime = -1;
        actual.executable.mtime = -1;
        actual.version = normalizeVersion(actual.version);
        if (expected) {
            expected.executable.ctime = -1;
            expected.executable.mtime = -1;
            expected.version = normalizeVersion(expected.version);
            delete expected.id;
        }
        delete actual.id;

        assert.deepStrictEqual(actual, expected);
    }
}

export function assertEnvsEqual(
    actualEnvs: (PythonEnvInfo | undefined)[],
    expectedEnvs: (PythonEnvInfo | undefined)[],
): void {
    actualEnvs = actualEnvs.sort((a, b) => (a && b ? a.executable.filename.localeCompare(b.executable.filename) : 0));
    expectedEnvs = expectedEnvs.sort((a, b) =>
        a && b ? a.executable.filename.localeCompare(b.executable.filename) : 0,
    );
    assert.deepStrictEqual(actualEnvs.length, expectedEnvs.length, 'Number of envs');
    zip(actualEnvs, expectedEnvs).forEach((value) => {
        const [actual, expected] = value;
        actual?.source.sort();
        expected?.source.sort();
        assertEnvEqual(actual, expected);
    });
}

export function assertBasicEnvsEqual(actualEnvs: BasicEnvInfo[], expectedEnvs: BasicEnvInfo[]): void {
    actualEnvs = actualEnvs
        .sort((a, b) => a.executablePath.localeCompare(b.executablePath))
        .map((c) => ({ ...c, executablePath: c.executablePath.toLowerCase() }));
    expectedEnvs = expectedEnvs
        .sort((a, b) => a.executablePath.localeCompare(b.executablePath))
        .map((c) => ({ ...c, executablePath: c.executablePath.toLowerCase() }));
    assert.deepStrictEqual(actualEnvs.length, expectedEnvs.length, 'Number of envs');
    zip(actualEnvs, expectedEnvs).forEach((value) => {
        const [actual, expected] = value;
        if (actual) {
            actual.source = actual.source ?? [];
            actual.searchLocation = actual.searchLocation ?? undefined;
            actual.source.sort();
        }
        if (expected) {
            expected.source = expected.source ?? [];
            expected.searchLocation = expected.searchLocation ?? undefined;
            expected.source.sort();
        }
        assert.deepStrictEqual(actual, expected);
    });
}
