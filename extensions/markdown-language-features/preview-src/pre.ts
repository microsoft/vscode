/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CspAlerter } from './csp';
import { StyleLoadingMonitor } from './loading';
import { SettingsManager } from './settings';
import { CodeBlockManager } from './code';

declare global {
	interface Window {
		cspAlerter: CspAlerter;
		styleLoadingMonitor: StyleLoadingMonitor;
		codeBlockManager: CodeBlockManager;
	}
}

const settingsManager = new SettingsManager();
window.cspAlerter = new CspAlerter(settingsManager);
window.styleLoadingMonitor = new StyleLoadingMonitor();
window.codeBlockManager = new CodeBlockManager(settingsManager.settings);
