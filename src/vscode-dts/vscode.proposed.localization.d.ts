/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace l10n {
		/**
		 * A string that can be pulled out of a localization bundle if it exists.
		 */
		export function t(message: string, ...args: any[]): string;
		/**
		 * A string that can be pulled out of a localization bundle if it exists.
		 */
		export function t(options: { message: string; args?: any[]; comment: string[] }): string;
		/**
		 * The bundle of localized strings that have been loaded for the extension.
		 */
		export const bundle: { [key: string]: string };
		/**
		 * The URI of the localization bundle that has been loaded for the extension.
		 */
		export const uri: Uri | undefined;
	}
}
