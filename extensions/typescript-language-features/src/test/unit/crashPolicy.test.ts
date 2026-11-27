/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { CrashPluginState, CrashResponse, TsServerCrashTracker, getCrashResponse } from '../../tsServer/crashPolicy';

const minutes = (count: number) => count * 60 * 1000;

function describeResponse({ restart, prompt }: CrashResponse): string {
	if (!prompt) {
		return restart ? 'restart silently' : 'stop silently';
	}
	return [
		restart ? 'restart' : 'stop',
		prompt.severity,
		...(prompt.mentionPlugins ? ['blames plugins'] : []),
		...(prompt.suggestMoreMemory ? ['suggests more memory'] : []),
		...(prompt.offerReportIssue ? ['offers report issue'] : []),
	].join(', ');
}

suite('TS Server crash policy', () => {
	test('counts a slow crash loop and forgets old crashes', () => {
		const slowLoop = new TsServerCrashTracker();
		const occasional = new TsServerCrashTracker();
		const reset = new TsServerCrashTracker();
		[0, 1, 2, 3].forEach(time => reset.recordCrash(minutes(time)));
		reset.reset();

		assert.deepStrictEqual({
			slowLoop: [0, 3, 6, 9, 12].map(time => slowLoop.recordCrash(minutes(time))),
			occasional: [0, 30, 61, 92, 123].map(time => occasional.recordCrash(minutes(time))),
			afterReset: reset.recordCrash(minutes(4)),
		}, {
			slowLoop: [1, 2, 3, 4, 5],
			occasional: [1, 2, 2, 2, 2],
			afterReset: 1,
		});
	});

	test('shows repeated and out-of-memory crashes without blaming Copilot Chat', () => {
		assert.deepStrictEqual({
			copilotOnlyFirstCrashInsiders: describeResponse(getCrashResponse(1, false, CrashPluginState.OnlyCopilot, true)),
			copilotOnlyFifthCrash: describeResponse(getCrashResponse(5, false, CrashPluginState.OnlyCopilot, false)),
			copilotOnlyOutOfMemory: describeResponse(getCrashResponse(1, true, CrashPluginState.OnlyCopilot, false)),
			noPluginsFirstCrash: describeResponse(getCrashResponse(1, false, CrashPluginState.None, false)),
			noPluginsFirstCrashInsiders: describeResponse(getCrashResponse(1, false, CrashPluginState.None, true)),
			otherPluginFirstCrashInsiders: describeResponse(getCrashResponse(1, false, CrashPluginState.Other, true)),
			otherPluginFifthCrashOutOfMemory: describeResponse(getCrashResponse(5, true, CrashPluginState.Other, false)),
		}, {
			copilotOnlyFirstCrashInsiders: 'restart silently',
			copilotOnlyFifthCrash: 'stop, error, offers report issue',
			copilotOnlyOutOfMemory: 'restart, warning, suggests more memory, offers report issue',
			noPluginsFirstCrash: 'restart silently',
			noPluginsFirstCrashInsiders: 'restart, warning, offers report issue',
			otherPluginFirstCrashInsiders: 'restart, warning, blames plugins',
			otherPluginFifthCrashOutOfMemory: 'stop, error, blames plugins, suggests more memory',
		});
	});
});
