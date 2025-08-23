// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import { ExecutionResult, ShellOptions } from '../../../../client/common/process/types';
import * as externalDependencies from '../../../../client/pythonEnvironments/common/externalDependencies';
import { Hatch } from '../../../../client/pythonEnvironments/common/environmentManagers/hatch';
import { TEST_LAYOUT_ROOT } from '../commonTestConstants';

export type HatchCommand = { cmd: 'env show --json' } | { cmd: 'env find'; env: string } | { cmd: null };

export function hatchCommand(args: string[]): HatchCommand {
    if (args.length < 2) {
        return { cmd: null };
    }
    if (args[0] === 'env' && args[1] === 'show' && args[2] === '--json') {
        return { cmd: 'env show --json' };
    }
    if (args[0] === 'env' && args[1] === 'find') {
        return { cmd: 'env find', env: args[2] };
    }
    return { cmd: null };
}

interface VerifyOptions {
    path?: boolean;
    cwd?: string;
}

export function makeExecHandler(venvDirs: Record<string, string>, verify: VerifyOptions = {}) {
    return async (file: string, args: string[], options: ShellOptions): Promise<ExecutionResult<string>> => {
        if (verify.path && file !== 'hatch') {
            throw new Error('Command failed');
        }
        if (verify.cwd) {
            const cwd = typeof options.cwd === 'string' ? options.cwd : options.cwd?.toString();
            if (!cwd || !externalDependencies.arePathsSame(cwd, verify.cwd)) {
                throw new Error('Command failed');
            }
        }
        const cmd = hatchCommand(args);
        if (cmd.cmd === 'env show --json') {
            const envs = Object.fromEntries(Object.keys(venvDirs).map((name) => [name, { type: 'virtual' }]));
            return { stdout: JSON.stringify(envs) };
        }
        if (cmd.cmd === 'env find' && cmd.env in venvDirs) {
            return { stdout: venvDirs[cmd.env] };
        }
        throw new Error('Command failed');
    };
}

const testHatchDir = path.join(TEST_LAYOUT_ROOT, 'hatch');
// This is usually in <data-dir>/hatch, e.g. `~/.local/share/hatch`
const hatchEnvsDir = path.join(testHatchDir, 'env/virtual/python');
export const projectDirs = {
    project1: path.join(testHatchDir, 'project1'),
    project2: path.join(testHatchDir, 'project2'),
};
export const venvDirs = {
    project1: { default: path.join(hatchEnvsDir, 'cK2g6fIm/project1') },
    project2: {
        default: path.join(hatchEnvsDir, 'q4In3tK-/project2'),
        test: path.join(hatchEnvsDir, 'q4In3tK-/test'),
    },
};

suite('Hatch binary is located correctly', async () => {
    let exec: sinon.SinonStub;
    let getPythonSetting: sinon.SinonStub;

    setup(() => {
        getPythonSetting = sinon.stub(externalDependencies, 'getPythonSetting');
        exec = sinon.stub(externalDependencies, 'exec');
    });

    teardown(() => {
        sinon.restore();
    });

    const testPath = async (verify = true) => {
        // If `verify` is false, don’t verify that the command has been called with that path
        exec.callsFake(
            makeExecHandler(venvDirs.project1, verify ? { path: true, cwd: projectDirs.project1 } : undefined),
        );
        const hatch = await Hatch.getHatch(projectDirs.project1);
        expect(hatch?.command).to.equal('hatch');
    };

    test('Use Hatch on PATH if available', () => testPath());

    test('Return undefined if Hatch cannot be found', async () => {
        getPythonSetting.returns('hatch');
        exec.callsFake((_file: string, _args: string[], _options: ShellOptions) =>
            Promise.reject(new Error('Command failed')),
        );
        const hatch = await Hatch.getHatch(projectDirs.project1);
        expect(hatch?.command).to.equal(undefined);
    });
});
