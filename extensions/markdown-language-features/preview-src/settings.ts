/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface PreviewSettings {
	readonly source: string;
	readonly line?: number;
	readonly fragment?: string;
	readonly selectedLine?: number;

	readonly scrollPreviewWithEditor?: boolean;
	readonly scrollEditorWithPreview: boolean;
	readonly disableSecurityWarnings: boolean;
	readonly doubleClickToSwitchToEditor: boolean;
	readonly webviewResourceRoot: string;
}

export function getData<T = {}>(key: string): T {
	const element = document.getElementById('vscode-markdown-preview-data');
	if (element) {
		const data = element.getAttribute(key);
		if (data) {
			return JSON.parse(data);
		}
	}

	throw new Error(`Could not load data for ${key}`);
}

export class SettingsManager {
	private _settings: PreviewSettings = getData('data-settings');

	public get settings(): PreviewSettings {
		return this._settings;
	}

	public updateSettings(newSettings: PreviewSettings) {
		this._settings = newSettings;
	}
}
