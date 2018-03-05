/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface PreviewSettings {
	source: string;
	line: number;
	lineCount: number;
	scrollPreviewWithEditor?: boolean;
	scrollEditorWithPreview: boolean;
	disableSecurityWarnings: boolean;
	doubleClickToSwitchToEditor: boolean;
}

export function getSettings(): PreviewSettings {
	const element = document.getElementById('vscode-markdown-preview-data');
	if (element) {
		const data = element.getAttribute('data-settings');
		if (data) {
			return JSON.parse(data);
		}
	}
	throw new Error('Could not load settings');
}
