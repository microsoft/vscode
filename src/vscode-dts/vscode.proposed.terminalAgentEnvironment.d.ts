/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface EnvironmentVariableMutatorOptions {
		/**
		 * Also apply this mutator to the shells that agents (for example a Copilot agent host
		 * session) create to run commands. Defaults to false.
		 *
		 * Only `PATH` mutators of the {@link EnvironmentVariableCollection.prepend prepend} and
		 * {@link EnvironmentVariableCollection.append append} types that are not scoped to a
		 * workspace folder are supported. Their values are split on the platform's path delimiter
		 * and only absolute directories are applied; all other mutators are ignored for agent
		 * shells.
		 */
		applyToAgentTerminals?: boolean;
	}
}
