/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CspAlerter } from './csp';
import { StyleLoadingMonitor } from './loading';
import { SettingsManager } from './settings';

declare global {
	interface Window {
		cspAlerter: CspAlerter;
		styleLoadingMonitor: StyleLoadingMonitor;
	}
}

window.cspAlerter = new CspAlerter(new SettingsManager());
window.styleLoadingMonitor = new StyleLoadingMonitor();
