/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ICommonProperties } from '../../../telemetry/common/telemetry.js';
import { AgentHostRestrictedTelemetrySender } from '../../node/agentHostRestrictedTelemetry.js';

/** The enhanced/restricted iKey (`copilot_v0_restricted_copilot_event`). */
const GH_ENHANCED_IKEY = '3fdd7f28-937a-48c8-9a21-ba337db23bd1';

interface ICapturedPost {
	url: string;
	iKey: string;
}

suite('AgentHostRestrictedTelemetrySender', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const commonProperties = {} as ICommonProperties;

	function createSender(): { sender: AgentHostRestrictedTelemetrySender; posts: ICapturedPost[] } {
		const posts: ICapturedPost[] = [];
		const fetchFn = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
			const envelope = JSON.parse(String(init?.body));
			posts.push({ url: String(url), iKey: envelope.iKey });
			return { ok: true, status: 200 } as Response;
		}) as typeof globalThis.fetch;
		const sender = new AgentHostRestrictedTelemetrySender(commonProperties, new NullLogService(), 'https://default.example/telemetry', undefined, fetchFn);
		return { sender, posts };
	}

	test('enhanced GH telemetry is dropped until the token opts in (rt=1), then routes to the enhanced iKey', () => {
		const { sender, posts } = createSender();

		// Public user (rt not opted in): the restricted sink must not emit, even with content.
		sender.sendEnhancedGHTelemetryEvent('request.options.tools', { messagesJson: 'x' });
		assert.deepStrictEqual(posts, [], 'enhanced telemetry must not be sent without rt opt-in');

		// Opt in, then flip back off: emits only while enabled, and to the enhanced iKey.
		sender.setRestrictedTelemetryEnabled(true);
		sender.setRestrictedTelemetryEndpoint('https://ghe.example');
		sender.sendEnhancedGHTelemetryEvent('request.options.tools', { messagesJson: 'x' });
		sender.setRestrictedTelemetryEnabled(false);
		sender.sendEnhancedGHTelemetryEvent('request.options.tools', { messagesJson: 'x' });

		assert.deepStrictEqual(posts, [{ url: 'https://ghe.example', iKey: GH_ENHANCED_IKEY }]);
	});
});
