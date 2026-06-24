/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface LanguageModelProxy extends Disposable {
		readonly uri: Uri;
		readonly key: string;
	}

	export namespace lm {
		/**
		 * Returns false if
		 * - Copilot Chat extension is not installed
		 * - Copilot Chat has not finished activating or finished auth
		 * - The user is not logged in, or isn't the right SKU, with expected model access
		 */
		export const isModelProxyAvailable: boolean;

		/**
		 * Fired when isModelProxyAvailable changes.
		 */
		export const onDidChangeModelProxyAvailability: Event<void>;

		/**
		 * Throws if the server fails to start for some reason, or something else goes wrong.
		 */
		export function getModelProxy(): Thenable<LanguageModelProxy>;
	}
}
