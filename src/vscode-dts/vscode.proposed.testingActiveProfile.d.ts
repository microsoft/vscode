/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/193160 @connor4312

declare module 'vscode' {
	export interface TestRunProfile {
		/**
		 * Whether this profile is currently selected as a default by the user
		 */
		readonly isSelected: boolean;

		/**
		 * Fired when a user has changed whether this is a selected profile. The
		 * event contains the new value of {@link isSelected}
		 */
		onDidChangeSelected: Event<boolean>;
	}
}
