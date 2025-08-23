// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { ICurrentProcess } from '../../../../common/types';
import { EnvironmentVariables, IEnvironmentVariablesService } from '../../../../common/variables/types';
import { LaunchRequestArguments } from '../../../types';
import { PYTHON_LANGUAGE } from '../../../../common/constants';
import { getActiveTextEditor } from '../../../../common/vscodeApis/windowApis';
import { getSearchPathEnvVarNames } from '../../../../common/utils/exec';

export const IDebugEnvironmentVariablesService = Symbol('IDebugEnvironmentVariablesService');
export interface IDebugEnvironmentVariablesService {
    getEnvironmentVariables(
        args: LaunchRequestArguments,
        baseVars?: EnvironmentVariables,
    ): Promise<EnvironmentVariables>;
}

@injectable()
export class DebugEnvironmentVariablesHelper implements IDebugEnvironmentVariablesService {
    constructor(
        @inject(IEnvironmentVariablesService) private envParser: IEnvironmentVariablesService,
        @inject(ICurrentProcess) private process: ICurrentProcess,
    ) {}

    public async getEnvironmentVariables(
        args: LaunchRequestArguments,
        baseVars?: EnvironmentVariables,
    ): Promise<EnvironmentVariables> {
        const pathVariableName = getSearchPathEnvVarNames()[0];

        // Merge variables from both .env file and env json variables.
        const debugLaunchEnvVars: Record<string, string> =
            args.env && Object.keys(args.env).length > 0
                ? ({ ...args.env } as Record<string, string>)
                : ({} as Record<string, string>);
        const envFileVars = await this.envParser.parseFile(args.envFile, debugLaunchEnvVars);
        const env = envFileVars ? { ...envFileVars } : {};

        // "overwrite: true" to ensure that debug-configuration env variable values
        // take precedence over env file.
        this.envParser.mergeVariables(debugLaunchEnvVars, env, { overwrite: true });
        if (baseVars) {
            this.envParser.mergeVariables(baseVars, env, { mergeAll: true });
        }

        // Append the PYTHONPATH and PATH variables.
        this.envParser.appendPath(
            env,
            debugLaunchEnvVars[pathVariableName] ?? debugLaunchEnvVars[pathVariableName.toUpperCase()],
        );
        this.envParser.appendPythonPath(env, debugLaunchEnvVars.PYTHONPATH);

        if (typeof env[pathVariableName] === 'string' && env[pathVariableName]!.length > 0) {
            // Now merge this path with the current system path.
            // We need to do this to ensure the PATH variable always has the system PATHs as well.
            this.envParser.appendPath(env, this.process.env[pathVariableName]!);
        }
        if (typeof env.PYTHONPATH === 'string' && env.PYTHONPATH.length > 0) {
            // We didn't have a value for PATH earlier and now we do.
            // Now merge this path with the current system path.
            // We need to do this to ensure the PATH variable always has the system PATHs as well.
            this.envParser.appendPythonPath(env, this.process.env.PYTHONPATH!);
        }

        if (args.console === 'internalConsole') {
            // For debugging, when not using any terminal, then we need to provide all env variables.
            // As we're spawning the process, we need to ensure all env variables are passed.
            // Including those from the current process (i.e. everything, not just custom vars).
            this.envParser.mergeVariables(this.process.env, env);

            if (env[pathVariableName] === undefined && typeof this.process.env[pathVariableName] === 'string') {
                env[pathVariableName] = this.process.env[pathVariableName];
            }
            if (env.PYTHONPATH === undefined && typeof this.process.env.PYTHONPATH === 'string') {
                env.PYTHONPATH = this.process.env.PYTHONPATH;
            }
        }

        if (!env.hasOwnProperty('PYTHONIOENCODING')) {
            env.PYTHONIOENCODING = 'UTF-8';
        }
        if (!env.hasOwnProperty('PYTHONUNBUFFERED')) {
            env.PYTHONUNBUFFERED = '1';
        }

        if (args.gevent) {
            env.GEVENT_SUPPORT = 'True'; // this is read in pydevd_constants.py
        }

        return env;
    }
}

export function getProgram(): string | undefined {
    const activeTextEditor = getActiveTextEditor();
    if (activeTextEditor && activeTextEditor.document.languageId === PYTHON_LANGUAGE) {
        return activeTextEditor.document.fileName;
    }
    return undefined;
}
