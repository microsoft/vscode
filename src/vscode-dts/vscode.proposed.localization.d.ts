/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace l10n {
		export function t(message: string, ...args: string[]): string;
		export function t(options: { message: string; args: string[]; comment: string[] }): string;
		export const bundle: { [key: string]: string };
		export const uri: Uri;
	}
}
