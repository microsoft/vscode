/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/171173

	export interface EnvironmentVariableMutator {
		readonly type: EnvironmentVariableMutatorType;
		readonly value: string;
		readonly scope: EnvironmentVariableScope | undefined;
	}

	export interface EnvironmentVariableCollection extends Iterable<[variable: string, mutator: EnvironmentVariableMutator]> {
		replace(variable: string, value: string, scope?: EnvironmentVariableScope): void;
		append(variable: string, value: string, scope?: EnvironmentVariableScope): void;
		prepend(variable: string, value: string, scope?: EnvironmentVariableScope): void;
		get(variable: string, scope?: EnvironmentVariableScope): EnvironmentVariableMutator | undefined;
		delete(variable: string, scope?: EnvironmentVariableScope): void;
		clear(scope?: EnvironmentVariableScope): void;
	}

	export type EnvironmentVariableScope = {
		/**
		 * The workspace folder to which this collection applies to. If unspecified, collection applies to all workspace folders.
		 */
		workspaceFolder?: WorkspaceFolder;
	};
}
