/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/171175

	export interface Terminal {
		/**
		 * Carries terminal description, which appears to the right of the title. This will be
		 * added to the `${extension}` variable in the terminal tab title and description
		 * settings.
		 */
		description: string;
	}

	export interface TerminalOptions {
		/**
		 * Carries terminal description, which appears to the right of the title. This will be
		 * added to the `${extension}` variable in the terminal tab title and description
		 * settings.
		 */
		description: string;
	}
}
