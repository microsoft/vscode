/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/171173

	// export interface ExtensionContext {
	// 	/**
	// 	 * Gets the extension's global environment variable collection for this workspace, enabling changes to be
	// 	 * applied to terminal environment variables.
	// 	 */
	// 	readonly environmentVariableCollection: GlobalEnvironmentVariableCollection;
	// }

	export interface GlobalEnvironmentVariableCollection extends EnvironmentVariableCollection {
		/**
		 * Gets scope-specific environment variable collection for the extension. This enables alterations to
		 * terminal environment variables solely within the designated scope, and is applied in addition to (and
		 * after) the global collection.
		 *
		 * Each object obtained through this method is isolated and does not impact objects for other scopes,
		 * including the global collection.
		 *
		 * @param scope The scope to which the environment variable collection applies to.
		 *
		 * If a scope parameter is omitted, collection applicable to all relevant scopes for that parameter is
		 * returned. For instance, if the 'workspaceFolder' parameter is not specified, the collection that applies
		 * across all workspace folders will be returned.
		 */
		getScoped(scope: EnvironmentVariableScope): EnvironmentVariableCollection;
	}

	export type EnvironmentVariableScope = {
		/**
		 * Any specific workspace folder to get collection for. If unspecified, collection applicable to all workspace folders is returned.
		 */
		workspaceFolder?: WorkspaceFolder;
	};
}
