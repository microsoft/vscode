/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/824

	export interface TextDocument {

		readonly encoding: string;

		save(options?: { encoding?: string }): Thenable<boolean>;
	}

	export namespace workspace {
		export function openTextDocument(uri: Uri, options?: { encoding?: string }): Thenable<TextDocument>;
		export function openTextDocument(path: string, options?: { encoding?: string }): Thenable<TextDocument>;
	}
}
