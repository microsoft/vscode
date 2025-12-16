/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseEditorProvider } from './baseProvider';

/**
 * Rich text editor provider for Typst files
 */
export class TypstEditorProvider extends BaseEditorProvider {
	public static readonly viewType = 'dspace.richEditor.typst';

	public readonly viewType = TypstEditorProvider.viewType;
	protected readonly format = 'typst' as const;

	/**
	 * Register this provider with VS Code
	 */
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new TypstEditorProvider(context);

		return vscode.window.registerCustomEditorProvider(
			TypstEditorProvider.viewType,
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

