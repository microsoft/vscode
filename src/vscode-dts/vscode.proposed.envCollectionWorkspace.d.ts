/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/182069

	// export interface ExtensionContext {
	// 	/**
	// 	 * Gets the extension's environment variable collection for this workspace, enabling changes
	// 	 * to be applied to terminal environment variables.
	// 	 *
	// 	 * @param scope The scope to which the environment variable collection applies to.
	// 	 */
	// 	readonly environmentVariableCollection: EnvironmentVariableCollection & { getScopedEnvironmentVariableCollection(scope: EnvironmentVariableScope): EnvironmentVariableCollection };
	// }

	export type EnvironmentVariableScope = {
		/**
		* Any specific workspace folder to get collection for. If unspecified, collection applicable to all workspace folders is returned.
		*/
		workspaceFolder?: WorkspaceFolder;
	};

	export interface EnvironmentVariableCollection extends Iterable<[variable: string, mutator: EnvironmentVariableMutator]> {
		/**
		 * A description for the environment variable collection, this will be used to describe the
		 * changes in the UI.
		 */
		description: string | MarkdownString | undefined;
	}
}
