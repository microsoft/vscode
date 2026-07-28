/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as zlib from 'zlib';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hash } from '../../../../base/common/hash.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agentService.js';
import type { ToolDefinition } from '../../common/state/protocol/state.js';
import { IAgentHostInternalTelemetryContext, IAgentHostRestrictedTelemetry, IAgentHostRestrictedTelemetryContext, TelemetryMeasurements, TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';
import { AgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';

interface IRestrictedCall {
	eventName: string;
	properties: TelemetryProps | undefined;
}

class TestRestrictedTelemetryService implements ITelemetryService, IAgentHostRestrictedTelemetry {
	declare readonly _serviceBrand: undefined;

	telemetryLevel = TelemetryLevel.USAGE;
	sendErrorTelemetry = true;
	sessionId = 'sessionId';
	machineId = 'machineId';
	sqmId = 'sqmId';
	devDeviceId = 'devDeviceId';
	firstSessionDate = 'firstSessionDate';

	readonly enhancedEvents: IRestrictedCall[] = [];
	readonly enhancedMeasurements: Array<TelemetryMeasurements | undefined> = [];
	readonly internalEvents: IRestrictedCall[] = [];

	publicLog(): void { }
	publicLogError(): void { }
	publicLog2(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }

	sendGHTelemetryEvent(): void { }
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.enhancedEvents.push({ eventName, properties });
		this.enhancedMeasurements.push(measurements);
	}
	sendEnhancedGHTelemetryEventForContext(_context: IAgentHostRestrictedTelemetryContext, eventName: string, properties?: TelemetryProps): void {
		this.enhancedEvents.push({ eventName, properties });
	}
	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, _measurements?: TelemetryMeasurements): void {
		this.internalEvents.push({ eventName, properties });
	}
	sendInternalMSFTTelemetryEventForContext(_context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps): void {
		this.internalEvents.push({ eventName, properties });
	}
	setCopilotTrackingId(): void { }
	setRestrictedTelemetryEndpoint(): void { }
	setRestrictedTelemetryEnabled(): void { }
	setInternalTelemetryContext(): void { }
}

suite('AgentHostTelemetryReporter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'agent-session://copilot/abc';
	const tools: ToolDefinition[] = [{ name: 'grep' }, { name: 'edit' }];

	test('assistantMessageReceived emits request.options.tools keyed on the client request id, and no-ops without one or without tools', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, undefined, tools); // dropped: no client request id
		await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, 'client-1', []); // dropped: no tools
		await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, 'client-1', tools); // emitted

		assert.deepStrictEqual(service.enhancedEvents, [{
			eventName: 'request.options.tools',
			properties: {
				headerRequestId: 'client-1',
				conversationId: AgentSession.id(session),
				initiatorClientType: 'agents_window',
				messagesJson: JSON.stringify(tools),
				messagesJsonChunk: zlib.gzipSync(Buffer.from(JSON.stringify(tools), 'utf8')).toString('base64'),
			},
		}]);
	});

	test('userMessageText emits conversation.messageText (source=user) to enhanced + internal, and no-ops on empty content', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.userMessageText(session, AgentHostClientType.EditorWindow, '', 3); // dropped: no content
		await reporter.userMessageText(session, AgentHostClientType.EditorWindow, 'hello agent', 3); // emitted

		const expected: IRestrictedCall = {
			eventName: 'conversation.messageText',
			properties: {
				source: 'user',
				conversationId: AgentSession.id(session),
				initiatorClientType: 'editor_window',
				turnIndex: '3',
				messageText: 'hello agent',
			},
		};
		assert.deepStrictEqual(service.enhancedEvents, [expected]);
		assert.deepStrictEqual(service.internalEvents, [expected]);
	});

	test('modelMessageText emits conversation.messageText (source=model) with headerRequestId, and no-ops on empty content', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.modelMessageText(session, AgentHostClientType.AgentsWindow, '', 3, 'client-1'); // dropped: no content
		await reporter.modelMessageText(session, AgentHostClientType.AgentsWindow, 'sure, here you go', 3, 'client-1'); // emitted

		const expected: IRestrictedCall = {
			eventName: 'conversation.messageText',
			properties: {
				source: 'model',
				conversationId: AgentSession.id(session),
				initiatorClientType: 'agents_window',
				turnIndex: '3',
				headerRequestId: 'client-1',
				messageText: 'sure, here you go',
			},
		};
		assert.deepStrictEqual(service.enhancedEvents, [expected]);
		assert.deepStrictEqual(service.internalEvents, [expected]);
	});

	test('toolCallDetails emits toolCallDetailsExternal + toolCallDetailsInternal aggregate whenever tools were available, and no-ops when none were', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.toolCallDetails({
			session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', clientType: AgentHostClientType.Unknown, model: 'gpt-x', responseType: 'success',
			toolCounts: {}, availableTools: [],
			numRequests: 1, totalToolCalls: 0, parallelToolCallRounds: 0, parallelToolCallsTotal: 0,
		}); // dropped: no tools were available
		await reporter.toolCallDetails({
			session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', clientType: AgentHostClientType.EditorWindow, model: 'gpt-x', responseType: 'success',
			toolCounts: {}, availableTools: ['grep', 'edit'],
			numRequests: 1, totalToolCalls: 0, parallelToolCallRounds: 0, parallelToolCallsTotal: 0,
		}); // emitted: tools available, even though no tool calls were made
		await reporter.toolCallDetails({
			session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', clientType: AgentHostClientType.AgentsWindow, model: 'gpt-x', responseType: 'success',
			toolCounts: { grep: 2, edit: 1 }, availableTools: ['grep', 'edit'],
			numRequests: 2, totalToolCalls: 3, parallelToolCallRounds: 1, parallelToolCallsTotal: 2,
		}); // emitted

		assert.deepStrictEqual(service.enhancedEvents, [{
			eventName: 'toolCallDetailsExternal',
			properties: {
				conversationId: AgentSession.id(session),
				requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
				messageId: 'a1b2c3d4-0000-4000-8000-000000000000',
				initiatorClientType: 'editor_window',
				responseType: 'success',
				model: 'gpt-x',
				toolCounts: JSON.stringify({}),
				availableTools: JSON.stringify(['grep', 'edit']),
			},
		}, {
			eventName: 'toolCallDetailsExternal',
			properties: {
				conversationId: AgentSession.id(session),
				requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
				messageId: 'a1b2c3d4-0000-4000-8000-000000000000',
				initiatorClientType: 'agents_window',
				responseType: 'success',
				model: 'gpt-x',
				toolCounts: JSON.stringify({ grep: 2, edit: 1 }),
				availableTools: JSON.stringify(['grep', 'edit']),
			},
		}]);
		assert.strictEqual(service.internalEvents.length, 2);
		assert.strictEqual(service.internalEvents[0].eventName, 'toolCallDetailsInternal');
		assert.strictEqual(service.internalEvents[1].eventName, 'toolCallDetailsInternal');
	});

	test('autoModeRouterDecision maps the SDK Hydra and binary score shapes without inventing unavailable fields', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.autoModeRouterDecision({
			session,
			turnId: 'turn-hydra',
			chosenModel: 'gpt-5',
			predictedLabel: 'high',
			confidence: 0.9,
			candidateModels: ['gpt-5', 'gpt-4.1'],
			categoryScores: { reasoning: 0.8, code_gen: 0.7, debugging: 0.6, tool_use: 0.5 },
		});
		reporter.autoModeRouterDecision({
			session,
			turnId: 'turn-binary',
			chosenModel: 'gpt-4.1',
			predictedLabel: 'no_reasoning',
			confidence: undefined,
			candidateModels: undefined,
			categoryScores: { needs_reasoning: 0.2, no_reasoning: 0.8 },
		});

		assert.deepStrictEqual({ events: service.enhancedEvents, measurements: service.enhancedMeasurements }, {
			events: [{
				eventName: 'automode.routerDecisionRestricted',
				properties: {
					conversationId: AgentSession.id(session),
					vscodeRequestId: 'turn-hydra',
					predictedLabel: 'high',
					candidateModel: 'gpt-5',
					chosenModel: 'gpt-5',
					candidateModels: JSON.stringify(['gpt-5', 'gpt-4.1']),
					hydraScores: JSON.stringify({ reasoning: 0.8, code_gen: 0.7, debugging: 0.6, tool_use: 0.5 }),
				},
			}, {
				eventName: 'automode.routerDecisionRestricted',
				properties: {
					conversationId: AgentSession.id(session),
					vscodeRequestId: 'turn-binary',
					predictedLabel: 'no_reasoning',
					candidateModel: '',
					chosenModel: 'gpt-4.1',
					candidateModels: JSON.stringify([]),
					binaryScores: JSON.stringify({ needs_reasoning: 0.2, no_reasoning: 0.8 }),
				},
			}],
			measurements: [{ confidence: 0.9 }, { scoreNeedsReasoning: 0.2, scoreNoReasoning: 0.8 }],
		});
	});

	test('skillContentRead emits plaintext skill metadata to enhanced + internal, maps plugin identity + hashes content, and no-ops without a name', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.skillContentRead({ name: '', path: '/skills/x/SKILL.md', content: 'body', source: 'project', pluginName: undefined, pluginVersion: undefined }); // dropped: no name
		reporter.skillContentRead({
			name: 'pdf', path: '/plugins/pdf/SKILL.md', content: 'skill body',
			source: 'plugin', pluginName: 'pdf-plugin', pluginVersion: '1.2.3',
		}); // emitted

		const expected: IRestrictedCall = {
			eventName: 'skillContentRead',
			properties: {
				skillName: 'pdf',
				skillPath: '/plugins/pdf/SKILL.md',
				skillExtensionId: 'pdf-plugin',
				skillExtensionVersion: '1.2.3',
				skillStorage: 'plugin',
				skillContentHash: String(hash('skill body')),
			},
		};
		assert.deepStrictEqual(service.enhancedEvents, [expected]);
		assert.deepStrictEqual(service.internalEvents, [expected]);
	});

	test('repoInfo gates collection and multiplexes sink-specific properties', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.reportRepoInfo({
			restrictedTelemetryEnabled: true,
			trackingId: 'tracking-id',
			telemetryEndpoint: 'https://telemetry.example/telemetry',
			isInternal: true,
			userName: 'octocat',
			isVscodeTeamMember: true,
		}, {
			telemetryMessageId: 'turn-1',
			location: 'begin',
			remoteUrl: 'https://github.com/microsoft/vscode',
			repoId: 'microsoft/vscode',
			repoType: 'github',
			headCommitHash: 'abc',
			headBranchName: 'feature',
			fileRelativePaths: JSON.stringify(['src/a.ts']),
			diffsJSON: 'x'.repeat(8193),
			result: 'success',
			isActiveRepository: 'true',
			workspaceFileCount: 10,
			changedFileCount: 1,
			diffSizeBytes: 8193,
		});

		assert.deepStrictEqual({
			enhanced: service.enhancedEvents[0],
			internal: service.internalEvents[0],
		}, {
			enhanced: {
				eventName: 'request.repoInfo',
				properties: {
					remoteUrl: 'https://github.com/microsoft/vscode',
					repoId: 'microsoft/vscode',
					repoType: 'github',
					headCommitHash: 'abc',
					headBranchName: 'feature',
					fileRelativePaths: JSON.stringify(['src/a.ts']),
					diffsJSON: 'x'.repeat(8192),
					diffsJSONChunk: zlib.gzipSync(Buffer.from('x'.repeat(8193), 'utf8')).toString('base64'),
					result: 'success',
					isActiveRepository: 'true',
					location: 'begin',
					telemetryMessageId: 'turn-1',
				},
			},
			internal: {
				eventName: 'request.repoInfo',
				properties: {
					remoteUrl: 'https://github.com/microsoft/vscode',
					repoId: 'microsoft/vscode',
					repoType: 'github',
					headCommitHash: 'abc',
					diffsJSON: 'x'.repeat(8192),
					diffsJSONChunk: zlib.gzipSync(Buffer.from('x'.repeat(8193), 'utf8')).toString('base64'),
					result: 'success',
					isActiveRepository: 'true',
					location: 'begin',
					telemetryMessageId: 'turn-1',
				},
			},
		});
	});

	test('skillContentRead drops the version when no plugin name is known, matching the extension', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.skillContentRead({ name: 'local', path: '/skills/local/SKILL.md', content: 'c', source: 'project', pluginName: undefined, pluginVersion: '9.9.9' });

		assert.strictEqual(service.enhancedEvents.length, 1);
		assert.strictEqual(service.enhancedEvents[0].properties?.skillExtensionId, '');
		assert.strictEqual(service.enhancedEvents[0].properties?.skillExtensionVersion, '');
	});
});
