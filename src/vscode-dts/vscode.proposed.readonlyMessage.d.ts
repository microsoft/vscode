/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/166971

declare module 'vscode' {

	export namespace workspace {

		export function registerFileSystemProvider(scheme: string, provider: FileSystemProvider, options?: { readonly isCaseSensitive?: boolean; readonly isReadonly?: boolean | MarkdownString }): Disposable;
	}
}
