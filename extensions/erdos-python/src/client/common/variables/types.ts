// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Event, Uri } from 'vscode';

export type EnvironmentVariables = Object & Record<string, string | undefined>;

export const IEnvironmentVariablesService = Symbol('IEnvironmentVariablesService');

export interface IEnvironmentVariablesService {
    parseFile(filePath?: string, baseVars?: EnvironmentVariables): Promise<EnvironmentVariables | undefined>;
    parseFileSync(filePath?: string, baseVars?: EnvironmentVariables): EnvironmentVariables | undefined;
    mergeVariables(
        source: EnvironmentVariables,
        target: EnvironmentVariables,
        options?: { overwrite?: boolean; mergeAll?: boolean },
    ): void;
    appendPythonPath(vars: EnvironmentVariables, ...pythonPaths: string[]): void;
    appendPath(vars: EnvironmentVariables, ...paths: string[]): void;
}

/**
 * An interface for a JavaScript object that
 * acts as a dictionary. The keys are strings.
 */
export interface IStringDictionary<V> {
    [name: string]: V;
}

export interface ISystemVariables {
    resolve(value: string): string;
    resolve(value: string[]): string[];
    resolve(value: IStringDictionary<string>): IStringDictionary<string>;
    resolve(value: IStringDictionary<string[]>): IStringDictionary<string[]>;
    resolve(value: IStringDictionary<IStringDictionary<string>>): IStringDictionary<IStringDictionary<string>>;
    resolveAny<T>(value: T): T;

    [key: string]: any;
}

export const IEnvironmentVariablesProvider = Symbol('IEnvironmentVariablesProvider');

export interface IEnvironmentVariablesProvider {
    onDidEnvironmentVariablesChange: Event<Uri | undefined>;
    getEnvironmentVariables(resource?: Uri): Promise<EnvironmentVariables>;
    getEnvironmentVariablesSync(resource?: Uri): EnvironmentVariables;
}
