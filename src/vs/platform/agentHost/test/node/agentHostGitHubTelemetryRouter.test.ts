/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostGitHubTelemetryRouter } from '../../node/agentHostGitHubTelemetryRouter.js';
import type { IAgentHostInternalTelemetryContext, IAgentHostRestrictedTelemetry, IAgentHostRestrictedTelemetryContext, TelemetryMeasurements, TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';

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

	test('routes the explicit restricted target allowlist to the exact sinks', () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		const handled = [
			'engine.messages',
			'engine.messages.length',
			'model.message.added',
			'model.modelCall.input',
			'model.modelCall.output',
			'model.request.added',
			'model.request.options.added',
		].map(kind => router.route(notification(kind), internalContext));

		assert.deepStrictEqual({
			handled,
			events: telemetry.events.map(({ destination, eventName }) => ({ destination, eventName })),
		}, {
			handled: [true, true, true, true, true, true, true],
			events: [
				{ destination: 'enhancedGH', eventName: 'engine.messages' },
				{ destination: 'enhancedGH', eventName: 'engine.messages.length' },
				{ destination: 'internalMSFT', eventName: 'engine.messages.length' },
				{ destination: 'internalMSFT', eventName: 'model.message.added' },
				{ destination: 'internalMSFT', eventName: 'model.modelCall.input' },
				{ destination: 'internalMSFT', eventName: 'model.modelCall.output' },
				{ destination: 'internalMSFT', eventName: 'model.request.added' },
				{ destination: 'internalMSFT', eventName: 'model.request.options.added' },
			],
		});
	});

	test('falls back for unknown events and consumes misclassified target events', () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		const unknownHandled = router.route(notification('unknown', false));
		const misclassifiedTargetHandled = router.route(notification('engine.messages', false));
		const missingContextHandled = router.route(notification('engine.messages'));

		assert.deepStrictEqual({ unknownHandled, misclassifiedTargetHandled, missingContextHandled, events: telemetry.events }, {
			unknownHandled: false,
			misclassifiedTargetHandled: true,
			missingContextHandled: true,
			events: [],
		});
	});

	test('forwards properties and metrics and maps model_call_id without overwriting modelCallId', () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		router.route(notification('engine.messages'), internalContext);
		const existingModelCallId = notification('engine.messages');
		existingModelCallId.event.properties.modelCallId = 'existing-model-call';
		router.route(existingModelCallId, internalContext);

		assert.deepStrictEqual(telemetry.events, [
			{
				destination: 'enhancedGH',
				eventName: 'engine.messages',
				properties: { existing: 'value', modelCallId: 'model-call-1' },
				measurements: { count: 2 },
			},
			{
				destination: 'enhancedGH',
				eventName: 'engine.messages',
				properties: { existing: 'value', modelCallId: 'existing-model-call' },
				measurements: { count: 2 },
			},
		]);
	});

	test('multiplexes long properties before routing to either sink', () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);
		const longNotification = notification('engine.messages.length');
		longNotification.event.properties.messagesJson = 'x'.repeat(16_385);

		router.route(longNotification, internalContext);

		assert.deepStrictEqual(telemetry.events.map(event => ({
			destination: event.destination,
			chunkLengths: [
				event.properties?.messagesJson?.length,
				event.properties?.messagesJson_02?.length,
				event.properties?.messagesJson_03?.length,
			],
		})), [
			{ destination: 'enhancedGH', chunkLengths: [8192, 8192, 1] },
			{ destination: 'internalMSFT', chunkLengths: [8192, 8192, 1] },
		]);
	});

});
