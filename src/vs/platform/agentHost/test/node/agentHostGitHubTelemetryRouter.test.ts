/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import assert from 'assert';
import { createHash } from 'crypto';
import * as zlib from 'zlib';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostGitHubTelemetryRouter } from '../../node/agentHostGitHubTelemetryRouter.js';
import { AgentHostRestrictedTelemetrySender, type IAgentHostInternalTelemetryContext, type IAgentHostRestrictedTelemetry, type IAgentHostRestrictedTelemetryContext, type TelemetryMeasurements, type TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';

interface ICapturedEvent {
	readonly destination: 'enhancedGH' | 'internalMSFT';
	readonly eventName: string;
	readonly properties: TelemetryProps | undefined;
	readonly measurements: TelemetryMeasurements | undefined;
}

class TestRestrictedTelemetry implements IAgentHostRestrictedTelemetry {
	readonly events: ICapturedEvent[] = [];

	sendGHTelemetryEvent(): void { }
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'enhancedGH', eventName, properties, measurements });
	}
	sendEnhancedGHTelemetryEventForContext(_context: IAgentHostRestrictedTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'enhancedGH', eventName, properties, measurements });
	}
	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'internalMSFT', eventName, properties, measurements });
	}
	sendInternalMSFTTelemetryEventForContext(_context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'internalMSFT', eventName, properties, measurements });
	}
	setCopilotTrackingId(): void { }
	setCommonProperty(): void { }
	setRestrictedTelemetryEndpoint(): void { }
	setRestrictedTelemetryEnabled(): void { }
	setInternalTelemetryContext(): void { }
}

const internalContext: IAgentHostRestrictedTelemetryContext = {
	restrictedTelemetryEnabled: true,
	trackingId: 'tracking-id',
	telemetryEndpoint: 'https://telemetry.example/telemetry',
	isInternal: true,
	userName: 'octocat',
	isVscodeTeamMember: true,
};

function notification(kind: string, restricted = true): GitHubTelemetryNotification {
	return {
		sessionId: 'session-1',
		restricted,
		event: {
			kind,
			model_call_id: 'model-call-1',
			properties: { existing: 'value' },
			metrics: { count: 2 },
		},
	};
}

suite('AgentHostGitHubTelemetryRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes the explicit restricted target allowlist to the exact sinks', async () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		const handled = await Promise.all([
			'engine.messages',
			'engine.messages.length',
			'conversation.repetition.detected',
			'model.message.added',
			'model.modelCall.input',
			'model.modelCall.output',
			'model.request.added',
			'model.request.options.added',
		].map(kind => router.route(notification(kind), internalContext)));

		assert.deepStrictEqual({
			handled,
			events: telemetry.events.map(({ destination, eventName }) => ({ destination, eventName })),
		}, {
			handled: [true, true, true, true, true, true, true, true],
			events: [
				{ destination: 'enhancedGH', eventName: 'engine.messages' },
				{ destination: 'enhancedGH', eventName: 'engine.messages.length' },
				{ destination: 'internalMSFT', eventName: 'engine.messages.length' },
				{ destination: 'enhancedGH', eventName: 'conversation.repetition.detected' },
				{ destination: 'internalMSFT', eventName: 'model.message.added' },
				{ destination: 'internalMSFT', eventName: 'model.modelCall.input' },
				{ destination: 'internalMSFT', eventName: 'model.modelCall.output' },
				{ destination: 'internalMSFT', eventName: 'model.request.added' },
				{ destination: 'internalMSFT', eventName: 'model.request.options.added' },
			],
		});
	});

	test('falls back for unknown events and consumes misclassified target events', async () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		const unknownHandled = await router.route(notification('unknown', false));
		const misclassifiedTargetHandled = await router.route(notification('engine.messages', false));
		const missingContextHandled = await router.route(notification('engine.messages'));

		assert.deepStrictEqual({ unknownHandled, misclassifiedTargetHandled, missingContextHandled, events: telemetry.events }, {
			unknownHandled: false,
			misclassifiedTargetHandled: true,
			missingContextHandled: true,
			events: [],
		});
	});

	test('forwards properties and metrics and maps model_call_id without overwriting modelCallId', async () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		await router.route(notification('conversation.repetition.detected'), internalContext, { initiatorClientType: 'agents_window' });
		const existingModelCallId = notification('engine.messages');
		existingModelCallId.event.properties.modelCallId = 'existing-model-call';
		await router.route(existingModelCallId, internalContext);

		assert.deepStrictEqual(telemetry.events, [
			{
				destination: 'enhancedGH',
				eventName: 'conversation.repetition.detected',
				properties: { existing: 'value', modelCallId: 'model-call-1', initiatorClientType: 'agents_window' },
				measurements: { count: 2 },
			},
			{
				destination: 'enhancedGH',
				eventName: 'engine.messages',
				properties: { existing: 'value', modelCallId: 'existing-model-call', sdkSessionId: 'session-1', sdkAgentId: undefined },
				measurements: { count: 2 },
			},
		]);
	});

	test('does not substitute SDK IDs for missing engine pairing IDs', async () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);
		for (const kind of ['engine.messages', 'engine.messages.length']) {
			await router.route(notification(kind), internalContext);
		}

		assert.deepStrictEqual(telemetry.events.map(event => ({
			modelCallId: event.properties?.modelCallId,
			sdkSessionId: event.properties?.sdkSessionId,
		})), [
			{ modelCallId: undefined, sdkSessionId: 'session-1' },
			{ modelCallId: undefined, sdkSessionId: 'session-1' },
			{ modelCallId: undefined, sdkSessionId: 'session-1' },
		]);
	});

	test('preserves independent engine call pairs through the restricted sender', async () => {
		const envelopes: { data: { baseData: { name: string; properties: TelemetryProps } } }[] = [];
		const sender = new AgentHostRestrictedTelemetrySender(
			{ sessionID: 'telemetry-process' },
			new NullLogService(),
			'https://telemetry.example/telemetry',
			undefined,
			async (_url, init) => {
				envelopes.push(JSON.parse(String(init?.body)));
				return new Response(null, { status: 200 });
			},
		);
		const router = new AgentHostGitHubTelemetryRouter(sender);
		const calls = ['engine-call-1', 'engine-call-2'];
		for (const modelCallId of calls) {
			for (const direction of ['input', 'output']) {
				const source = notification('engine.messages');
				source.event.properties = {
					modelCallId,
					message_direction: direction,
					headerRequestId: `${direction}-${modelCallId}`,
					messagesJson: JSON.stringify([{ role: direction === 'input' ? 'user' : 'assistant', content: null, tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'view', arguments: '{"path":"synthetic"}' } }] }]),
				};
				await router.route(source, internalContext);
				await router.route(source, { ...internalContext, restrictedTelemetryEnabled: false, isInternal: false });
				await router.route({ ...source, restricted: false }, internalContext);
			}
		}

		assert.deepStrictEqual(envelopes.map(({ data: { baseData } }) => ({
			name: baseData.name,
			call: baseData.properties.modelCallId,
			direction: baseData.properties.message_direction,
			header: baseData.properties.headerRequestId,
			sdkSessionId: baseData.properties.sdkSessionId,
			tracking: baseData.properties.copilot_trackingId,
			process: baseData.properties.client_sessionid,
		})), calls.flatMap(call => ['input', 'output'].map(direction => ({
			name: 'copilot-chat/engine.messages',
			call,
			direction,
			header: `${direction}-${call}`,
			sdkSessionId: 'session-1',
			tracking: 'tracking-id',
			process: 'telemetry-process',
		}))));
	});

	test('copies engine conversation and child identity from the producing notification, not enrichment', async () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);
		for (const kind of ['engine.messages', 'engine.messages.length']) {
			for (const agentId of [undefined, 'child-1', 'nested-child-2']) {
				const source = notification(kind);
				source.event.properties = {
					modelCallId: 'engine-call',
					conversationId: 'existing-host-scope',
					...(agentId ? { agent_id: agentId } : {}),
					sdkSessionId: 'untrusted-alias',
					sdkAgentId: 'untrusted-child-alias',
				};
				const original = structuredClone(source);
				await router.route(source, internalContext, { sdkSessionId: 'current-ui-session', sdkAgentId: 'current-ui-child' });
				assert.deepStrictEqual(source, original);
			}
		}
		assert.deepStrictEqual(telemetry.events.map(({ properties }) => [
			properties?.sdkSessionId, properties?.sdkAgentId, properties?.modelCallId, properties?.conversationId,
		]), [
			['session-1', undefined, 'engine-call', 'existing-host-scope'],
			['session-1', 'child-1', 'engine-call', 'existing-host-scope'],
			['session-1', 'nested-child-2', 'engine-call', 'existing-host-scope'],
			['session-1', undefined, 'engine-call', 'existing-host-scope'],
			['session-1', undefined, 'engine-call', 'existing-host-scope'],
			['session-1', 'child-1', 'engine-call', 'existing-host-scope'],
			['session-1', 'child-1', 'engine-call', 'existing-host-scope'],
			['session-1', 'nested-child-2', 'engine-call', 'existing-host-scope'],
			['session-1', 'nested-child-2', 'engine-call', 'existing-host-scope'],
		]);
	});

	test('does not infer missing SDK identity from host IDs, telemetry session IDs or stale aliases', async () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);
		for (const sessionId of [undefined, '']) {
			const source = notification('engine.messages');
			source.sessionId = sessionId;
			source.event.session_id = 'normalized-telemetry-session';
			source.event.properties = { conversationId: 'host-session', sdkSessionId: 'stale-session', sdkAgentId: 'stale-child', agent_id: '' };
			await router.route(source, internalContext);
		}
		await router.route(notification('conversation.repetition.detected'), internalContext);
		assert.deepStrictEqual(telemetry.events.map(({ properties }) => ({
			sdkSessionId: properties?.sdkSessionId,
			sdkAgentId: properties?.sdkAgentId,
		})), [
			{ sdkSessionId: undefined, sdkAgentId: undefined },
			{ sdkSessionId: undefined, sdkAgentId: undefined },
			{ sdkSessionId: undefined, sdkAgentId: undefined },
		]);
	});

	test('preserves independent conversations and branch identity in restricted upload envelopes', async () => {
		const envelopes: { data: { baseData: { name: string; properties: TelemetryProps } } }[] = [];
		const sender = new AgentHostRestrictedTelemetrySender({}, new NullLogService(), undefined, undefined, async (_url, init) => {
			envelopes.push(JSON.parse(String(init?.body)));
			return new Response(null, { status: 200 });
		});
		const router = new AgentHostGitHubTelemetryRouter(sender);
		for (const sessionId of ['sdk-a', 'sdk-b', 'sdk-a']) {
			for (const direction of ['input', 'output']) {
				const source = notification('engine.messages');
				source.sessionId = sessionId;
				source.event.properties = {
					modelCallId: `engine-${sessionId}`,
					message_direction: direction,
					headerRequestId: `${direction}-${sessionId}`,
					agent_id: 'child-1',
					messagesJson: JSON.stringify([{ role: direction === 'input' ? 'user' : 'assistant', content: 'synthetic' }]),
				};
				await router.route(source, internalContext);
			}
		}
		await router.route(notification('engine.messages'), { ...internalContext, restrictedTelemetryEnabled: false, isInternal: false });
		await router.route(notification('engine.messages', false), internalContext);
		assert.deepStrictEqual(envelopes.map(({ data: { baseData } }) => ({
			name: baseData.name,
			session: baseData.properties.sdkSessionId,
			agent: baseData.properties.sdkAgentId,
			call: baseData.properties.modelCallId,
			direction: baseData.properties.message_direction,
			header: baseData.properties.headerRequestId,
			messages: zlib.gunzipSync(Buffer.from(baseData.properties.messagesJSONChunk!, 'base64')).toString('utf8'),
		})), ['sdk-a', 'sdk-b', 'sdk-a'].flatMap(session => ['input', 'output'].map(direction => ({
			name: 'copilot-chat/engine.messages',
			session,
			agent: 'child-1',
			call: `engine-${session}`,
			direction,
			header: `${direction}-${session}`,
			messages: JSON.stringify([{ role: direction === 'input' ? 'user' : 'assistant', content: 'synthetic' }]),
		}))));
	});

	test('preserves runtime content metadata through compressed engine message routing', async () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);
		const source = notification('engine.messages');
		const content = Array.from({ length: 1000 }, (_, index) => createHash('sha256').update(String(index)).digest('hex')).join('\n');
		const messagesJson = JSON.stringify([{
			role: 'assistant',
			content,
			reasoning_text: 'Summary with "quotes" and \u{1F600}',
			reasoning_opaque: 'opaque',
			content_metadata: [
				{ path: '/content', purpose: 'answer', visibility: 'user_visible', format: 'text' },
				{ path: '/reasoning_text', purpose: 'reasoning_summary', visibility: 'unknown', format: 'text' },
				{ path: '/reasoning_opaque', purpose: 'reasoning', visibility: 'opaque', format: 'opaque' },
			],
		}]);
		source.event.properties.messagesJson = messagesJson;

		await router.route(source, internalContext);

		const properties = telemetry.events[0].properties!;
		const chunks: string[] = [];
		for (let index = 1; ; index++) {
			const chunk = properties[index === 1 ? 'messagesJSONChunk' : `messagesJSONChunk_${index}`];
			if (chunk === undefined) {
				break;
			}
			chunks.push(chunk);
		}
		assert.deepStrictEqual({
			eventCount: telemetry.events.length,
			destination: telemetry.events[0].destination,
			rawPrefix: properties.messagesJson,
			multipleChunks: chunks.length > 1,
			boundedChunks: chunks.every(chunk => chunk.length <= 8192),
			reconstructed: zlib.gunzipSync(Buffer.from(chunks.join(''), 'base64')).toString('utf8'),
			sourceUnchanged: source.event.properties.messagesJson,
		}, {
			eventCount: 1,
			destination: 'enhancedGH',
			rawPrefix: messagesJson.slice(0, 8192),
			multipleChunks: true,
			boundedChunks: true,
			reconstructed: messagesJson,
			sourceUnchanged: messagesJson,
		});
	});

	test('multiplexes long properties before routing to either sink', async () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);
		const longNotification = notification('engine.messages.length');
		const original = 'x'.repeat(16_385);
		longNotification.event.properties.messagesJson = original;

		await router.route(longNotification, internalContext);

		const gunzip = (chunks: (string | undefined)[]): string =>
			zlib.gunzipSync(Buffer.from(chunks.join(''), 'base64')).toString('utf8');
		assert.deepStrictEqual(telemetry.events.map(event => ({
			destination: event.destination,
			// The original column carries just the first uncompressed chunk.
			original: event.properties?.messagesJson,
			// No plain continuation family is produced.
			plainContinuation: event.properties?.messagesJson_02,
			// The full value round-trips from the compressed chunk family.
			roundTrip: gunzip([event.properties?.messagesJSONChunk, event.properties?.messagesJSONChunk_2]),
		})), [
			{ destination: 'enhancedGH', original: original.slice(0, 8192), plainContinuation: undefined, roundTrip: original },
			{ destination: 'internalMSFT', original: original.slice(0, 8192), plainContinuation: undefined, roundTrip: original },
		]);
	});

});
