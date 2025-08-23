// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { traceError, traceVerbose } from '../../logging';
import { Conda, CondaEnvironmentInfo } from '../../pythonEnvironments/common/environmentManagers/conda';
import { buildPythonExecInfo, PythonExecInfo } from '../../pythonEnvironments/exec';
import { InterpreterInformation } from '../../pythonEnvironments/info';
import { getExecutablePath } from '../../pythonEnvironments/info/executable';
import { getInterpreterInfo } from '../../pythonEnvironments/info/interpreter';
import { isTestExecution } from '../constants';
import { IFileSystem } from '../platform/types';
import * as internalPython from './internal/python';
import { ExecutionResult, IProcessService, IPythonEnvironment, ShellOptions, SpawnOptions } from './types';
import { PixiEnvironmentInfo } from '../../pythonEnvironments/common/environmentManagers/pixi';

const cachedExecutablePath: Map<string, Promise<string | undefined>> = new Map<string, Promise<string | undefined>>();

class PythonEnvironment implements IPythonEnvironment {
    private cachedInterpreterInformation: InterpreterInformation | undefined | null = null;

    constructor(
        protected readonly pythonPath: string,
        // "deps" is the externally defined functionality used by the class.
        protected readonly deps: {
            getPythonArgv(python: string): string[];
            getObservablePythonArgv(python: string): string[];
            isValidExecutable(python: string): Promise<boolean>;
            // from ProcessService:
            exec(file: string, args: string[]): Promise<ExecutionResult<string>>;
            shellExec(command: string, options?: ShellOptions): Promise<ExecutionResult<string>>;
        },
    ) {}

    public getExecutionInfo(pythonArgs: string[] = [], pythonExecutable?: string): PythonExecInfo {
        const python = this.deps.getPythonArgv(this.pythonPath);
        return buildPythonExecInfo(python, pythonArgs, pythonExecutable);
    }
    public getExecutionObservableInfo(pythonArgs: string[] = [], pythonExecutable?: string): PythonExecInfo {
        const python = this.deps.getObservablePythonArgv(this.pythonPath);
        return buildPythonExecInfo(python, pythonArgs, pythonExecutable);
    }

    public async getInterpreterInformation(): Promise<InterpreterInformation | undefined> {
        if (this.cachedInterpreterInformation === null) {
            this.cachedInterpreterInformation = await this.getInterpreterInformationImpl();
        }
        return this.cachedInterpreterInformation;
    }

    public async getExecutablePath(): Promise<string | undefined> {
        // If we've passed the python file, then return the file.
        // This is because on mac if using the interpreter /usr/bin/python2.7 we can get a different value for the path
        if (await this.deps.isValidExecutable(this.pythonPath)) {
            return this.pythonPath;
        }
        const result = cachedExecutablePath.get(this.pythonPath);
        if (result !== undefined && !isTestExecution()) {
            // Another call for this environment has already been made, return its result
            return result;
        }
        const python = this.getExecutionInfo();
        const promise = getExecutablePath(python, this.deps.shellExec);
        cachedExecutablePath.set(this.pythonPath, promise);
        return promise;
    }

    public async getModuleVersion(moduleName: string): Promise<string | undefined> {
        const [args, parse] = internalPython.getModuleVersion(moduleName);
        const info = this.getExecutionInfo(args);
        let data: ExecutionResult<string>;
        try {
            data = await this.deps.exec(info.command, info.args);
        } catch (ex) {
            traceVerbose(`Error when getting version of module ${moduleName}`, ex);
            return undefined;
        }
        return parse(data.stdout);
    }

    public async isModuleInstalled(moduleName: string): Promise<boolean> {
        // prettier-ignore
        const [args,] = internalPython.isModuleInstalled(moduleName);
        const info = this.getExecutionInfo(args);
        try {
            await this.deps.exec(info.command, info.args);
        } catch (ex) {
            traceVerbose(`Error when checking if module is installed ${moduleName}`, ex);
            return false;
        }
        return true;
    }

    private async getInterpreterInformationImpl(): Promise<InterpreterInformation | undefined> {
        try {
            const python = this.getExecutionInfo();
            return await getInterpreterInfo(python, this.deps.shellExec, { verbose: traceVerbose, error: traceError });
        } catch (ex) {
            traceError(`Failed to get interpreter information for '${this.pythonPath}'`, ex);
        }
    }
}

function createDeps(
    isValidExecutable: (filename: string) => Promise<boolean>,
    pythonArgv: string[] | undefined,
    observablePythonArgv: string[] | undefined,
    // from ProcessService:
    exec: (file: string, args: string[], options?: SpawnOptions) => Promise<ExecutionResult<string>>,
    shellExec: (command: string, options?: ShellOptions) => Promise<ExecutionResult<string>>,
) {
    return {
        getPythonArgv: (python: string) => {
            if (path.basename(python) === python) {
                // Say when python is `py -3.8` or `conda run python`
                pythonArgv = python.split(' ');
            }
            return pythonArgv || [python];
        },
        getObservablePythonArgv: (python: string) => {
            if (path.basename(python) === python) {
                observablePythonArgv = python.split(' ');
            }
            return observablePythonArgv || [python];
        },
        isValidExecutable,
        exec: async (cmd: string, args: string[]) => exec(cmd, args, { throwOnStdErr: true }),
        shellExec,
    };
}

export function createPythonEnv(
    pythonPath: string,
    // These are used to generate the deps.
    procs: IProcessService,
    fs: IFileSystem,
): PythonEnvironment {
    const deps = createDeps(
        async (filename) => fs.pathExists(filename),
        // We use the default: [pythonPath].
        undefined,
        undefined,
        (file, args, opts) => procs.exec(file, args, opts),
        (command, opts) => procs.shellExec(command, opts),
    );
    return new PythonEnvironment(pythonPath, deps);
}

export async function createCondaEnv(
    condaInfo: CondaEnvironmentInfo,
    // These are used to generate the deps.
    procs: IProcessService,
    fs: IFileSystem,
): Promise<PythonEnvironment | undefined> {
    const conda = await Conda.getConda();
    const pythonArgv = await conda?.getRunPythonArgs({ name: condaInfo.name, prefix: condaInfo.path });
    if (!pythonArgv) {
        return undefined;
    }
    const deps = createDeps(
        async (filename) => fs.pathExists(filename),
        pythonArgv,
        pythonArgv,
        (file, args, opts) => procs.exec(file, args, opts),
        (command, opts) => procs.shellExec(command, opts),
    );
    const interpreterPath = await conda?.getInterpreterPathForEnvironment({
        name: condaInfo.name,
        prefix: condaInfo.path,
    });
    if (!interpreterPath) {
        return undefined;
    }
    return new PythonEnvironment(interpreterPath, deps);
}

export async function createPixiEnv(
    pixiEnv: PixiEnvironmentInfo,
    // These are used to generate the deps.
    procs: IProcessService,
    fs: IFileSystem,
): Promise<PythonEnvironment | undefined> {
    const pythonArgv = pixiEnv.pixi.getRunPythonArgs(pixiEnv.manifestPath, pixiEnv.envName);
    const deps = createDeps(
        async (filename) => fs.pathExists(filename),
        pythonArgv,
        pythonArgv,
        (file, args, opts) => procs.exec(file, args, opts),
        (command, opts) => procs.shellExec(command, opts),
    );
    return new PythonEnvironment(pixiEnv.interpreterPath, deps);
}

export function createMicrosoftStoreEnv(
    pythonPath: string,
    // These are used to generate the deps.
    procs: IProcessService,
): PythonEnvironment {
    const deps = createDeps(
        /**
         * With microsoft store python apps, we have generally use the
         * symlinked python executable.  The actual file is not accessible
         * by the user due to permission issues (& rest of exension fails
         * when using that executable).  Hence lets not resolve the
         * executable using sys.executable for microsoft store python
         * interpreters.
         */
        async (_f: string) => true,
        // We use the default: [pythonPath].
        undefined,
        undefined,
        (file, args, opts) => procs.exec(file, args, opts),
        (command, opts) => procs.shellExec(command, opts),
    );
    return new PythonEnvironment(pythonPath, deps);
}
