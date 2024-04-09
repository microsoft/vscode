/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	// @meganrogge https://github.com/microsoft/vscode/issues/209855
	export interface AccessibilityHelpProvider {
		/**
		 * The id of the provider.
		 */
		id: string;

		/**
		 * This will show the dialog when this context value is true.
		 */
		contextValue: string;

		/**
		 * Provide the content of the dialog as a markdown string.
		*/
		provideContent(token: CancellationToken): string;

		/**
		 * This will be called when the dialog is closed.
		 */
		resolveOnClose(token: CancellationToken): void;
	}

	export namespace window {

		/**
		 * Registers an accessibility help provider.
		 *
		 * @param provider An accessibility help provider.
		 */
		export function registerAccessibilityHelpProvider(provider: AccessibilityHelpProvider): Disposable;
	}
}
