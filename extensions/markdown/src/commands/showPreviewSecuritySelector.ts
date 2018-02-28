/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { PreviewSecuritySelector } from '../security';

export class ShowPreviewSecuritySelectorCommand implements Command {
	public readonly id = 'markdown.showPreviewSecuritySelector';

	public constructor(
		private readonly previewSecuritySelector: PreviewSecuritySelector
	) { }

	public execute(resource: string | undefined) {
		if (resource) {
			const source = vscode.Uri.parse(resource).query;
			this.previewSecuritySelector.showSecutitySelectorForResource(vscode.Uri.parse(source));
		} else {
			if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'markdown') {
				this.previewSecuritySelector.showSecutitySelectorForResource(vscode.window.activeTextEditor.document.uri);
			}
		}
	}
}