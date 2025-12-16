/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseEditorProvider } from './baseProvider';

/**
 * Rich text editor provider for Markdown files
 */
export class MarkdownEditorProvider extends BaseEditorProvider {
	public static readonly viewType = 'dspace.richEditor.markdown';

	public readonly viewType = MarkdownEditorProvider.viewType;
	protected readonly format = 'markdown' as const;

	/**
	 * Register this provider with VS Code
	 */
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new MarkdownEditorProvider(context);

		return vscode.window.registerCustomEditorProvider(
			MarkdownEditorProvider.viewType,
			provider,
			{
				webviewOptions: {
					retainContextWhenHidden: true,
					enableFindWidget: true
				},
				supportsMultipleEditorsPerDocument: false
			}
		);
	}
}

