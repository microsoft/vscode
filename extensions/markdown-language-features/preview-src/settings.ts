/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DiffScrollSyncData, MarkdownPreviewLineChanges } from '../types/previewMessaging';

export interface PreviewSettings {
	readonly source: string;
	readonly line?: number;
	readonly fragment?: string;
	readonly selectedLine?: number;
	readonly lineChanges?: MarkdownPreviewLineChanges;
	readonly diffScrollSync?: DiffScrollSyncData;

	readonly scrollPreviewWithEditor?: boolean;
	readonly scrollEditorWithPreview: boolean;
	readonly disableSecurityWarnings: boolean;
	readonly doubleClickToSwitchToEditor: boolean;
	readonly webviewResourceRoot: string;
}

export function getRawData(key: string): string {
	const element = document.getElementById('vscode-markdown-preview-data');
	if (element) {
		const data = element.getAttribute(key);
		if (data) {
			return data;
		}
	}

	throw new Error(`Could not load data for ${key}`);
}

export function getData<T = {}>(key: string): T {
	return JSON.parse(getRawData(key));
}

export class SettingsManager {
	#settings: PreviewSettings = getData('data-settings');

	public get settings(): PreviewSettings {
		return this.#settings;
	}

	public updateSettings(newSettings: PreviewSettings) {
		this.#settings = newSettings;
	}
}
