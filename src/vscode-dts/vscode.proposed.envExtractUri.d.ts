/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/243615

	export namespace env {
		export function isTrustedExternalUris(uri: Uri[]): boolean[];
		export function extractExternalUris(uris: Uri[]): Thenable<string[]>;
	}
}
