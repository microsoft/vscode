/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../telemetry/common/telemetry.js';

/** Source of an Integrated Browser open event. */
export type IntegratedBrowserOpenSource =
	/** Created via CDP, such as by the agent using Playwright tools. */
	| 'cdpCreated'
	/** Opened via a (non-agentic) chat tool invocation. */
	| 'chatTool'
	/** Opened via the "Open Integrated Browser" command without a URL argument.
	 * This typically means the user ran the command manually from the Command Palette. */
	| 'commandWithoutUrl'
	/** Opened via the "Open Integrated Browser" command with a URL argument.
	 * This typically means another extension or component invoked the command programmatically. */
	| 'commandWithUrl'
	/** Opened via the quick open feature with no initial URL. */
	| 'quickOpenWithoutUrl'
	/** Opened via the quick open feature with an initial URL. */
	| 'quickOpenWithUrl'
	/** Opened via the "New Tab" command from an existing tab. */
	| 'newTabCommand'
	/** Opened via the localhost link opener when the `workbench.browser.openLocalhostLinks` setting
	 * is enabled. This happens when clicking localhost (e.g., `localhost`, `127.0.0.1`, `[::1]`) or all-interfaces
	 * links (e.g., `0.0.0.0`, `[::]`) from the terminal, chat, or other sources. */
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

type RunPlaywrightCodeEvent = {
	pageMethodsCalled: string;
	pageMethodsCalledCount: number;
	pageMethodsCalledTotal: number;
	success: number;
	wasDeferred: number;
	durationMs: number;
	codeLength: number;
	codeLineCount: number;
};

type RunPlaywrightCodeClassification = {
	pageMethodsCalled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'JSON object mapping dotted `page.*` method names to call counts (e.g. `{"click":2,"keyboard.press":5}`), in first-observed order. Names outside the known Playwright API allowlist are bucketed under `other`. Truncated to 100 entries.' };
	pageMethodsCalledCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct `page.*` methods invoked. Full count even when `pageMethodsCalled` is truncated.' };
	pageMethodsCalledTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total method calls including duplicates (sum of all per-method counts).' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: '1 if the code completed without error, 0 otherwise.' };
	wasDeferred: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: '1 if this was a resumed deferred run, 0 otherwise.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock time in ms for this invocation.' };
	codeLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Character length of the supplied code. 0 for resumed deferred calls.' };
	codeLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Line count of the supplied code. 0 for resumed deferred calls.' };
	owner: 'jruales';
	comment: 'Tracks how the run_playwright_code chat tool is exercised so we can identify common patterns that should be promoted to dedicated browser tools.';
};

/** Maximum number of distinct method entries emitted in `pageMethodsCalled`. */
const PAGE_METHODS_MAX_ENTRIES = 100;

/**
 * Log telemetry about a completed run_playwright_code invocation, recording
 * which parts of the Playwright `page` API were used (with per-method call
 * counts) along with success and timing signals.
 */
export function logRunPlaywrightCode(
	telemetryService: ITelemetryService,
	data: {
		pageMethodsCalled: Readonly<Record<string, number>>;
		success: boolean;
		wasDeferred: boolean;
		durationMs: number;
		codeLength: number;
		codeLineCount: number;
	}
): void {
	const entries = Object.entries(data.pageMethodsCalled);
	const total = entries.reduce((sum, [, count]) => sum + count, 0);
	const serialized = JSON.stringify(Object.fromEntries(entries.slice(0, PAGE_METHODS_MAX_ENTRIES)));
	telemetryService.publicLog2<RunPlaywrightCodeEvent, RunPlaywrightCodeClassification>(
		'integratedBrowser.tools.runPlaywrightCode.completed',
		{
			pageMethodsCalled: serialized,
			pageMethodsCalledCount: entries.length,
			pageMethodsCalledTotal: total,
			success: data.success ? 1 : 0,
			wasDeferred: data.wasDeferred ? 1 : 0,
			durationMs: Math.round(data.durationMs),
			codeLength: data.codeLength,
			codeLineCount: data.codeLineCount,
		}
	);
}
