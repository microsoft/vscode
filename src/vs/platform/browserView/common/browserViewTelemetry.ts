/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../telemetry/common/telemetry.js';

/** Source of an Integrated Browser open event. */
export type IntegratedBrowserOpenSource =
	/** Created via CDP, such as by the agent using Playwright tools. */
	| 'cdpCreated'
	/** Opened via the "Open Integrated Browser" command without a URL argument.
	 * This typically means the user ran the command manually from the Command Palette. */
	| 'commandWithoutUrl'
	/** Opened via the "Open Integrated Browser" command with a URL argument.
	 * This typically means another extension or component invoked the command programmatically. */
	| 'commandWithUrl'
	/** Opened via the "New Tab" command from an existing tab. */
	| 'newTabCommand'
	/** Opened via the localhost link opener when the `workbench.browser.openLocalhostLinks` setting
	 * is enabled. This happens when clicking localhost links from the terminal, chat, or other sources. */
	| 'localhostLinkOpener'
	/** Opened when clicking a link inside the Integrated Browser that opens in a new focused editor
	 * (e.g., links with target="_blank"). */
	| 'browserLinkForeground'
	/** Opened when clicking a link inside the Integrated Browser that opens in a new background editor
	 * (e.g., Ctrl/Cmd+click). */
	| 'browserLinkBackground'
	/** Opened when clicking a link inside the Integrated Browser that opens in a new window
	 * (e.g., Shift+click). */
	| 'browserLinkNewWindow'
	/** Opened when the user copies a browser editor to a new window via "Copy into New Window". */
	| 'copyToNewWindow';

type IntegratedBrowserOpenEvent = {
	source: IntegratedBrowserOpenSource;
};

type IntegratedBrowserOpenClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the Integrated Browser was opened' };
	owner: 'jruales';
	comment: 'Tracks how users open the Integrated Browser';
};

export function logBrowserOpen(telemetryService: ITelemetryService, source: IntegratedBrowserOpenSource): void {
	telemetryService.publicLog2<IntegratedBrowserOpenEvent, IntegratedBrowserOpenClassification>(
		'integratedBrowser.open',
		{ source }
	);
}
