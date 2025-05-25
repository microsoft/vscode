/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace commands {

		/**
		 * TODO
		 */
		export function conditionallyExecuteCommand<T>(when: string, id: string, ...args: string[]): Thenable<{ executed: boolean; result: T | undefined }>;
	}
}
