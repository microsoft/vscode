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

let cachedSettings: PreviewSettings | undefined = undefined;

export function getData(key: string): PreviewSettings {
	const element = document.getElementById('vscode-markdown-preview-data');
	if (element) {
		const data = element.getAttribute(key);
		if (data) {
			return JSON.parse(data);
		}
	}

	throw new Error(`Could not load data for ${key}`);
}

export function getSettings(): PreviewSettings {
	if (cachedSettings) {
		return cachedSettings;
	}

	cachedSettings = getData('data-settings');
	if (cachedSettings) {
		return cachedSettings;
	}

	throw new Error('Could not load settings');
}
