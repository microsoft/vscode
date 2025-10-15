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
		 * Throws if
		 * - The user is not logged in, or isn't the right SKU, with expected model access
		 * - The server fails to start for some reason
		 */
		export function getModelProxy(): Thenable<LanguageModelProxy>;
	}
}
