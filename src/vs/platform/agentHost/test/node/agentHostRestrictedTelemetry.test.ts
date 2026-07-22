/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ICommonProperties } from '../../../telemetry/common/telemetry.js';
import { AgentHostRestrictedTelemetrySender, type IAgentHostInternalTelemetryContext, type IAgentHostInternalTelemetrySink, type TelemetryMeasurements, type TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';

/** The enhanced/restricted iKey (`copilot_v0_restricted_copilot_event`). */
const GH_ENHANCED_IKEY = '3fdd7f28-937a-48c8-9a21-ba337db23bd1';

interface ICapturedPost {
	url: string;
	iKey: string;
}

interface ICapturedEnvelope {
	readonly data: { readonly baseData: { readonly properties: Record<string, string | undefined> } };
}

class TestInternalSink implements IAgentHostInternalTelemetrySink {
	readonly contexts: (IAgentHostInternalTelemetryContext | undefined)[] = [];
	readonly events: { eventName: string; properties: TelemetryProps | undefined; measurements: TelemetryMeasurements | undefined }[] = [];

	setContext(context: IAgentHostInternalTelemetryContext | undefined): void {
		this.contexts.push(context);
	}
	send(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ eventName, properties, measurements });
	}
	sendForContext(_context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ eventName, properties, measurements });
	}
}

suite('AgentHostRestrictedTelemetrySender', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const commonProperties = {} as ICommonProperties;

	function createSender(): { sender: AgentHostRestrictedTelemetrySender; posts: ICapturedPost[]; envelopes: ICapturedEnvelope[] } {
		const posts: ICapturedPost[] = [];
		const envelopes: ICapturedEnvelope[] = [];
		const fetchFn = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
			const envelope = JSON.parse(String(init?.body)) as ICapturedEnvelope & { iKey: string };
			posts.push({ url: String(url), iKey: envelope.iKey });
			envelopes.push(envelope);
			return { ok: true, status: 200 } as Response;
		}) as typeof globalThis.fetch;
		const sender = new AgentHostRestrictedTelemetrySender(commonProperties, new NullLogService(), 'https://default.example/telemetry', undefined, fetchFn);
		return { sender, posts, envelopes };
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

	test('context-scoped enhanced telemetry ignores mutable account routing and identity', () => {
		const { sender, posts, envelopes } = createSender();
		sender.setRestrictedTelemetryEnabled(true);
		sender.setRestrictedTelemetryEndpoint('https://current-account.example/telemetry');
		sender.setCopilotTrackingId('current-account-tid');

		sender.sendEnhancedGHTelemetryEventForContext({
			restrictedTelemetryEnabled: true,
			trackingId: 'session-account-tid',
			telemetryEndpoint: 'https://session-account.example/telemetry',
			isInternal: false,
			userName: 'session-account',
			isVscodeTeamMember: false,
		}, 'engine.messages', { copilot_trackingId: 'payload-tid' });

		assert.deepStrictEqual({
			posts,
			trackingId: envelopes[0].data.baseData.properties.copilot_trackingId,
		}, {
			posts: [{ url: 'https://session-account.example/telemetry', iKey: GH_ENHANCED_IKEY }],
			trackingId: 'session-account-tid',
		});
	});

	test('internal telemetry is independently gated on internal identity', () => {
		const internalSink = new TestInternalSink();
		const sender = new AgentHostRestrictedTelemetrySender(commonProperties, new NullLogService(), 'https://default.example/telemetry', internalSink);

		sender.sendInternalMSFTTelemetryEvent('beforeIdentity');
		sender.setInternalTelemetryContext({ isInternal: false, trackingId: 'external', userName: 'external', isVscodeTeamMember: false });
		sender.sendInternalMSFTTelemetryEvent('external');
		const internalContext = { isInternal: true, trackingId: 'internal', userName: 'octocat', isVscodeTeamMember: true };
		sender.setInternalTelemetryContext(internalContext);
		sender.sendInternalMSFTTelemetryEvent('internal', { value: 'property' }, { count: 1 });
		sender.setInternalTelemetryContext(undefined);
		sender.sendInternalMSFTTelemetryEvent('afterClear');

		assert.deepStrictEqual({ contexts: internalSink.contexts, events: internalSink.events }, {
			contexts: [
				{ isInternal: false, trackingId: 'external', userName: 'external', isVscodeTeamMember: false },
				internalContext,
				undefined,
			],
			events: [{ eventName: 'internal', properties: { value: 'property' }, measurements: { count: 1 } }],
		});
	});
});
