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
		/**
		 * Sets a description for the environment variable collection, this will be used to describe the changes in the UI.
		 * @param description A description for the environment variable collection.
		 * @param scope Specific scope to which this description applies to.
		 */
		setDescription(description: string | MarkdownString | undefined, scope?: EnvironmentVariableScope): void;
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
