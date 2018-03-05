/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface PreviewSettings {
	source: string;
	line: number;
	lineCount: number;
	scrollPreviewWithEditor: boolean;
	scrollEditorWithPreview: boolean;
	disableSecurityWarnings: boolean;
	doubleClickToSwitchToEditor: boolean;
}

export function getSettings(): PreviewSettings {
	return JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-settings'));
}
