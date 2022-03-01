/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/142051

	interface MarkdownString {
		/**
		 * Uri that relative paths are resolved relative to.
		 *
		 * If the `baseUri` ends with `/`, it is considered a directory and relative paths in the markdown are resolved relative to that directory:
		 *
		 * ```ts
		 * const md = new vscode.MarkdownString(`[link](./file.js)`);
		 * md.baseUri = vscode.Uri.file('/path/to/dir/');
		 * // Here 'link' in the rendered markdown resolves to '/path/to/dir/file.js'
		 * ```
		 *
		 * If the `baseUri` is a file, relative paths in the markdown are resolved relative to the parent dir of that file:
		 *
		 * ```ts
		 * const md = new vscode.MarkdownString(`[link](./file.js)`);
		 * md.baseUri = vscode.Uri.file('/path/to/otherFile.js');
		 * // Here 'link' in the rendered markdown resolves to '/path/to/file.js'
		 * ```
		 */
		baseUri?: Uri;
	}
}
