// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { pathExistsSync, readFileSync } from '../platform/fs-paths';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import { traceError } from '../../logging';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IFileSystem } from '../platform/types';
import { IPathUtils } from '../types';
import { EnvironmentVariables, IEnvironmentVariablesService } from './types';
import { normCase } from '../platform/fs-paths';

@injectable()
export class EnvironmentVariablesService implements IEnvironmentVariablesService {
    private _pathVariable?: 'Path' | 'PATH';
    constructor(
        // We only use a small portion of either of these interfaces.
        @inject(IPathUtils) private readonly pathUtils: IPathUtils,
        @inject(IFileSystem) private readonly fs: IFileSystem,
    ) {}

    public async parseFile(
        filePath?: string,
        baseVars?: EnvironmentVariables,
    ): Promise<EnvironmentVariables | undefined> {
        if (!filePath || !(await this.fs.pathExists(filePath))) {
            return;
        }
        const contents = await this.fs.readFile(filePath).catch((ex) => {
            traceError('Custom .env is likely not pointing to a valid file', ex);
            return undefined;
        });
        if (!contents) {
            return;
        }
        return parseEnvFile(contents, baseVars);
    }

    public parseFileSync(filePath?: string, baseVars?: EnvironmentVariables): EnvironmentVariables | undefined {
        if (!filePath || !pathExistsSync(filePath)) {
            return;
        }
        let contents: string | undefined;
        try {
            contents = readFileSync(filePath, { encoding: 'utf8' });
        } catch (ex) {
            traceError('Custom .env is likely not pointing to a valid file', ex);
        }
        if (!contents) {
            return;
        }
        return parseEnvFile(contents, baseVars);
    }

    public mergeVariables(
        source: EnvironmentVariables,
        target: EnvironmentVariables,
        options?: { overwrite?: boolean; mergeAll?: boolean },
    ) {
        if (!target) {
            return;
        }
        const reference = target;
        target = normCaseKeys(target);
        source = normCaseKeys(source);
        const settingsNotToMerge = ['PYTHONPATH', this.pathVariable];
        Object.keys(source).forEach((setting) => {
            if (!options?.mergeAll && settingsNotToMerge.indexOf(setting) >= 0) {
                return;
            }
            if (target[setting] === undefined || options?.overwrite) {
                target[setting] = source[setting];
            }
        });
        restoreKeys(target);
        matchTarget(reference, target);
    }

    public appendPythonPath(vars: EnvironmentVariables, ...pythonPaths: string[]) {
        return this.appendPaths(vars, 'PYTHONPATH', ...pythonPaths);
    }

    public appendPath(vars: EnvironmentVariables, ...paths: string[]) {
        return this.appendPaths(vars, this.pathVariable, ...paths);
    }

    private get pathVariable(): string {
        if (!this._pathVariable) {
            this._pathVariable = this.pathUtils.getPathVariableName();
        }
        return normCase(this._pathVariable)!;
    }

    private appendPaths(vars: EnvironmentVariables, variableName: string, ...pathsToAppend: string[]) {
        const reference = vars;
        vars = normCaseKeys(vars);
        variableName = normCase(variableName);
        vars = this._appendPaths(vars, variableName, ...pathsToAppend);
        restoreKeys(vars);
        matchTarget(reference, vars);
        return vars;
    }

    private _appendPaths(vars: EnvironmentVariables, variableName: string, ...pathsToAppend: string[]) {
        const valueToAppend = pathsToAppend
            .filter((item) => typeof item === 'string' && item.trim().length > 0)
            .map((item) => item.trim())
            .join(path.delimiter);
        if (valueToAppend.length === 0) {
            return vars;
        }

        const variable = vars ? vars[variableName] : undefined;
        if (variable && typeof variable === 'string' && variable.length > 0) {
            vars[variableName] = variable + path.delimiter + valueToAppend;
        } else {
            vars[variableName] = valueToAppend;
        }
        return vars;
    }
}

export function parseEnvFile(lines: string | Buffer, baseVars?: EnvironmentVariables): EnvironmentVariables {
    const globalVars = baseVars ? baseVars : {};
    const vars: EnvironmentVariables = {};
    lines
        .toString()
        .split('\n')
        .forEach((line, _idx) => {
            const [name, value] = parseEnvLine(line);
            if (name === '') {
                return;
            }
            vars[name] = substituteEnvVars(value, vars, globalVars);
        });
    return vars;
}

function parseEnvLine(line: string): [string, string] {
    // Most of the following is an adaptation of the dotenv code:
    //   https://github.com/motdotla/dotenv/blob/master/lib/main.js#L32
    // We don't use dotenv here because it loses ordering, which is
    // significant for substitution.
    const match = line.match(/^\s*(_*[a-zA-Z]\w*)\s*=\s*(.*?)?\s*$/);
    if (!match) {
        return ['', ''];
    }

    const name = match[1];
    let value = match[2];
    if (value && value !== '') {
        if (value[0] === "'" && value[value.length - 1] === "'") {
            value = value.substring(1, value.length - 1);
            value = value.replace(/\\n/gm, '\n');
        } else if (value[0] === '"' && value[value.length - 1] === '"') {
            value = value.substring(1, value.length - 1);
            value = value.replace(/\\n/gm, '\n');
        }
    } else {
        value = '';
    }

    return [name, value];
}

const SUBST_REGEX = /\${([a-zA-Z]\w*)?([^}\w].*)?}/g;

function substituteEnvVars(
    value: string,
    localVars: EnvironmentVariables,
    globalVars: EnvironmentVariables,
    missing = '',
): string {
    // Substitution here is inspired a little by dotenv-expand:
    //   https://github.com/motdotla/dotenv-expand/blob/master/lib/main.js

    let invalid = false;
    let replacement = value;
    replacement = replacement.replace(SUBST_REGEX, (match, substName, bogus, offset, orig) => {
        if (offset > 0 && orig[offset - 1] === '\\') {
            return match;
        }
        if ((bogus && bogus !== '') || !substName || substName === '') {
            invalid = true;
            return match;
        }
        return localVars[substName] || globalVars[substName] || missing;
    });
    if (!invalid && replacement !== value) {
        value = replacement;
        sendTelemetryEvent(EventName.ENVFILE_VARIABLE_SUBSTITUTION);
    }

    return value.replace(/\\\$/g, '$');
}

export function normCaseKeys(env: EnvironmentVariables): EnvironmentVariables {
    const normalizedEnv: EnvironmentVariables = {};
    Object.keys(env).forEach((key) => {
        const normalizedKey = normCase(key);
        normalizedEnv[normalizedKey] = env[key];
    });
    return normalizedEnv;
}

export function restoreKeys(env: EnvironmentVariables) {
    const processEnvKeys = Object.keys(process.env);
    processEnvKeys.forEach((processEnvKey) => {
        const originalKey = normCase(processEnvKey);
        if (originalKey !== processEnvKey && env[originalKey] !== undefined) {
            env[processEnvKey] = env[originalKey];
            delete env[originalKey];
        }
    });
}

export function matchTarget(reference: EnvironmentVariables, target: EnvironmentVariables): void {
    Object.keys(reference).forEach((key) => {
        if (target.hasOwnProperty(key)) {
            reference[key] = target[key];
        } else {
            delete reference[key];
        }
    });

    // Add any new keys from target to reference
    Object.keys(target).forEach((key) => {
        if (!reference.hasOwnProperty(key)) {
            reference[key] = target[key];
        }
    });
}
