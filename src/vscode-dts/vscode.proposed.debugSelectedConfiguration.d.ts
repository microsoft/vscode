/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface SelectedDebugConfiguration {
		name: string;
	}

	export namespace debug {
		/**
		 * The debug configuration, which is currently selected by the user.
		 */
		export const selectedConfiguration: SelectedDebugConfiguration | undefined;

		/**
		 * An {@link Event} that is emitted when the set of breakpoints is added, removed, or changed.
		 */
		export const onDidChangeSelectedConfiguration: Event<void>;

		/**
		 * Change selected debug configuration by name. This will also fire a 'onDidChangeConfiguration' event.
		 * If the name of new configuration cannot be found, the selected configuration stays unchanged.
		 *
		 * @param name Name of new debug configuration
		 */
		export function setSelectedConfiguration(name: string): void;
	}
}
