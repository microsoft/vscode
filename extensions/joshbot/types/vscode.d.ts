/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface ExtensionContext {
		subscriptions: { dispose(): any }[];
	}

	export namespace window {
		export function showInformationMessage(message: string): Thenable<string>;
	}

	export namespace commands {
		export function registerCommand(command: string, callback: (...args: any[]) => any): { dispose(): any };
	}
}
