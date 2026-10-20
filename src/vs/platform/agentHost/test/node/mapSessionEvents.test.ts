/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ToolExecutionCompleteContentResource, ToolExecutionCompleteResult } from '@github/copilot-sdk';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { readAgentRuntimeModelConfiguration } from '../../common/meta/agentModelConfigurationMeta.js';
import { AgentSession, subagentChatTitle } from '../../common/agent.js';
import { getErrorResponsePart, getTurnError, MessageAttachmentKind, MessageKind, ResponsePartKind, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, buildChatUri, buildSubagentSessionUri, type ResponsePart, type StringOrMarkdown, type ToolCallResponsePart, type ToolResultContent } from '../../common/state/sessionState.js';
import { appendSdkToolResultContent, getSdkToolResultContent, getSdkToolResultText, mapSessionEvents as mapSessionEventsWithRouting, persistSdkToolResultResources, type IMapSessionEventsOptions } from '../../node/copilot/mapSessionEvents.js';
import { toSessionEvents, type ISessionEvent } from './copilotTestEvents.js';
import { fusionMainPassTestData as mainPass, fusionTestData as fusion, fusionTestEvent as event } from './copilotFusionTestEvents.js';
import { AgentSystemNotificationKind, readAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { buildNonPtyShellTerminalUri } from '../../common/nonPtyShellTerminalUri.js';
import { buildMcpResourceUri, buildToolResultResourceUri, parseMcpResourceUri, parseToolResultResourceUri } from '../../common/mcpResourceUri.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildMcpChannel } from '../../node/shared/mcpCustomizationController.js';
import { ISessionDatabase, MAX_TOOL_RESULT_RESOURCE_BYTES } from '../../common/sessionDataService.js';
import { TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { prependAnnouncementToFirstTurn } from '../../node/shared/worktreeIsolation.js';

function mapSessionEvents(session: URI, db: ISessionDatabase | undefined, events: Parameters<typeof mapSessionEventsWithRouting>[2], options: IMapSessionEventsOptions | undefined = undefined) {
	return mapSessionEventsWithRouting(session, db, events, URI.parse(buildChatUri(session, 'default')), session, options);
}

suite('mapSessionEvents — history replay', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = AgentSession.uri('copilot', 'test-session');

	test('declares native input contracts only when replay knows the client tool set', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'message', content: 'Read files' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'native', toolName: 'view', arguments: { path: '/workspace/File.ts', view_range: [1, 10] } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'native', success: true } },
			{ type: 'tool.execution_start', data: { toolCallId: 'client', toolName: 'edit', arguments: { path: '/workspace/File.ts' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'client', success: true } },
			{ type: 'tool.execution_start', data: { toolCallId: 'mcp', toolName: 'grep', arguments: { pattern: 'query' }, mcpServerName: 'server', mcpToolName: 'grep' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'mcp', success: true } },
		];
		const summaries = await Promise.all([undefined, new Set(['edit'])].map(async clientToolNames => {
			const result = await mapSessionEvents(session, undefined, toSessionEvents(events), { clientToolNames });
			return result.turns.flatMap(turn => turn.responseParts.flatMap(part =>
				part.kind === ResponsePartKind.ToolCall ? [readToolCallMeta(part.toolCall)['vscode.toolInputContract']] : []));
		}));
		assert.deepStrictEqual(summaries, [
			[undefined, undefined, undefined],
			['copilot-cli-v1', undefined, undefined],
		]);
	});

	test('replays available MCP links through the recorded server channel', async () => {
		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'user.message', data: { content: 'Read resources' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-link', toolName: 'get-resource-links', mcpServerName: 'everything' } },
			{
				type: 'tool.execution_complete', data: {
					toolCallId: 'tc-link', success: true, result: {
						content: 'Links', contents: [
							{ type: 'text', text: 'Links' },
							{ type: 'resource_link', uri: 'demo://resource/1', name: 'Document.txt', mimeType: 'text/plain', size: 8 },
						]
					}
				}
			},
		]));
		const channel = buildMcpChannel(URI.parse(buildChatUri(session, 'default')), 'everything', 'copilot');
		assert.deepStrictEqual(turns.flatMap(turn => turn.responseParts.flatMap(part =>
			part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? [part.toolCall.content] : [])), [[
				{ type: ToolResultContentType.Text, text: 'Links' },
				{ type: ToolResultContentType.Resource, uri: buildMcpResourceUri(channel, 'demo://resource/1', 'Document.txt'), contentType: 'text/plain', sizeHint: 8 },
			]]);
	});

	function partKinds(parts: readonly ResponsePart[]): Array<{ kind: ResponsePartKind; content?: StringOrMarkdown }> {
		return parts.map(p => p.kind === ResponsePartKind.Markdown || p.kind === ResponsePartKind.SystemNotification ? { kind: p.kind, content: p.content } : { kind: p.kind });
	}

	function fusionParts(parts: readonly ResponsePart[]) {
		return parts.map(part => part.kind === ResponsePartKind.SystemNotification
			? readAgentSystemNotificationMeta(part).fusionStatus
			: part.kind === ResponsePartKind.ToolCall ? readToolCallMeta(part.toolCall).fusionPhase?.status
				: part.kind === ResponsePartKind.Markdown ? part.content : part.kind);
	}

	function fusionTurnData(index: number) {
		const fusionId = `fusion-${index}`;
		const phaseId = `phase-${index}`;
		const turnId = `sdk-turn-${index}`;
		const attemptId = `attempt-${index}`;
		return {
			routeStarted: { ...fusion.routeStarted, attemptId },
			routeFailed: { ...fusion.routeFailed, attemptId },
			resolved: { ...fusion.resolved, fusionId, turnId },
			phaseCompleted: { ...fusion.phaseCompleted, fusionId, phaseId },
			completed: { ...fusion.completed, fusionId, turnId, commitId: `commit-${index}`, finalSourcePhaseId: phaseId },
		};
	}

	test('restores durable Fusion milestones once without private or provisional content', async () => {
		const provisional = { fusionId: 'fusion-1', phaseId: 'phase-1', syntheticModel: 'hydrafusion', policy: 'max', pattern: 'cascade' };
		const resolved = event('session.fusion_resolved', fusion.resolved);
		const { turns } = await mapSessionEvents(session, undefined, [
			...toSessionEvents([{ type: 'user.message', id: 'user-1', data: { content: 'Implement the change.' } }]),
			resolved,
			resolved,
			event('assistant.fusion_phase_started', fusion.started, { ephemeral: true }),
			event('assistant.fusion_phase_activity', fusion.activity, { ephemeral: true }),
			event('assistant.message', { messageId: 'draft', content: 'PRIVATE DRAFT', fusion: provisional }, { ephemeral: true }),
			event('tool.execution_start', { toolCallId: 'hidden', toolName: 'read_file', fusion: provisional }, { ephemeral: true }),
			event('assistant.fusion_phase_completed', fusion.phaseCompleted),
			event('assistant.fusion_phase_completed', fusion.phaseCompleted),
			event('assistant.message', { messageId: 'final', content: 'Selected final answer', fusion: { ...provisional, commitId: 'commit-1' } }),
			event('session.fusion_completed', fusion.completed),
		]);
		assert.deepStrictEqual({
			turnCount: turns.length,
			parts: fusionParts(turns[0].responseParts),
			leaksPhaseContent: JSON.stringify(turns).includes('PRIVATE'),
		}, {
			turnCount: 1,
			parts: ['selected', 'succeeded', 'Selected final answer'],
			leaksPhaseContent: false,
		});
	});

	test('restores committed Fusion phase tools and intermediate text under the phase tile', async () => {
		const committed = { fusionId: 'fusion-1', phaseId: 'phase-1', syntheticModel: 'hydrafusion', policy: 'max', pattern: 'cascade', commitId: 'commit-1' };
		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, [
			...toSessionEvents([{ type: 'user.message', id: 'user-1', data: { content: 'Start the app.' } }]),
			event('session.fusion_resolved', fusion.resolved),
			event('assistant.fusion_phase_completed', fusion.phaseCompleted),
			event('assistant.message', { messageId: 'm1', content: 'Starting the server', toolRequests: [{ toolCallId: 'tc-bash', name: 'bash', arguments: {} }], fusion: committed }),
			event('tool.execution_start', { toolCallId: 'tc-bash', toolName: 'bash', arguments: { command: 'ls' }, fusion: committed }),
			event('tool.execution_complete', { toolCallId: 'tc-bash', success: true, result: { content: 'a.ts' }, fusion: committed }),
			event('assistant.message', { messageId: 'm2', content: 'The app is running', fusion: committed }),
			event('session.fusion_completed', fusion.completed),
		]);
		const phaseToolCallId = 'fusion:fusion-1:phase-1';
		const phase = turns[0].responseParts.find((part): part is ToolCallResponsePart => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === phaseToolCallId);
		const phaseContent = phase?.toolCall.status === ToolCallStatus.Completed ? phase.toolCall.content : undefined;
		assert.deepStrictEqual({
			root: turns[0].responseParts.map(part => part.kind === ResponsePartKind.ToolCall ? part.toolCall.toolCallId : part.kind === ResponsePartKind.Markdown ? part.content : part.kind),
			phaseChat: phaseContent?.flatMap(item => item.type === ToolResultContentType.Subagent ? [{ resource: item.resource, agentName: item.agentName }] : []),
			phaseTurn: subagentTurnsByToolCallId.get(phaseToolCallId)?.flatMap(turn => turn.responseParts.map(part => part.kind === ResponsePartKind.ToolCall ? part.toolCall.toolCallId : part.kind === ResponsePartKind.Markdown ? part.content : part.kind)),
		}, {
			root: [ResponsePartKind.SystemNotification, phaseToolCallId, 'The app is running'],
			phaseChat: [{ resource: buildSubagentSessionUri(session.toString(), phaseToolCallId), agentName: 'hydrafusion-phase' }],
			phaseTurn: ['Starting the server', 'tc-bash'],
		});
	});

	for (const identity of ['apiCallId', 'clientRequestId', 'none'] as const) {
		test(`restores all Fusion chunks in their model call's chat (${identity})`, async () => {
			const committed = { fusionId: 'fusion-1', phaseId: 'phase-1', syntheticModel: 'hydrafusion', policy: 'max', pattern: 'cascade', commitId: 'commit-1' };
			const chunk = (callId: string, chunkIndex: number, content: string, toolCallId?: string) => event('assistant.message', {
				messageId: `${callId}-${chunkIndex}`, ...(identity === 'none' ? {} : { [identity]: callId }), chunkCount: 2, chunkIndex,
				content, fusion: committed, ...(toolCallId ? { toolRequests: [{ toolCallId, name: 'view', arguments: {} }] } : {}),
			});
			const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, [
				event('user.message', { content: 'Fix the parser.' }),
				event('session.fusion_resolved', fusion.resolved),
				event('assistant.fusion_phase_completed', fusion.phaseCompleted),
				chunk('work', 0, 'Checking the parser first'),
				chunk('work', 1, 'Inspecting empty input', 'tc-view'),
				event('tool.execution_start', { toolCallId: 'tc-view', toolName: 'view', fusion: committed }),
				event('tool.execution_complete', { toolCallId: 'tc-view', success: true, result: { content: 'x' }, fusion: committed }),
				chunk('answer', 0, 'The parser is fixed'),
				chunk('answer', 1, 'Both cases pass'),
				event('session.fusion_completed', fusion.completed),
			]);
			assert.deepStrictEqual({
				root: turns.flatMap(turn => turn.responseParts.flatMap(part => part.kind === ResponsePartKind.Markdown ? [part.content] : [])),
				phase: subagentTurnsByToolCallId.get('fusion:fusion-1:phase-1')?.flatMap(turn => turn.responseParts.map(part =>
					part.kind === ResponsePartKind.ToolCall ? part.toolCall.toolCallId : part.kind === ResponsePartKind.Markdown ? part.content : part.kind)),
			}, {
				root: ['The parser is fixed', 'Both cases pass'],
				phase: ['Checking the parser first', 'Inspecting empty input', 'tc-view'],
			});
		});
	}

	test('restores main pass tools, text, and task_complete summary in the main chat', async () => {
		const committed = { fusionId: 'fusion-1', phaseId: 'phase-1', syntheticModel: 'hydrafusion', policy: 'max', pattern: 'single', commitId: 'commit-1' };
		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, [
			event('user.message', { content: 'Start the app.' }),
			event('session.fusion_resolved', { ...fusion.resolved, pattern: 'single' }),
			event('assistant.fusion_phase_completed', mainPass.phaseCompleted),
			event('assistant.message', { messageId: 'm1', content: 'Starting the server', toolRequests: [{ toolCallId: 'tc-bash', name: 'bash', arguments: {} }], fusion: committed }),
			event('tool.execution_start', { toolCallId: 'tc-bash', toolName: 'bash', arguments: { command: 'ls' }, fusion: committed }),
			event('tool.execution_complete', { toolCallId: 'tc-bash', success: true, result: { content: 'a.ts' }, fusion: committed }),
			event('assistant.message', { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-complete', name: 'task_complete', arguments: {} }], fusion: committed }),
			event('tool.execution_start', { toolCallId: 'tc-complete', toolName: 'task_complete', arguments: { summary: 'The app is running' }, fusion: committed }),
			event('tool.execution_complete', { toolCallId: 'tc-complete', success: true, result: { content: 'Done' }, fusion: committed }),
			event('session.fusion_completed', fusion.completed),
		]);
		assert.deepStrictEqual({
			root: turns[0].responseParts.map(part => part.kind === ResponsePartKind.ToolCall ? part.toolCall.toolCallId : part.kind === ResponsePartKind.Markdown ? part.content : part.kind),
			state: turns[0].state,
			phaseTurns: subagentTurnsByToolCallId.has('fusion:fusion-1:phase-1'),
		}, {
			root: [ResponsePartKind.SystemNotification, 'Starting the server', 'tc-bash', '\n\n**Task completed:**\n\nThe app is running'],
			state: TurnState.Complete,
			phaseTurns: false,
		});
	});

	for (const failed of [false, true]) {
		test(`restores a fix-up task_complete summary in its phase chat${failed ? ' but not after a root error' : ' and the main chat'}`, async () => {
			const committed = { fusionId: 'fusion-1', phaseId: 'phase-1', syntheticModel: 'hydrafusion', policy: 'max', pattern: 'cascade', commitId: 'commit-1' };
			const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, [
				event('user.message', { content: 'Fix the parser.' }),
				event('session.fusion_resolved', fusion.resolved),
				event('assistant.fusion_phase_completed', fusion.phaseCompleted),
				event('assistant.message', { messageId: 'm1', content: '', toolRequests: [{ toolCallId: 'tc-complete', name: 'task_complete', arguments: {} }], fusion: committed }),
				event('tool.execution_start', { toolCallId: 'tc-complete', toolName: 'task_complete', arguments: { summary: 'Fixed the parser' }, fusion: committed }),
				...(failed ? [event('session.error', { errorType: 'requestFailed', message: 'Failed' })] : []),
				event('tool.execution_complete', { toolCallId: 'tc-complete', success: true, result: { content: 'Done' }, fusion: committed }),
			]);
			const markdown = (parts: readonly ResponsePart[] | undefined) => (parts ?? []).flatMap(part => part.kind === ResponsePartKind.Markdown ? [part.content] : []);
			const phase = turns[0].responseParts.find((part): part is ToolCallResponsePart => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'fusion:fusion-1:phase-1');
			assert.deepStrictEqual({
				root: markdown(turns[0].responseParts),
				phaseChat: markdown(subagentTurnsByToolCallId.get('fusion:fusion-1:phase-1')?.[0]?.responseParts),
				linked: phase?.toolCall.status === ToolCallStatus.Completed && !!phase.toolCall.content?.some(item => item.type === ToolResultContentType.Subagent),
				error: !!getErrorResponsePart(turns[0]),
			}, {
				root: failed ? [] : ['\n\n**Task completed:**\n\nFixed the parser'],
				phaseChat: ['\n\n**Task completed:**\n\nFixed the parser'],
				linked: true,
				error: failed,
			});
		});
	}


	test('restores a review phase critique into its phase chat', async () => {
		const critic = { ...fusion.phaseCompleted, phaseId: 'critic', phaseKind: 'critic', role: 'critic', conversationScope: 'review' } as const;
		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, [
			...toSessionEvents([{ type: 'user.message', id: 'user-1', data: { content: 'Implement it.' } }]),
			event('session.fusion_resolved', { ...fusion.resolved, pattern: 'critique' }),
			event('assistant.fusion_phase_completed', fusion.phaseCompleted),
			event('assistant.fusion_phase_completed', { ...critic, content: JSON.stringify({ assessment: 'revise', feedback: 'Negative input is accepted.', defect: null }) }),
			event('assistant.message', { messageId: 'final', content: 'Done.' }),
			event('session.fusion_completed', fusion.completed),
		]);
		const criticToolCallId = 'fusion:fusion-1:critic';
		const tile = turns[0].responseParts.find((part): part is ToolCallResponsePart => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === criticToolCallId);
		assert.deepStrictEqual({
			linked: tile?.toolCall.status === ToolCallStatus.Completed && !!tile.toolCall.content?.some(item => item.type === ToolResultContentType.Subagent),
			critique: subagentTurnsByToolCallId.get(criticToolCallId)?.flatMap(turn => turn.responseParts.map(part => part.kind === ResponsePartKind.Markdown ? part.content : part.kind)),
			solverChat: subagentTurnsByToolCallId.has('fusion:fusion-1:phase-1'),
			leaksPhaseContent: JSON.stringify(turns).includes('PRIVATE'),
		}, {
			linked: true,
			critique: ['**Changes requested**\n\nNegative input is accepted.'],
			solverChat: false,
			leaksPhaseContent: false,
		});
	});

	test('attaches early Fusion routing to the next user turn rather than the previous answer', async () => {
		const { turns } = await mapSessionEvents(session, undefined, [
			...toSessionEvents([
				{ type: 'user.message', id: 'user-1', data: { content: 'First request' } },
				{ type: 'assistant.message', data: { messageId: 'first', content: 'First answer' } },
			]),
			event('session.idle', {}),
			event('session.fusion_resolved', fusion.resolved),
			...toSessionEvents([{ type: 'user.message', id: 'user-2', data: { content: 'Second request' } }]),
			event('assistant.fusion_phase_completed', fusion.phaseCompleted),
			event('session.fusion_completed', fusion.completed),
		]);
		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			milestones: turn.responseParts.filter(part => part.kind === ResponsePartKind.SystemNotification || part.kind === ResponsePartKind.ToolCall).length,
		})), [{ id: 'user-1', milestones: 0 }, { id: 'user-2', milestones: 2 }]);
	});

	for (const correlation of ['user', 'assistant', 'interaction', 'missing', 'shared'] as const) {
		for (const earlyRouting of [false, true]) {
			test(`correlates delayed routing after cancellation (${correlation}, ${earlyRouting ? 'early' : 'normal'} next routing)`, async () => {
				const next = fusionTurnData(2);
				const oldResolution = event('session.fusion_resolved', { ...fusion.resolved, turnId: 'sdk-first' });
				const nextResolution = event('session.fusion_resolved', next.resolved);
				const { turns } = await mapSessionEvents(session, undefined, [
					...(correlation === 'interaction' ? [event('assistant.turn_start', { turnId: 'sdk-first', interactionId: 'interaction-first' })] : []),
					event('user.message', {
						content: 'First request',
						...(correlation === 'user' ? { turnId: 'sdk-first' } : correlation === 'shared' ? { turnId: next.resolved.turnId } : {}),
						...(correlation === 'interaction' ? { interactionId: 'interaction-first' } : {}),
					}, { id: 'user-1' }),
					...(correlation === 'assistant' ? [event('assistant.turn_start', { turnId: 'sdk-first' })] : []),
					event('abort', { reason: 'user_initiated' }),
					...(earlyRouting ? [oldResolution, nextResolution] : []),
					event('user.message', {
						content: 'Second request',
						...(correlation === 'user' || correlation === 'shared' ? { turnId: next.resolved.turnId } : {}),
						...(correlation === 'interaction' ? { interactionId: 'interaction-next' } : {}),
					}, { id: 'user-2' }),
					...(correlation === 'assistant' || correlation === 'interaction'
						? [event('assistant.turn_start', { turnId: next.resolved.turnId, ...(correlation === 'interaction' ? { interactionId: 'interaction-next' } : {}) })] : []),
					...(!earlyRouting ? [oldResolution, nextResolution] : []),
					event('assistant.fusion_phase_completed', fusion.phaseCompleted),
					event('session.fusion_completed', { ...fusion.completed, turnId: 'sdk-first' }),
					event('assistant.fusion_phase_completed', next.phaseCompleted),
					event('assistant.message', { messageId: 'answer', content: 'Second answer' }),
					event('session.fusion_completed', next.completed),
				]);
				assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, state: turn.state, parts: fusionParts(turn.responseParts) })), [
					{ id: 'user-1', state: TurnState.Cancelled, parts: [] },
					{ id: 'user-2', state: TurnState.Complete, parts: correlation === 'missing' || correlation === 'shared' ? ['Second answer'] : ['selected', 'succeeded', 'Second answer'] },
				]);
			});
		}
	}

	test('restores an interrupted ephemeral phase with its duration and rejects its late events on the next turn', async () => {
		const next = fusionTurnData(2);
		const { turns } = await mapSessionEvents(session, undefined, [
			event('user.message', { content: 'First request' }, { id: 'user-1' }),
			event('session.fusion_route_started', fusion.routeStarted),
			event('assistant.fusion_phase_started', fusion.started, { timestamp: '2020-01-01T12:00:00Z' }),
			event('assistant.fusion_phase_activity', fusion.activity),
			event('abort', { reason: 'user_initiated' }, { timestamp: '2020-01-01T12:00:03Z' }),
			event('user.message', { content: 'Second request', turnId: next.resolved.turnId }, { id: 'user-2' }),
			event('session.fusion_route_failed', fusion.routeFailed),
			event('assistant.fusion_phase_completed', fusion.phaseCompleted),
			event('session.fusion_completed', fusion.completed),
			event('session.fusion_resolved', next.resolved),
			event('assistant.message', { messageId: 'answer', content: 'Second answer' }),
		]);
		const phase = turns[0].responseParts[0];
		assert.deepStrictEqual({
			parts: turns.map(turn => fusionParts(turn.responseParts)),
			duration: phase.kind === ResponsePartKind.ToolCall ? readToolCallMeta(phase.toolCall).fusionPhase?.duration : undefined,
		}, { parts: [['cancelled'], ['selected', 'Second answer']], duration: 3000 });
	});

	test('keeps an interrupted pending routing fallback with its upcoming user message', async () => {
		const { turns } = await mapSessionEvents(session, undefined, [
			event('user.message', { content: 'First request' }, { id: 'user-1' }),
			event('assistant.message', { messageId: 'answer-1', content: 'First answer' }),
			event('session.idle', {}),
			event('session.fusion_route_failed', fusion.routeFailed),
			event('abort', { reason: 'user_initiated' }),
			event('abort', { reason: 'user_initiated' }),
			event('user.message', { content: 'Second request' }, { id: 'user-2' }),
			event('session.fusion_completed', fusion.completed),
		]);
		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, parts: fusionParts(turn.responseParts) })), [
			{ id: 'user-1', parts: ['First answer'] },
			{ id: 'user-2', parts: ['degraded', 'cancelled'] },
		]);
	});

	for (const [abortAfter, phaseEvent, phaseStatus] of [
		['resolved', undefined, undefined],
		['phase completed', event('assistant.fusion_phase_completed', fusion.phaseCompleted), 'succeeded'],
		['phase failed with fallback', event('assistant.fusion_phase_failed', { ...fusion.phaseFailed, degradedToPhaseId: 'fallback' }), 'failed'],
		['phase failed', event('assistant.fusion_phase_failed', fusion.phaseFailed), 'failed'],
		['phase cancelled', event('assistant.fusion_phase_failed', { ...fusion.phaseFailed, status: 'cancelled' }), 'cancelled'],
	] as const) {
		for (const earlyRouting of [false, true]) {
			for (const idle of [false, true]) {
				test(`restores Fusion after abort following ${abortAfter} (${earlyRouting ? 'early' : 'normal'} routing, ${idle ? 'with' : 'without'} idle)`, async () => {
					const next = fusionTurnData(2);
					const routing = [
						...(earlyRouting ? [event('session.fusion_route_started', next.routeStarted)] : []),
						event('session.fusion_resolved', next.resolved),
					];
					const lateEvents = [
						event('session.fusion_route_started', fusion.routeStarted),
						event('session.fusion_route_failed', fusion.routeFailed),
						event('session.fusion_resolved', fusion.resolved),
						event('assistant.fusion_phase_completed', { ...fusion.phaseCompleted, phaseId: 'late-phase' }),
						event('assistant.fusion_phase_failed', { ...fusion.phaseFailed, phaseId: 'late-failed-phase', degradedToPhaseId: 'late-fallback' }),
						event('session.fusion_completed', fusion.completed),
					];
					const { turns } = await mapSessionEvents(session, undefined, [
						event('user.message', { content: 'First request', turnId: fusion.resolved.turnId }, { id: 'user-1' }),
						event('session.fusion_route_started', fusion.routeStarted),
						event('session.fusion_resolved', fusion.resolved),
						...(phaseEvent ? [phaseEvent] : []),
						event('abort', { reason: 'user_initiated' }),
						...lateEvents,
						...(idle ? [event('session.idle', {})] : []),
						...lateEvents,
						...(earlyRouting ? routing : []),
						event('user.message', { content: 'Second request', turnId: next.resolved.turnId }, { id: 'user-2' }),
						...lateEvents,
						...(earlyRouting ? [] : routing),
						event('session.fusion_resolved', next.resolved),
						...lateEvents,
						event('assistant.fusion_phase_completed', next.phaseCompleted),
						event('assistant.message', { messageId: 'answer-2', content: 'Second answer' }),
						event('session.fusion_completed', next.completed),
						...lateEvents,
					]);
					assert.deepStrictEqual(turns.map(turn => ({
						id: turn.id,
						state: turn.state,
						parts: fusionParts(turn.responseParts),
					})), [
						{
							id: 'user-1',
							state: TurnState.Cancelled,
							parts: ['selected', ...(phaseStatus ? [phaseStatus] : []), 'cancelled'],
						},
						{ id: 'user-2', state: TurnState.Complete, parts: ['selected', 'succeeded', 'Second answer'] },
					]);
				});
			}
		}
	}

	for (const earlyRouting of [false, true]) {
		test(`cancels a routing fallback and ignores late workflow completion (${earlyRouting ? 'early' : 'normal'} routing)`, async () => {
			const next = fusionTurnData(2);
			const routing = [
				event('session.fusion_route_started', fusion.routeStarted),
				event('session.fusion_route_failed', fusion.routeFailed),
			];
			const { turns } = await mapSessionEvents(session, undefined, [
				...(earlyRouting ? routing : []),
				event('user.message', { content: 'First request', turnId: fusion.resolved.turnId }, { id: 'user-1' }),
				...(earlyRouting ? [] : routing),
				event('abort', { reason: 'user_initiated' }),
				event('session.fusion_completed', fusion.completed),
				event('session.fusion_resolved', fusion.resolved),
				event('session.idle', {}),
				event('session.fusion_route_started', next.routeStarted),
				event('session.fusion_completed', fusion.completed),
				event('user.message', { content: 'Second request', turnId: next.resolved.turnId }, { id: 'user-2' }),
				event('session.fusion_route_failed', fusion.routeFailed),
				event('session.fusion_resolved', next.resolved),
				event('assistant.fusion_phase_completed', next.phaseCompleted),
				event('session.fusion_completed', next.completed),
				event('abort', { reason: 'user_initiated' }),
			]);
			assert.deepStrictEqual(turns.map(turn => ({
				id: turn.id,
				parts: fusionParts(turn.responseParts),
			})), [
				{ id: 'user-1', parts: ['degraded', 'cancelled'] },
				{ id: 'user-2', parts: ['selected', 'succeeded'] },
			]);
		});
	}

	test('restores consecutive cancelled and completed Fusion turns without reviving prior workflows', async () => {
		const states = [TurnState.Cancelled, TurnState.Cancelled, TurnState.Complete, TurnState.Complete, TurnState.Cancelled, TurnState.Complete];
		const events = states.flatMap((state, index) => {
			const data = fusionTurnData(index + 1);
			const routing = [
				event('session.fusion_route_started', data.routeStarted),
				event('session.fusion_resolved', data.resolved),
			];
			return [
				...(index % 2 === 0 ? routing : []),
				event('user.message', { content: `Request ${index + 1}`, turnId: data.resolved.turnId }, { id: `user-${index + 1}` }),
				...(index % 2 === 0 ? [] : routing),
				event('assistant.fusion_phase_completed', data.phaseCompleted),
				...(state === TurnState.Cancelled ? [event('abort', { reason: 'user_initiated' })] : [
					event('assistant.message', { messageId: `answer-${index + 1}`, content: `Answer ${index + 1}` }),
					event('session.fusion_completed', data.completed),
				]),
				event('session.idle', {}),
			];
		});
		for (let index = 0; index < states.length - 1; index++) {
			const data = fusionTurnData(index + 1);
			events.push(
				event('session.fusion_resolved', data.resolved),
				event('assistant.fusion_phase_completed', { ...data.phaseCompleted, phaseId: 'late-phase' }),
				event('session.fusion_completed', data.completed),
			);
		}
		const { turns } = await mapSessionEvents(session, undefined, events);
		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			state: turn.state,
			parts: fusionParts(turn.responseParts),
		})), states.map((state, index) => ({
			id: `user-${index + 1}`,
			state,
			parts: ['selected', 'succeeded', ...(state === TurnState.Cancelled ? ['cancelled'] : [`Answer ${index + 1}`])],
		})));
	});

	test('does not attach an unowned routing fallback to the next request after cancellation', async () => {
		const next = fusionTurnData(2);
		const { turns } = await mapSessionEvents(session, undefined, [
			event('user.message', { content: 'First request' }, { id: 'user-1' }),
			event('session.fusion_resolved', fusion.resolved),
			event('abort', { reason: 'user_initiated' }),
			event('session.fusion_route_started', next.routeStarted),
			event('session.fusion_route_failed', next.routeFailed),
			event('user.message', { content: 'Second request' }, { id: 'user-2' }),
			event('session.fusion_route_failed', next.routeFailed),
			event('assistant.message', { messageId: 'answer-2', content: 'Fallback answer' }),
		]);
		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			parts: fusionParts(turn.responseParts),
		})), [
			{ id: 'user-1', parts: ['selected', 'cancelled'] },
			{ id: 'user-2', parts: ['Fallback answer'] },
		]);
	});

	for (const persistedOnly of [false, true]) {
		test(`rejects a cancelled request's late routing failure (${persistedOnly ? 'durable log' : 'including ephemeral events'})`, async () => {
			const events = [
				event('user.message', { content: 'First request' }, { id: 'user-1' }),
				event('session.fusion_route_started', fusion.routeStarted),
				event('abort', { reason: 'user_initiated' }),
				event('session.fusion_route_failed', fusion.routeFailed),
				event('user.message', { content: 'Second request' }, { id: 'user-2' }),
				event('assistant.message', { messageId: 'answer-2', content: 'Second answer' }),
			];
			const { turns } = await mapSessionEvents(session, undefined, persistedOnly ? events.filter(event => !event.ephemeral) : events);
			assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, parts: fusionParts(turn.responseParts) })), [
				{ id: 'user-1', parts: persistedOnly ? [] : ['cancelled'] },
				{ id: 'user-2', parts: ['Second answer'] },
			]);
		});
	}

	for (const knownAgent of [false, true]) {
		test(`subagent events do not reset or interrupt root Fusion progress (${knownAgent ? 'known' : 'unknown'} agent)`, async () => {
			const next = fusionTurnData(2);
			const agent = { agentId: 'child-agent' };
			const { turns } = await mapSessionEvents(session, undefined, [
				event('user.message', { content: 'Root request' }, { id: 'user-1' }),
				event('session.fusion_resolved', fusion.resolved),
				event('assistant.fusion_phase_completed', fusion.phaseCompleted),
				...(knownAgent ? [event('subagent.started', { toolCallId: 'child-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Child task' }, agent)] : []),
				event('user.message', { content: 'Child request' }, agent),
				event('assistant.turn_start', { turnId: 'child-turn' }, agent),
				event('session.fusion_route_started', next.routeStarted, agent),
				event('session.fusion_resolved', next.resolved, agent),
				event('assistant.fusion_phase_completed', next.phaseCompleted, agent),
				event('session.fusion_completed', next.completed, agent),
				event('abort', { reason: 'user_initiated' }, agent),
				event('assistant.turn_end', { turnId: 'child-turn' }, agent),
				event('session.idle', {}, agent),
				event('session.fusion_resolved', fusion.resolved),
				event('assistant.fusion_phase_completed', fusion.phaseCompleted),
				event('session.fusion_completed', fusion.completed),
				event('session.fusion_resolved', next.resolved),
				event('assistant.fusion_phase_completed', next.phaseCompleted),
				event('assistant.message', { messageId: 'root-answer', content: 'Root answer' }),
				event('session.fusion_completed', next.completed),
			]);
			assert.deepStrictEqual(turns.map(turn => ({
				id: turn.id,
				state: turn.state,
				parts: fusionParts(turn.responseParts),
			})), [{
				id: 'user-1',
				state: TurnState.Complete,
				parts: ['selected', 'succeeded', 'selected', 'succeeded', 'Root answer'],
			}]);
		});
	}

	for (const hasExecutionEvents of [true, false]) {
		test(`restores canonical agent read labels even when identity is recorded later (${hasExecutionEvents ? 'execution events' : 'tool request fallback'})`, async () => {
			const agentId = '37241a58-7d95-4763-a3fb-2494dcfcf540';
			const events: ISessionEvent[] = [
				{ type: 'user.message', data: { interactionId: 'parent', content: 'Read the agent result.' } },
				{ type: 'assistant.message', data: { messageId: 'read-request', content: '', toolRequests: [{ toolCallId: 'tc-read', name: 'read_agent', arguments: { agent_id: agentId } }] } },
			];
			if (hasExecutionEvents) {
				events.push(
					{ type: 'tool.execution_start', data: { toolCallId: 'tc-read', toolName: 'read_agent', arguments: { agent_id: agentId } } },
					{ type: 'tool.execution_complete', data: { toolCallId: 'tc-read', success: true } },
				);
			}
			events.push({
				type: 'subagent.started', agentId, data: {
					toolCallId: 'tc-task', agentName: 'research', agentDisplayName: 'catalog-perf', agentDescription: 'Profile the catalog',
				}
			});
			const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

			assert.deepStrictEqual(turns.flatMap(turn => turn.responseParts.flatMap(part => part.kind === ResponsePartKind.ToolCall
				&& part.toolCall.toolName === 'read_agent' && part.toolCall.status === ToolCallStatus.Completed
				? [{ invocation: part.toolCall.invocationMessage, completed: part.toolCall.pastTenseMessage }]
				: [])), [{
					invocation: { markdown: 'Read agent `catalog-perf`' },
					completed: { markdown: 'Read agent `catalog-perf`' },
				}]);
		});
	}

	for (const hasExecutionEvents of [true, false]) {
		test(`restores matching subagent chat titles in tools and notifications (${hasExecutionEvents ? 'execution events' : 'tool request fallback'})`, async () => {
			const agentId = 'take-all-agent';
			const parameters = { agent_type: 'general-purpose', name: 'take-all', description: 'Fix Take-all ground pickup' };
			const events: ISessionEvent[] = [
				{ type: 'user.message', data: { content: 'Review the result.' } },
				{ type: 'assistant.message', data: { messageId: 'coordination', content: '', toolRequests: ['read_agent', 'write_agent'].map(name => ({ name, toolCallId: name, arguments: { agent_id: agentId } })) } },
			];
			if (hasExecutionEvents) {
				for (const toolName of ['read_agent', 'write_agent']) {
					events.push(
						{ type: 'tool.execution_start', data: { toolCallId: toolName, toolName, arguments: { agent_id: agentId } } },
						{ type: 'tool.execution_complete', data: { toolCallId: toolName, success: true } },
					);
				}
			}
			events.push(
				{ type: 'subagent.started', agentId, data: { toolCallId: 'task', agentName: 'general-purpose', agentDisplayName: 'take-all', agentDescription: 'General purpose agent' } },
				{ type: 'assistant.message', data: { messageId: 'launch', content: '', toolRequests: [{ toolCallId: 'task', name: 'task', arguments: parameters }] } },
			);
			if (hasExecutionEvents) {
				events.push({ type: 'tool.execution_start', data: { toolCallId: 'task', toolName: 'task', arguments: parameters } });
			}
			events.push(
				{ type: 'tool.execution_complete', data: { toolCallId: 'task', success: true } },
				{ type: 'system.notification', data: { content: 'Agent finished', kind: { type: 'agent_idle', agentId, agentType: 'general-purpose', displayName: 'take-all', description: 'A different SDK description' } } },
			);
			const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));
			const parts = turns.flatMap(turn => turn.responseParts);
			assert.deepStrictEqual({
				toolMessages: parts.flatMap(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed && part.toolCall.toolCallId !== 'task'
					? [part.toolCall.invocationMessage, part.toolCall.pastTenseMessage] : []),
				chatTitles: parts.flatMap(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed && part.toolCall.toolCallId === 'task'
					? part.toolCall.content?.flatMap(content => content.type === ToolResultContentType.Subagent ? [subagentChatTitle(readToolCallMeta(part.toolCall).subagentDescription, content.title)] : []) ?? [] : []),
				notifications: parts.flatMap(part => part.kind === ResponsePartKind.SystemNotification ? [part.content] : []),
			}, {
				toolMessages: [
					{ markdown: 'Read agent `Fix Take-all ground pickup`' },
					{ markdown: 'Read agent `Fix Take-all ground pickup`' },
					{ markdown: 'Write to agent `Fix Take-all ground pickup`' },
					{ markdown: 'Write to agent `Fix Take-all ground pickup`' },
				],
				chatTitles: ['Fix Take-all ground pickup'],
				notifications: ['Background agent `Fix Take-all ground pickup` is complete'],
			});
		});
	}

	for (const hasExecutionEvents of [true, false]) {
		test(`restores write recipients from background completion notifications (${hasExecutionEvents ? 'execution events' : 'tool request fallback'})`, async () => {
			const parameters = { agent_ids: ['renderer-agent', 'history-agent'], message: 'Follow up' };
			const events: ISessionEvent[] = [
				{ type: 'user.message', data: { content: 'Continue the review.' } },
				{ type: 'assistant.message', data: { messageId: 'write-request', content: '', toolRequests: [{ toolCallId: 'tc-write', name: 'write_agent', arguments: parameters }] } },
			];
			if (hasExecutionEvents) {
				events.push(
					{ type: 'tool.execution_start', data: { toolCallId: 'tc-write', toolName: 'write_agent', arguments: parameters } },
					{ type: 'tool.execution_complete', data: { toolCallId: 'tc-write', success: true } },
				);
			}
			events.push(
				{ type: 'system.notification', data: { content: 'Agent finished', kind: { type: 'agent_idle', agentId: 'renderer-agent', agentType: 'code-review', displayName: 'Renderer reviewer' } } },
				{ type: 'system.notification', data: { content: 'Agent finished', kind: { type: 'agent_completed', agentId: 'history-agent', agentType: 'code-review', description: 'Review history', status: 'completed' } } },
			);
			const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));
			assert.deepStrictEqual(turns.flatMap(turn => turn.responseParts.flatMap(part => part.kind === ResponsePartKind.ToolCall
				&& part.toolCall.toolCallId === 'tc-write' && part.toolCall.status === ToolCallStatus.Completed
				? [{ invocation: part.toolCall.invocationMessage, completed: part.toolCall.pastTenseMessage, input: part.toolCall.toolInput }]
				: [])), [{
					invocation: { markdown: 'Write to agents `Renderer reviewer`, `Review history`' },
					completed: { markdown: 'Write to agents `Renderer reviewer`, `Review history`' },
					input: JSON.stringify(parameters, null, 2),
				}]);
		});
	}

	test('task_complete renders the input summary when tool output is truncated', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'Working on it.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'task_complete', arguments: { summary: '## Summary\n\nDone. All good.' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'Output too large to read at once (11.3 KB). Saved to: /tmp/task-complete.txt' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.Markdown, content: 'Working on it.' },
			{ kind: ResponsePartKind.Markdown, content: '\n\n**Task completed:**\n\n## Summary\n\nDone. All good.' },
		]);
	});

	test('restores Auto model resolution as usage metadata without routing diagnostics', async () => {
		const autoModeResolved = {
			chosenModel: 'claude-opus-4.8',
			reasoningBucket: 'high',
			categoryScores: { reasoning: 0.91, code_gen: 0.72 },
			predictedLabel: 'needs_reasoning',
			confidence: 0.93,
			candidateModels: ['claude-opus-4.8', 'claude-sonnet-4.6'],
			selectionReason: 'Auto selected claude-opus-4.8 for its fit to your request because of high reasoning needs.',
		};
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-before-auto', data: { interactionId: 'm0', content: 'First prompt' } },
			{ type: 'assistant.message', data: { messageId: 'm1', content: 'First response.' } },
			// The runtime resolves Auto while building settings, before it persists
			// the user message for the turn that will use the chosen model.
			{ type: 'session.auto_mode_resolved', data: { ...autoModeResolved, routingMethod: 'binary', availableModels: ['claude-opus-4.8', 'claude-sonnet-4.6', 'gpt-5.5'], routerLatencyMs: 25, fallback: false } },
			{ type: 'user.message', id: 'turn-auto', data: { interactionId: 'm1', content: 'Solve this problem' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'Done.' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, usage: turn.usage })), [
			{ id: 'turn-before-auto', usage: undefined },
			{
				id: 'turn-auto',
				usage: {
					model: 'claude-opus-4.8',
					_meta: { autoModeResolved },
				},
			},
		]);
	});

	test('restores an on-device Auto pick with its local-model attribution alongside the routing decision', async () => {
		const local = { chosenModel: 'mai-code-1.1-flash-local' };
		const cloud = { chosenModel: 'claude-opus-4.8' };
		const events: ISessionEvent[] = [
			{ type: 'session.auto_mode_resolved', data: local },
			{ type: 'user.message', id: 'turn-local', data: { interactionId: 'm0', content: 'First prompt' } },
			{ type: 'assistant.message', data: { messageId: 'm1', content: 'First response.' } },
			{ type: 'session.auto_mode_resolved', data: cloud },
			{ type: 'user.message', id: 'turn-cloud', data: { interactionId: 'm2', content: 'Second prompt' } },
			{ type: 'assistant.message', data: { messageId: 'm3', content: 'Second response.' } },
			{ type: 'user.message', id: 'turn-subagent', data: { interactionId: 'm4', content: 'Delegate work' } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explore tests', model: 'auto' } },
			{ type: 'session.auto_mode_resolved', agentId: 'agent-1', data: local },
			{ type: 'user.message', agentId: 'agent-1', data: { content: 'Explore' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { content: 'Child response' } },
			// Switching the subagent away drops the stale routing and its attribution together.
			{ type: 'session.model_change', agentId: 'agent-1', data: { previousModel: 'auto', newModel: 'gpt-5.5' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			parent: turns.map(turn => ({ id: turn.id, usage: turn.usage })),
			subagent: subagentTurnsByToolCallId.get('tc-task')?.map(turn => turn.usage),
		}, {
			parent: [
				// What actually ran is not in the SDK history; the persisted turn usage, merged over this on restore, carries it.
				{ id: 'turn-local', usage: { model: 'mai-code-1.1-flash-local', _meta: { autoModeResolved: local, 'vscode.localModel': { execution: 'unknown' } } } },
				{ id: 'turn-cloud', usage: { model: 'claude-opus-4.8', _meta: { autoModeResolved: cloud } } },
				{ id: 'turn-subagent', usage: undefined },
			],
			subagent: [{ model: 'gpt-5.5', _meta: {} }],
		});
	});

	test('restores a subagent Auto model resolution onto the subagent turn', async () => {
		const autoModeResolved = { chosenModel: 'claude-opus-4.8' };
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', data: { interactionId: 'm1', content: 'summarize the service' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'Summarize', agent_type: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore Agent', agentDescription: 'Explores' } },
			// Auto routes before the model call, so the decision lands before the
			// subagent's first message. It must not pull the turn's start time back.
			{ type: 'session.auto_mode_resolved', agentId: 'agent-1', timestamp: '2025-01-01T00:00:10.000Z', data: autoModeResolved },
			{ type: 'user.message', agentId: 'agent-1', timestamp: '2025-01-01T00:00:20.000Z', data: { interactionId: 'subagent-prompt', content: 'Inspect the implementation.' } },
			{ type: 'assistant.message', agentId: 'agent-1', timestamp: '2025-01-01T00:00:30.000Z', data: { messageId: 'm3', content: 'Subagent is done.' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: true } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			parentUsage: turns.map(turn => turn.usage),
			subagentTurns: subagentTurnsByToolCallId.get('tc-task')?.map(turn => ({ text: turn.message.text, startedAt: turn.startedAt, duration: turn.duration, usage: turn.usage })),
		}, {
			parentUsage: [undefined],
			subagentTurns: [{
				text: 'Inspect the implementation.',
				startedAt: '2025-01-01T00:00:20.000Z',
				duration: 10000,
				usage: { model: 'claude-opus-4.8', _meta: { autoModeResolved } },
			}],
		});
	});

	for (const beforeFirstMessage of [false, true]) {
		test(`preserves restored subagent Auto routing across same-model configuration changes (beforeFirstMessage=${beforeFirstMessage})`, async () => {
			const configurationChange: ISessionEvent = {
				type: 'session.model_change', agentId: 'agent-1', data: { previousModel: 'auto', newModel: 'auto', reasoningEffort: 'high' },
			};
			const autoModeResolved = { chosenModel: 'gpt-5.5' };
			const { subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents([
				{ type: 'user.message', data: { content: 'Delegate work' } },
				{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explore tests', model: 'auto' } },
				{ type: 'session.auto_mode_resolved', agentId: 'agent-1', data: autoModeResolved },
				...(beforeFirstMessage ? [configurationChange] : []),
				{ type: 'user.message', agentId: 'agent-1', data: { content: 'Explore' } },
				{ type: 'assistant.message', agentId: 'agent-1', data: { content: 'Child response' } },
				...(!beforeFirstMessage ? [configurationChange] : []),
			]));

			assert.deepStrictEqual(subagentTurnsByToolCallId.get('tc-task')?.[0].usage, {
				model: 'gpt-5.5', _meta: { autoModeResolved },
			});
		});
	}

	for (const beforeFirstMessage of [false, true]) {
		test(`restores resolved subagent model options (beforeFirstMessage=${beforeFirstMessage})`, async () => {
			const configured: ISessionEvent = {
				type: 'subagent.configured', agentId: 'agent-1',
				data: { model: 'gpt-5.4-mini', multiTurn: true, reasoningEffort: 'xhigh', contextTier: 'long_context' },
			};
			const message: ISessionEvent = { type: 'user.message', agentId: 'agent-1', data: { content: 'Explore' } };
			const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents([
				{ type: 'user.message', data: { content: 'Delegate work' } },
				{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explore tests' } },
				...(beforeFirstMessage ? [configured, message] : [message, configured]),
				{ type: 'assistant.turn_start', agentId: 'agent-1', data: { turnId: 'child-turn', model: 'gpt-5.4-mini' } },
				{ type: 'assistant.message', agentId: 'agent-1', data: { content: 'Child response' } },
				{ type: 'assistant.message', data: { content: 'Parent response' } },
			]));

			assert.deepStrictEqual({
				parent: readAgentRuntimeModelConfiguration(turns[0].usage),
				child: readAgentRuntimeModelConfiguration(subagentTurnsByToolCallId.get('tc-task')?.[0].usage),
			}, {
				parent: undefined,
				child: { reasoningEffort: 'xhigh', contextTier: 'long_context' },
			});
		});
	}

	test('restores a known subagent startup model without waiting for usage', async () => {
		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'session.start', data: { selectedModel: 'gpt-5.5' } },
			{ type: 'user.message', id: 'parent-turn', data: { content: 'Delegate work' } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explore tests', model: 'gpt-5.4-mini' } },
			{ type: 'subagent.configured', agentId: 'agent-1', data: { model: 'claude-sonnet-4.6', multiTurn: true } },
			{ type: 'user.message', agentId: 'agent-1', timestamp: '2025-01-01T00:00:20.000Z', data: { content: 'Explore' } },
			{ type: 'assistant.turn_start', agentId: 'agent-1', data: { turnId: 'child-turn', model: 'claude-opus-4.8' } },
			{ type: 'assistant.message', agentId: 'agent-1', timestamp: '2025-01-01T00:00:30.000Z', data: { content: 'Child response' } },
			{ type: 'assistant.message', data: { content: 'Parent response' } },
		]));

		assert.deepStrictEqual({
			parentModel: turns[0].message.model,
			child: subagentTurnsByToolCallId.get('tc-task')?.map(turn => ({
				model: turn.message.model, startedAt: turn.startedAt, usage: turn.usage,
			})),
		}, {
			parentModel: { id: 'gpt-5.5' },
			child: [{ model: { id: 'claude-opus-4.8' }, startedAt: '2025-01-01T00:00:20.000Z', usage: undefined }],
		});
	});

	for (const source of ['subagent.started', 'subagent.configured', 'assistant.turn_start'] as const) {
		test(`restores the subagent model first reported by ${source}`, async () => {
			const events: ISessionEvent[] = [
				{ type: 'user.message', id: 'parent-turn', data: { content: 'Delegate work' } },
				{
					type: 'subagent.started', agentId: 'agent-1', data: {
						toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explore tests',
						...(source === 'subagent.started' ? { model: 'gpt-5.4-mini' } : {}),
					}
				},
				...(source === 'subagent.started' ? [] : [{
					type: source, agentId: 'agent-1', data: { model: 'gpt-5.4-mini', multiTurn: true, turnId: 'child-turn' },
				}]),
				{ type: 'user.message', agentId: 'agent-1', timestamp: '2025-01-01T00:00:20.000Z', data: { content: 'Explore' } },
				{ type: 'assistant.message', agentId: 'agent-1', timestamp: '2025-01-01T00:00:30.000Z', data: { content: 'Child response' } },
			];
			const { subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

			assert.deepStrictEqual(subagentTurnsByToolCallId.get('tc-task')?.map(turn => ({
				model: turn.message.model, startedAt: turn.startedAt,
			})), [{ model: { id: 'gpt-5.4-mini' }, startedAt: '2025-01-01T00:00:20.000Z' }]);
		});
	}

	test('restored child model changes do not change the next parent request model', async () => {
		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'session.start', data: { selectedModel: 'gpt-5.5' } },
			{ type: 'user.message', id: 'parent-turn', data: { content: 'Delegate work' } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explore tests' } },
			{ type: 'session.auto_mode_resolved', agentId: 'agent-1', data: { chosenModel: 'claude-opus-4.8' } },
			{ type: 'user.message', agentId: 'agent-1', data: { content: 'Explore' } },
			{ type: 'session.model_change', agentId: 'agent-1', data: { newModel: 'gpt-5.4-mini' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { content: 'Child response' } },
			{ type: 'user.message', id: 'next-parent-turn', data: { content: 'Continue' } },
		]));

		assert.deepStrictEqual({
			parentModels: turns.map(turn => turn.message.model),
			childModel: subagentTurnsByToolCallId.get('tc-task')?.[0].message.model,
			childUsage: subagentTurnsByToolCallId.get('tc-task')?.[0].usage,
		}, {
			parentModels: [{ id: 'gpt-5.5' }, { id: 'gpt-5.5' }],
			childModel: { id: 'gpt-5.4-mini' },
			childUsage: { model: 'gpt-5.4-mini', _meta: {} },
		});
	});

	test('task_complete without a summary renders nothing', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'All set.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'task_complete', arguments: {} } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.Markdown, content: 'All set.' },
		]);
	});

	test('restored completed task_complete is not marked interrupted', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-task-complete', data: { interactionId: 'm1', content: 'finish the task' } },
			{ type: 'assistant.turn_start', data: { turnId: 'sdk-turn' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'All done.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete' }] } },
			{ type: 'assistant.turn_end', data: { turnId: 'sdk-turn' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'task_complete', arguments: {} } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), {
			interruptedTurnError: { errorType: 'executionInterrupted', message: 'interrupted' },
		});

		assert.deepStrictEqual({
			state: turns[0].state,
			error: getErrorResponsePart(turns[0]),
		}, {
			state: TurnState.Complete,
			error: undefined,
		});
	});

	test('restores an unfinished request as a resumable error on the same turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'interrupted-turn', data: { interactionId: 'm1', content: 'Keep working' } },
			{ type: 'assistant.turn_start', data: { turnId: 'sdk-turn' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'Partial response' } },
		];
		const interruptedTurnError = {
			errorType: 'executionInterrupted',
			message: 'The agent was interrupted before this request finished.',
		};

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), { interruptedTurnError });

		assert.deepStrictEqual({
			turnCount: turns.length,
			id: turns[0].id,
			state: turns[0].state,
			errorPart: getErrorResponsePart(turns[0]),
		}, {
			turnCount: 1,
			id: 'interrupted-turn',
			state: TurnState.Error,
			errorPart: {
				kind: ResponsePartKind.Error,
				error: interruptedTurnError,
				resumable: true,
			},
		});
	});

	test('restores a continued failed request as one completed turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', timestamp: '2026-08-11T00:00:00.000Z', data: { interactionId: 'm1', content: 'Keep working' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:00:00.100Z', data: { turnId: 'sdk-turn-1' } },
			{ type: 'session.error', timestamp: '2026-08-11T00:00:02.000Z', data: { errorType: 'requestFailed', message: 'First failure' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:10:00.000Z', data: { turnId: 'sdk-turn-2' } },
			{ type: 'assistant.message', timestamp: '2026-08-11T00:10:03.000Z', data: { messageId: 'm2', content: 'Finished response' } },
			{ type: 'assistant.turn_end', timestamp: '2026-08-11T00:10:03.000Z', data: { turnId: 'sdk-turn-2' } },
			{ type: 'session.idle', timestamp: '2026-08-11T00:10:03.000Z', data: {} },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			state: turn.state,
			duration: turn.duration,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'turn-1',
			state: TurnState.Complete,
			duration: 5000,
			parts: [
				{ kind: ResponsePartKind.Error },
				{ kind: ResponsePartKind.Markdown, content: 'Finished response' },
			],
		}]);
	});

	test('excludes host downtime when an interrupted execution resumes and is interrupted again', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', timestamp: '2026-08-11T00:00:00.000Z', data: { interactionId: 'm1', content: 'Keep working' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:00:00.100Z', data: { turnId: 'sdk-turn-1' } },
			{ type: 'assistant.message', timestamp: '2026-08-11T00:00:02.000Z', data: { messageId: 'm2', content: 'First segment' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:10:00.000Z', data: { turnId: 'sdk-turn-2' } },
			{ type: 'assistant.message', timestamp: '2026-08-11T00:10:03.000Z', data: { messageId: 'm3', content: 'Second segment' } },
		];
		const interruptedTurnError = {
			errorType: 'executionInterrupted',
			message: 'The agent was interrupted before this request finished.',
		};

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), { interruptedTurnError });

		assert.deepStrictEqual({
			duration: turns[0].duration,
			state: turns[0].state,
			parts: partKinds(turns[0].responseParts),
			resumable: getErrorResponsePart(turns[0])?.resumable,
		}, {
			duration: 5000,
			state: TurnState.Error,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'First segment' },
				{ kind: ResponsePartKind.Markdown, content: 'Second segment' },
				{ kind: ResponsePartKind.Error },
			],
			resumable: true,
		});
	});

	test('keeps a resumable error terminal when a later notification starts another turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'failed-turn', timestamp: '2026-08-11T00:00:00.000Z', data: { interactionId: 'm1', content: 'Start the background agent' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:00:00.100Z', data: { turnId: 'sdk-turn-1' } },
			{ type: 'session.error', timestamp: '2026-08-11T00:00:02.000Z', data: { errorType: 'requestFailed', message: 'First failure' } },
			{
				type: 'system.notification',
				id: 'notification-turn',
				timestamp: '2026-08-11T00:10:00.000Z',
				data: {
					content: '<system_notification>\nAgent completed\n</system_notification>',
					kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose' },
				},
			},
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:10:00.100Z', data: { turnId: 'sdk-turn-2' } },
			{ type: 'assistant.message', timestamp: '2026-08-11T00:10:01.000Z', data: { messageId: 'm2', content: 'The background agent finished.' } },
			{ type: 'assistant.turn_end', timestamp: '2026-08-11T00:10:01.000Z', data: { turnId: 'sdk-turn-2' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'failed-turn',
			message: { text: 'Start the background agent', origin: { kind: MessageKind.User } },
			state: TurnState.Error,
			parts: [{ kind: ResponsePartKind.Error }],
		}, {
			id: 'notification-turn',
			message: { text: 'Background agent `general-purpose` is complete', origin: { kind: MessageKind.SystemNotification } },
			state: TurnState.Complete,
			parts: [{ kind: ResponsePartKind.Markdown, content: 'The background agent finished.' }],
		}]);
		assert.strictEqual(getErrorResponsePart(turns[0])?.resumable, true);
	});

	test('keeps a resumable error as the final part when a late tool completion arrives', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'failed-turn', data: { interactionId: 'm1', content: 'Run a command' } },
			{ type: 'assistant.turn_start', data: { turnId: 'sdk-turn-1' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo hi' } } },
			{ type: 'session.error', data: { errorType: 'requestFailed', message: 'First failure' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'hi\n' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			state: turns[0].state,
			parts: partKinds(turns[0].responseParts),
			resumable: getErrorResponsePart(turns[0])?.resumable,
		}, {
			state: TurnState.Error,
			parts: [{ kind: ResponsePartKind.Error }],
			resumable: true,
		});
	});

	test('fallback task_complete marks the turn complete', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'finish the task' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'All done.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete', arguments: { summary: 'Finished.' } }] } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'All done.' },
				{ kind: ResponsePartKind.Markdown, content: '\n\n**Task completed:**\n\nFinished.' },
			],
		}]);
	});

	test('a regular tool still renders as a tool call', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo hi' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'hi\n' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.ToolCall },
		]);
	});

	for (const { withStart, toolTitle, displayName } of [
		{ withStart: true, toolTitle: 'Read issue', displayName: 'Read issue' },
		{ withStart: false, toolTitle: 'Read issue', displayName: 'Read issue' },
		{ withStart: true, toolTitle: undefined, displayName: 'issue_read' },
	]) {
		test(`restores MCP tool labels with title=${toolTitle} and execution_start=${withStart}`, async () => {
			const toolName = 'io-github-github-github-mcp-server-issue_read';
			const events: ISessionEvent[] = [
				{ type: 'user.message', data: { interactionId: 'm1', content: 'Read the issue' } },
				{
					type: 'assistant.message',
					data: {
						messageId: 'm2',
						content: '',
						toolRequests: [{
							toolCallId: 'tc-mcp',
							name: toolName,
							toolTitle,
							mcpServerName: 'GitHub',
							mcpToolName: 'issue_read',
							arguments: { issue_number: 123 },
						}],
					},
				},
			];
			if (withStart) {
				events.push({
					type: 'tool.execution_start',
					data: {
						toolCallId: 'tc-mcp',
						toolName,
						mcpServerName: 'GitHub',
						mcpToolName: 'issue_read',
						arguments: { issue_number: 123 },
					},
				});
			}
			events.push({ type: 'tool.execution_complete', data: { toolCallId: 'tc-mcp', success: true, result: { content: 'Issue details' } } });

			const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));
			const part = turns[0].responseParts[0];
			assert.ok(part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed);
			assert.deepStrictEqual({
				toolName: part.toolCall.toolName,
				displayName: part.toolCall.displayName,
				invocationMessage: part.toolCall.invocationMessage,
				pastTenseMessage: part.toolCall.pastTenseMessage,
				meta: readToolCallMeta(part.toolCall),
			}, {
				toolName,
				displayName,
				invocationMessage: displayName,
				pastTenseMessage: displayName,
				meta: { mcpServerName: 'GitHub', mcpToolName: 'issue_read' },
			});
		});
	}

	test('resolves relative patch links in restored tool messages', async () => {
		const patch = [
			'*** Begin Patch',
			'*** Update File: src/file.ts',
			'@@',
			'-old',
			'+new',
			'*** End Patch',
		].join('\n');
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'edit the file' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'apply_patch' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'apply_patch', arguments: patch } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), { workingDirectory: URI.file('/workspace') });
		const part = turns[0].responseParts.find(part => part.kind === ResponsePartKind.ToolCall) as ToolCallResponsePart | undefined;
		assert.ok(part);
		assert.deepStrictEqual({
			invocationMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.invocationMessage : undefined,
			pastTenseMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.pastTenseMessage : undefined,
		}, {
			invocationMessage: { markdown: 'Edit [file.ts](file:///workspace/src/file.ts)' },
			pastTenseMessage: { markdown: 'Edit [file.ts](file:///workspace/src/file.ts)' },
		});
	});

	for (const scheme of ['copilot', 'ahp-session']) {
		test(`restores MCP app data for completed tool calls on ${scheme} resources`, async () => {
			const structuredContent = { titleId: 'example-title', branding: null };
			const events: ISessionEvent[] = [
				{ type: 'user.message', data: { interactionId: 'm1', content: 'call an MCP app tool' } },
				{
					type: 'assistant.message',
					data: {
						messageId: 'm2',
						content: '',
						toolRequests: [{
							toolCallId: 'tc-1',
							name: 'GitHub-get_me',
							arguments: {},
							type: 'function',
							mcpServerName: 'GitHub',
							mcpToolName: 'get_me',
						}],
					},
				},
				{
					type: 'tool.execution_start',
					data: {
						toolCallId: 'tc-1',
						toolName: 'GitHub-get_me',
						arguments: {},
						mcpServerName: 'GitHub',
						mcpToolName: 'get_me',
						toolDescription: {
							_meta: {
								ui: {
									resourceUri: 'ui://github-mcp-server/get-me',
								},
							},
						},
					},
				},
				{
					type: 'tool.execution_complete',
					data: {
						toolCallId: 'tc-1',
						success: true,
						result: { content: 'Opened the accent-color editor.', structuredContent },
					},
				},
			];

			const owner = AgentSession.uri(scheme, 'test-session');
			const providerId = scheme === 'ahp-session' ? 'copilotcli' : scheme;
			const chatUri = URI.parse(buildChatUri(owner, 'restored-chat'));
			const sdkConversationUri = URI.parse('copilot-sdk:/conversation-123');
			const { turns } = await mapSessionEventsWithRouting(sdkConversationUri, undefined, toSessionEvents(events), chatUri, owner);

			const part = turns[0].responseParts[0] as ToolCallResponsePart;
			assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
			assert.deepStrictEqual({
				contributor: part.toolCall.contributor,
				meta: readToolCallMeta(part.toolCall),
				structuredContent: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.structuredContent : undefined,
			}, {
				contributor: {
					kind: ToolCallContributorKind.MCP,
					customizationId: `mcp-top-level:${providerId}:test-session:GitHub`,
				},
				meta: {
					mcpServerName: 'GitHub',
					mcpToolName: 'get_me',
					ui: {
						resourceUri: 'ui://github-mcp-server/get-me',
						channel: `mcp://${providerId}/${encodeURIComponent(chatUri.toString())}/GitHub`,
					},
				},
				structuredContent,
			});
		});
	}

	for (const withStart of [true, false]) {
		test(`restores SDK intention summaries with execution_start=${withStart}`, async () => {
			const requests = [
				{ toolCallId: 'tc-bash', name: 'bash', intentionSummary: '  List project files \n', arguments: { command: 'ls', description: 'Fallback' } },
				{ toolCallId: 'tc-powershell', name: 'powershell', intentionSummary: 'Inspect the directory', arguments: { command: 'Get-ChildItem' } },
				{ toolCallId: 'tc-view', name: 'view', intentionSummary: 'Understand the entry point', arguments: { path: '/repo/file.ts' } },
				{ toolCallId: 'tc-blank', name: 'bash', intentionSummary: ' \n', arguments: { command: 'ls', description: 'Fallback' } },
				{ toolCallId: 'tc-absent', name: 'view', arguments: { path: '/repo/file.ts' } },
			];
			const events: ISessionEvent[] = [
				{ type: 'user.message', data: { content: 'Inspect the project' } },
				{ type: 'assistant.message', data: { messageId: 'm1', content: '', toolRequests: requests } },
			];
			for (const request of requests) {
				if (withStart) {
					events.push({
						type: 'tool.execution_start',
						data: { toolCallId: request.toolCallId, toolName: request.name, arguments: request.arguments },
					});
				}
				events.push({ type: 'tool.execution_complete', data: { toolCallId: request.toolCallId, success: true } });
			}

			const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));
			assert.deepStrictEqual(turns[0].responseParts
				.filter(part => part.kind === ResponsePartKind.ToolCall)
				.map(part => ({ toolCallId: part.toolCall.toolCallId, intention: part.toolCall.intention })), [
				{ toolCallId: 'tc-bash', intention: 'List project files' },
				{ toolCallId: 'tc-powershell', intention: 'Inspect the directory' },
				{ toolCallId: 'tc-view', intention: 'Understand the entry point' },
				{ toolCallId: 'tc-blank', intention: 'Fallback' },
				{ toolCallId: 'tc-absent', intention: undefined },
			]);
		});
	}

	test('derives shell tool intention from the description argument on replay', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'ls', description: 'List files in the repo root' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'a\nb\n' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
		assert.ok(part.toolCall.status === ToolCallStatus.Completed);
		assert.deepStrictEqual({
			intention: part.toolCall.intention,
			toolInput: part.toolCall.toolInput,
		}, {
			intention: 'List files in the repo root',
			toolInput: JSON.stringify({ command: 'ls', description: 'List files in the repo root' }, null, 2),
		});
	});

	test('restores successive image batches at SDK round boundaries without intervening text', async () => {
		const events: ISessionEvent[] = [{ type: 'user.message', data: { content: 'Generate fifteen images.' } }];
		for (const [round, count] of [5, 5, 6].entries()) {
			const turnId = `sdk-${round}`;
			const toolRequests = Array.from({ length: count }, (_, index) => ({ toolCallId: `image-${round}-${index}`, name: 'image_generation' }));
			events.push(
				{ type: 'assistant.turn_start', data: { turnId } },
				{ type: 'assistant.message', data: { turnId, messageId: `message-${round}`, content: '', toolRequests } },
			);
			for (const request of toolRequests) {
				events.push(
					{ type: 'tool.execution_start', data: { turnId, toolCallId: request.toolCallId, toolName: request.name } },
					{ type: 'tool.execution_complete', data: { toolCallId: request.toolCallId, success: true } },
				);
			}
			events.push(
				{ type: 'assistant.turn_end', data: { turnId: 'different-sdk-round' } },
				{ type: 'assistant.turn_end', data: { turnId } },
			);
		}
		events.push(
			{ type: 'assistant.turn_start', data: { turnId: 'non-image-round' } },
			{ type: 'tool.execution_start', data: { turnId: 'non-image-round', toolCallId: 'read', toolName: 'view' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'read', success: true } },
			{ type: 'assistant.turn_end', data: { turnId: 'non-image-round' } },
		);
		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		let imageCount = 0;
		const boundaries: number[] = [];
		for (const part of turns[0].responseParts) {
			if (part.kind === ResponsePartKind.ToolCall && part.toolCall.toolName === 'image_generation') {
				imageCount++;
			} else if (part.kind === ResponsePartKind.SystemNotification && readAgentSystemNotificationMeta(part).kind === AgentSystemNotificationKind.ResponseRoundEnded) {
				boundaries.push(imageCount);
			}
		}
		assert.deepStrictEqual({ turns: turns.length, imageCount, boundaries }, { turns: 1, imageCount: 16, boundaries: [5, 10, 16] });
	});

	test('restores image function tools before the final answer', async () => {
		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'user.message', data: { content: 'Draw a puppy.' } },
			{ type: 'assistant.message', data: { messageId: 'image-request', content: 'I will create an image.', toolRequests: [{ toolCallId: 'image-1', name: 'image_generation' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'image-1', toolName: 'image_generation', arguments: { prompt: 'Draw a puppy' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'image-1', success: true, result: { contents: [{ type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }] } } },
			{ type: 'assistant.message', data: { messageId: 'image-result', content: 'Image generation completed.' } },
		]));

		assert.deepStrictEqual(turns[0].responseParts.map(part => {
			if (part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed) {
				return { kind: part.kind, toolCallId: part.toolCall.toolCallId, success: part.toolCall.success };
			}
			return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
		}), [
			{ kind: ResponsePartKind.Markdown, content: 'I will create an image.' },
			{ kind: ResponsePartKind.ToolCall, toolCallId: 'image-1', success: true },
			{ kind: ResponsePartKind.Markdown, content: 'Image generation completed.' },
		]);
	});

	test('replays UI output and binary assets without duplicating structured images', async () => {
		const asset = { type: 'image' as const, assetId: 'asset-1', data: 'aW1hZ2U=', mimeType: 'image/png', byteLength: 5 };
		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'session.binary_asset', data: asset },
			{ type: 'user.message', data: { content: 'Inspect the image' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-image', toolName: 'view', arguments: { path: '/repo/image.png' } } },
			{
				type: 'tool.execution_complete', data: {
					toolCallId: 'tc-image', success: true, result: {
						content: 'Short result', detailedContent: 'Complete result for the UI',
						binaryResultsForLlm: [{ type: 'image', assetId: asset.assetId, byteLength: 5, mimeType: 'image/png' }],
					}
				}
			},
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-mcp', toolName: 'mcp_tool' } },
			{
				type: 'tool.execution_complete', data: {
					toolCallId: 'tc-mcp', success: true, result: {
						content: 'Summary', contents: [
							{ type: 'text', text: 'Structured text' },
							{ type: 'image', data: asset.data, mimeType: 'image/png' },
						],
						binaryResultsForLlm: [{ type: 'image', data: asset.data, mimeType: 'image/png' }],
					}
				}
			},
		]));
		assert.deepStrictEqual(turns[0].responseParts.flatMap(part =>
			part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? [part.toolCall.content] : []), [
			[
				{ type: ToolResultContentType.Text, text: 'Complete result for the UI' },
				{ type: ToolResultContentType.EmbeddedResource, data: asset.data, contentType: 'image/png' },
			],
			[
				{ type: ToolResultContentType.Text, text: 'Summary' },
				{ type: ToolResultContentType.Text, text: 'Structured text' },
				{ type: ToolResultContentType.EmbeddedResource, data: asset.data, contentType: 'image/png' },
			],
		]);
	});

	test('maps SDK image content to an embedded resource on replayed tool completion', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'view the image' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'view_image' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'view_image', arguments: { path: '/repo/image.png' } } },
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: {
						content: 'Viewed image file successfully.',
						contents: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
		if (part.toolCall.status !== ToolCallStatus.Completed) { return; }
		assert.deepStrictEqual(part.toolCall.content, [
			{ type: ToolResultContentType.Text, text: 'Viewed image file successfully.' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'iVBORw0KGgo=', contentType: 'image/png' },
		]);
	});

	for (const hasContents of [false, true]) {
		test(`restores stored MCP resource references with completion-only server metadata ${hasContents ? 'without duplicating SDK contents' : 'when SDK contents are absent'}`, async () => {
			const database = new TestSessionDatabase();
			await database.createTurn('turn-1');
			await database.storeToolResultResources('turn-1', 'tc-resources', [
				{ ordinal: 3, kind: 'link', name: 'Linked.txt', uri: 'demo:/linked', mimeType: 'text/plain', size: 10 },
				{ ordinal: 1, kind: 'embedded', name: 'a\\b', uri: 'demo:/a\\b', mimeType: 'text/plain', size: 8, content: VSBuffer.fromString('Document').buffer },
				{ ordinal: 2, kind: 'embedded', name: 'Image.png', uri: 'demo:/Image.png', mimeType: 'image/png', size: 5, content: VSBuffer.fromString('image').buffer },
			]);
			const { turns } = await mapSessionEvents(session, database, toSessionEvents([
				{ type: 'user.message', data: { content: 'Read resources' } },
				{ type: 'tool.execution_start', data: { toolCallId: 'tc-resources', toolName: 'read-resources' } },
				{
					type: 'tool.execution_complete', data: {
						toolCallId: 'tc-resources', success: true, mcpServerName: 'everything', result: {
							content: 'Summary',
							...(hasContents ? {
								contents: [
									{ type: 'shell_exit', shellId: '0', exitCode: 0 },
									{ type: 'resource', resource: { uri: 'demo:/a\\b', text: 'Document' } },
									{ type: 'resource', resource: { uri: 'demo:/Image.png', blob: 'aW1hZ2U=' } },
									{ type: 'resource_link', uri: 'demo:/linked', name: 'Linked.txt', mimeType: 'text/plain', size: 10 },
								]
							} : {}),
						}
					}
				},
			]));
			const channel = buildMcpChannel(URI.parse(buildChatUri(session, 'default')), 'everything', 'copilot');
			assert.deepStrictEqual(turns[0].responseParts.flatMap(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.content : []), [
				{ type: ToolResultContentType.Text, text: 'Summary' },
				{ type: ToolResultContentType.Resource, uri: buildToolResultResourceUri(session.toString(), 'tc-resources', 1, 'a\\b'), contentType: 'text/plain', sizeHint: 8 },
				{ type: ToolResultContentType.Resource, uri: buildToolResultResourceUri(session.toString(), 'tc-resources', 2, 'Image.png'), contentType: 'image/png', sizeHint: 5 },
				{ type: ToolResultContentType.Resource, uri: buildMcpResourceUri(channel, 'demo:/linked', 'Linked.txt'), contentType: 'text/plain', sizeHint: 10 },
			]);
		});
	}

	test('keeps unmatched SDK resources inline on replay', async () => {
		const database = new TestSessionDatabase();
		await database.createTurn('turn-1');
		await database.storeToolResultResources('turn-1', 'tc-resources', [
			{ ordinal: 0, kind: 'embedded', name: 'Document.txt', uri: 'demo:/document', mimeType: 'text/plain', size: 8, content: VSBuffer.fromString('Document').buffer },
		]);
		const { turns } = await mapSessionEvents(session, database, toSessionEvents([
			{ type: 'user.message', data: { content: 'Read resources' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-resources', toolName: 'read-resources' } },
			{
				type: 'tool.execution_complete', data: {
					toolCallId: 'tc-resources', success: true, result: {
						content: 'Summary',
						contents: [
							{ type: 'text', text: 'Summary' },
							{ type: 'resource', resource: { uri: 'demo:/document', text: 'Document' } },
							{ type: 'resource', resource: { uri: 'demo:/image', blob: 'aW1hZ2U=', mimeType: 'image/png' } },
						],
					},
				},
			},
		]));
		assert.deepStrictEqual(turns[0].responseParts.flatMap(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.content : []), [
			{ type: ToolResultContentType.Text, text: 'Summary' },
			{ type: ToolResultContentType.Text, text: 'Document' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'aW1hZ2U=', contentType: 'image/png' },
		]);
	});

	test('does not advertise opaque SDK resource links as readable host content on replay', async () => {
		const uri = 'generated-images:/session/generated-image.png?version=1';
		const imageGeneration = { requestedModel: { id: 'image-preview', name: 'Image Preview' } };
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'Draw a puppy' } },
			{ type: 'tool.execution_start', timestamp: '2026-10-08T12:00:00.000Z', data: { toolCallId: 'tc-image', toolName: 'image_generation' } },
			{
				type: 'tool.execution_complete',
				timestamp: '2026-10-08T12:00:43.500Z',
				data: {
					toolCallId: 'tc-image',
					success: true,
					result: {
						content: 'Generated an image.',
						structuredContent: { imageGeneration },
						contents: [{ type: 'resource_link', uri, name: 'generated-image.png', mimeType: 'image/png', size: 128 }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const part = turns[0].responseParts[0];
		assert.ok(part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed);
		assert.deepStrictEqual({
			content: part.toolCall.content,
			title: part.toolCall.pastTenseMessage,
			meta: part.toolCall._meta,
		}, {
			content: [
				{ type: ToolResultContentType.Text, text: 'Generated an image.' },
			],
			title: 'Generated image with Image Preview',
			meta: { 'vscode.imageGeneration': imageGeneration, 'vscode.toolCallDurationMs': 43_500 },
		});
	});

	test('restores original generated images without model-facing copies', async () => {
		const modelCopy = { type: 'image' as const, assetId: 'model-copy', data: 'bW9kZWwtY29weQ==', mimeType: 'image/png', byteLength: 10 };
		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'session.binary_asset', data: modelCopy },
			{ type: 'user.message', data: { content: 'Generate two images.' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'images', toolName: 'image_generation' } },
			{
				type: 'tool.execution_complete', data: {
					toolCallId: 'images', success: true, result: {
						content: 'Generated images.',
						structuredContent: { imageGeneration: { images: [{ contentIndex: 0, mimeType: 'image/png' }, { contentIndex: 1, mimeType: 'image/png' }] } },
						contents: [
							{ type: 'image', data: 'original-one', mimeType: 'image/png' },
							{ type: 'image', data: 'original-two', mimeType: 'image/png' },
							{ type: 'image', data: 'model-copy-one', mimeType: 'image/png' },
							{ type: 'image', data: 'model-copy-two', mimeType: 'image/png' },
						],
						binaryResultsForLlm: [
							{ type: 'image', data: 'inline-model-copy', mimeType: 'image/png' },
							{ type: 'image', assetId: modelCopy.assetId, mimeType: modelCopy.mimeType, byteLength: modelCopy.byteLength },
						],
					},
				}
			},
		]));
		const part = turns[0].responseParts[0];
		assert.ok(part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed);
		assert.deepStrictEqual(part.toolCall.content, [
			{ type: ToolResultContentType.Text, text: 'Generated images.' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'original-one', contentType: 'image/png' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'original-two', contentType: 'image/png' },
		]);
	});

	for (const success of [false, true]) {
		test(`restores image usage independently of result success (${success})`, async () => {
			const usage = { requestId: 'charged-image', inputTokens: 21, outputTokens: 196, copilotUsage: { totalNanoAiu: 598_500_000 } };
			const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
				{ type: 'user.message', data: { content: 'Generate an image.' } },
				{ type: 'tool.execution_start', data: { toolCallId: 'image', toolName: 'image_generation' } },
				{
					type: 'tool.execution_complete',
					data: {
						toolCallId: 'image', success,
						toolUsage: { ...usage, model: 'image-model' },
						...(success ? { result: { content: 'Generated image.' } } : { error: { message: 'Image decoding failed.' } }),
					},
				},
			]));
			const part = turns[0].responseParts[0];
			assert.ok(part.kind === ResponsePartKind.ToolCall);
			assert.deepStrictEqual(part.toolCall._meta?.['vscode.imageGeneration'], { requestedModel: { id: 'image-model' }, usage });
		});
	}

	test('maps SDK shell_exit full output to terminal completion on replay', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo hi' } } },
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: {
						content: 'Saved to: /tmp/artifact-b.txt',
						contents: [{ type: 'shell_exit', shellId: '0', exitCode: 0, cwd: '/repo', outputPreview: 'hi\n', outputTruncated: true, outputFilePath: '/tmp/artifact-a.txt' }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
		assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
		if (part.toolCall.status !== ToolCallStatus.Completed) { return; }
		assert.deepStrictEqual(part.toolCall.content, [
			{ type: ToolResultContentType.Text, text: 'Saved to: /tmp/artifact-b.txt' },
			{
				type: ToolResultContentType.Terminal,
				resource: buildNonPtyShellTerminalUri(session, session, URI.parse(buildChatUri(session, 'default')), 'tc-1'),
				title: 'Run Shell Command',
				isPty: false,
				result: { exitCode: 0, preview: 'hi\n', truncated: true },
			},
		]);
	});

	test('does not classify read_bash shell_exit metadata as a terminal completion on replay', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'read_bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'read_bash', arguments: { shellId: 'build', delay: 0 } } },
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: {
						content: 'Build completed\n',
						contents: [{ type: 'shell_exit', shellId: 'build', exitCode: 0, outputPreview: 'Build completed\n', outputFilePath: '/tmp/read-shell-output.txt' }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
		if (part.toolCall.status !== ToolCallStatus.Completed) { return; }
		assert.deepStrictEqual({
			toolKind: readToolCallMeta(part.toolCall).toolKind,
			pastTenseMessage: part.toolCall.pastTenseMessage,
			content: part.toolCall.content,
		}, {
			toolKind: undefined,
			pastTenseMessage: 'Read Terminal',
			content: [{ type: ToolResultContentType.Text, text: 'Build completed\n' }],
		});
	});

	test('preserves non-zero terminal completion even when SDK tool completion succeeded', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'gti status' } } },
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: {
						content: 'command not found\n',
						contents: [{ type: 'shell_exit', shellId: '0', exitCode: 127, cwd: '/repo' }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
		assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
		if (part.toolCall.status !== ToolCallStatus.Completed) { return; }
		assert.strictEqual(part.toolCall.success, true);
		assert.deepStrictEqual(part.toolCall.content?.find(content => content.type === ToolResultContentType.Terminal), {
			type: ToolResultContentType.Terminal,
			resource: buildNonPtyShellTerminalUri(session, session, URI.parse(buildChatUri(session, 'default')), 'tc-1'),
			title: 'Run Shell Command',
			isPty: false,
			result: { exitCode: 127 },
		});
	});

	test('restores best-effort model, fallback agent, and attachments onto user messages', async () => {
		const events: ISessionEvent[] = [
			{ type: 'session.model_change', data: { newModel: 'opus-4.7' } },
			{ type: 'subagent.selected', data: { agentName: 'reviewer', agentDisplayName: 'Reviewer', tools: null } },
			{
				type: 'user.message',
				data: {
					interactionId: 'm1',
					content: 'hi',
					attachments: [{
						type: 'file',
						path: '/tmp/example.ts',
						displayName: 'example.ts',
					}],
				}
			},
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'hello' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), {
			model: { id: 'fallback-model' },
			agent: { uri: 'fallback-agent' },
		});

		assert.deepStrictEqual({
			model: turns[0].message.model,
			agent: turns[0].message.agent,
			attachments: turns[0].message.attachments?.map(a => ({
				type: a.type,
				uri: a.type === MessageAttachmentKind.Resource ? a.uri : undefined,
				label: a.label,
			})),
		}, {
			model: { id: 'opus-4.7' },
			agent: { uri: 'fallback-agent' },
			attachments: [{
				type: MessageAttachmentKind.Resource,
				uri: 'file:///tmp/example.ts',
				label: 'example.ts',
			}],
		});
	});

	test('restores blob attachments with base64, data URLs, and unencoded legacy text without throwing', async () => {
		const encodedText = encodeBase64(VSBuffer.fromString('Repository name: vscode\nOwner: microsoft'));
		const controlCharacterText = 'a\x1Fb\x00c\x1Ed';
		const events: ISessionEvent[] = [
			{
				type: 'user.message',
				data: {
					interactionId: 'm1',
					content: 'inspect attachments',
					attachments: [
						{
							type: 'blob',
							mimeType: 'text/plain; x-vscode-display-kind=workspace',
							displayName: 'microsoft/vscode',
							data: encodedText,
						},
						{
							type: 'blob',
							mimeType: 'text/plain',
							displayName: 'raw-space',
							data: 'Repository name: vscode',
						},
						{
							type: 'blob',
							mimeType: 'text/plain',
							displayName: 'raw-colon',
							data: 'https://github.com/microsoft/vscode',
						},
						{
							type: 'blob',
							mimeType: 'text/plain',
							displayName: 'data-url-b64',
							data: `data:text/plain;base64,${encodedText}`,
						},
						...['README', 'a=b', '=', '==', 'abcd='].map(data => ({
							type: 'blob' as const,
							mimeType: 'text/plain',
							displayName: `raw-${data}`,
							data,
						})),
						{
							type: 'blob',
							mimeType: 'text/plain',
							displayName: 'bom-and-ansi',
							data: encodeBase64(VSBuffer.fromString('\uFEFF\x1b[31mred\x1b[0m')),
						},
						{
							type: 'blob',
							mimeType: 'text/plain',
							displayName: 'control-characters',
							data: encodeBase64(VSBuffer.fromString(controlCharacterText)),
						},
						{
							type: 'blob',
							mimeType: 'text/plain',
							displayName: 'data-url-control-characters',
							data: `data:text/plain;base64,${encodeBase64(VSBuffer.fromString(controlCharacterText))}`,
						},
						{
							type: 'blob',
							mimeType: 'image/png',
							displayName: 'screenshot.png',
							data: 'data:image/png;base64,iVBORw0KGgo=\r\n',
						},
						...[['wrapped.bin', 'AAEC\r\nAwQ='], ['raw-not-base64.bin', 'not base64'], ['raw-spaced.bin', 'abcd efgh']].map(([displayName, data]) => ({
							type: 'blob' as const,
							mimeType: 'application/octet-stream',
							displayName,
							data,
						})),
					],
				},
			},
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'done' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns[0].message.attachments, [
			{
				type: MessageAttachmentKind.Simple,
				label: 'microsoft/vscode',
				modelRepresentation: 'Repository name: vscode\nOwner: microsoft',
				displayKind: 'workspace',
			},
			{
				type: MessageAttachmentKind.Simple,
				label: 'raw-space',
				modelRepresentation: 'Repository name: vscode',
			},
			{
				type: MessageAttachmentKind.Simple,
				label: 'raw-colon',
				modelRepresentation: 'https://github.com/microsoft/vscode',
			},
			{
				type: MessageAttachmentKind.Simple,
				label: 'data-url-b64',
				modelRepresentation: 'Repository name: vscode\nOwner: microsoft',
			},
			...['README', 'a=b', '=', '==', 'abcd='].map(data => ({
				type: MessageAttachmentKind.Simple,
				label: `raw-${data}`,
				modelRepresentation: data,
			})),
			{
				type: MessageAttachmentKind.Simple,
				label: 'bom-and-ansi',
				modelRepresentation: '\uFEFF\x1b[31mred\x1b[0m',
			},
			{
				type: MessageAttachmentKind.Simple,
				label: 'control-characters',
				modelRepresentation: controlCharacterText,
			},
			{
				type: MessageAttachmentKind.Simple,
				label: 'data-url-control-characters',
				modelRepresentation: controlCharacterText,
			},
			{
				type: MessageAttachmentKind.EmbeddedResource,
				label: 'screenshot.png',
				data: 'iVBORw0KGgo=',
				contentType: 'image/png',
				displayKind: 'image',
			},
			...[['wrapped.bin', 'AAECAwQ='], ['raw-not-base64.bin', 'not base64'], ['raw-spaced.bin', 'abcd efgh']].map(([label, data]) => ({
				type: MessageAttachmentKind.EmbeddedResource,
				label,
				data,
				contentType: 'application/octet-stream',
				displayKind: undefined,
			})),
		]);
	});

	test('seeds the model from session.start selectedModel when no launch model is supplied', async () => {
		const events: ISessionEvent[] = [
			{ type: 'session.start', data: { selectedModel: 'opus-5' } },
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'hello' } },
			{ type: 'user.message', data: { interactionId: 'm3', content: 'again' } },
			{ type: 'session.model_change', data: { newModel: 'gpt-5' } },
			{ type: 'user.message', data: { interactionId: 'm4', content: 'switched' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(t => t.message.model), [
			{ id: 'opus-5' },
			{ id: 'opus-5' },
			{ id: 'gpt-5' },
		]);
	});

	test('uses top-level user messages as turn boundaries', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event-1', data: { interactionId: 'interaction-1', content: 'Investigate this issue' } },
			{ type: 'assistant.message', id: 'initial-round', data: { interactionId: 'interaction-1', content: 'I found a likely cause.', toolRequests: [] } },
			{ type: 'assistant.message', id: 'tool-round', data: { interactionId: 'interaction-2', content: 'I will verify it.', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo investigating' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'investigating\n' } } },
			{ type: 'assistant.message', id: 'empty-round', data: { interactionId: 'interaction-2', content: '', toolRequests: [], reasoningOpaque: 'opaque-reasoning' } },
			{ type: 'assistant.message', id: 'final-round', data: { interactionId: 'interaction-2', content: 'Investigation complete.', toolRequests: [] } },
			{ type: 'user.message', id: 'user-event-2', data: { interactionId: 'interaction-3', content: 'Thanks' } },
			{ type: 'assistant.message', id: 'acknowledgement', data: { interactionId: 'interaction-3', content: 'You are welcome.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [
			{
				id: 'user-event-1',
				message: 'Investigate this issue',
				state: TurnState.Complete,
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'I found a likely cause.' },
					{ kind: ResponsePartKind.Markdown, content: 'I will verify it.' },
					{ kind: ResponsePartKind.ToolCall },
					{ kind: ResponsePartKind.Markdown, content: 'Investigation complete.' },
				],
			},
			{
				id: 'user-event-2',
				message: 'Thanks',
				state: TurnState.Complete,
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'You are welcome.' },
				],
			},
		]);
	});

	test('restores a system notification inside an assistant turn as a response part', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Wait for the background command' } },
			{ type: 'assistant.turn_start', data: { turnId: '0', interactionId: 'interaction-1' } },
			{
				type: 'system.notification',
				id: 'notification-event',
				data: {
					content: '<system_notification>\nShell command completed\n</system_notification>',
					kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
				},
			},
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'Reading the output now.', toolRequests: [] } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			message: { text: 'Wait for the background command', origin: { kind: MessageKind.User } },
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.SystemNotification, content: '`sleep 6` completed' },
				{ kind: ResponsePartKind.Markdown, content: 'Reading the output now.' },
			],
		}]);
	});

	test('restores an idle system notification and resumed response in the preceding turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Start the background agent' } },
			{ type: 'assistant.turn_start', data: { turnId: '0', interactionId: 'interaction-1' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'The background agent is running.', toolRequests: [] } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
			{
				type: 'system.notification',
				id: 'notification-event',
				data: {
					content: '<system_notification>\nAgent completed\n</system_notification>',
					kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose', displayName: 'Renderer reviewer', description: 'Review the renderer' },
				},
			},
			{ type: 'assistant.turn_start', data: { turnId: '0', interactionId: 'interaction-2' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-2', content: 'Reading the background agent result.', toolRequests: [] } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			message: { text: 'Start the background agent', origin: { kind: MessageKind.User } },
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'The background agent is running.' },
				{ kind: ResponsePartKind.SystemNotification, content: 'Background agent `Review the renderer` is complete' },
				{ kind: ResponsePartKind.Markdown, content: 'Reading the background agent result.' },
			],
		}]);
	});

	test('restores reasoning on either side of a completion notification in order', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Review the results' } },
			{ type: 'assistant.turn_start', data: { turnId: '0' } },
			{ type: 'assistant.message', data: { messageId: 'before', content: '', reasoningText: 'Before notification' } },
			{
				type: 'system.notification',
				data: {
					content: 'Agent completed',
					kind: { type: 'agent_idle', agentId: 'agent-completed', agentType: 'code-review', displayName: 'Completed reviewer' },
				},
			},
			{ type: 'assistant.message', data: { messageId: 'after', content: '', reasoningText: 'After notification' } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		assert.deepStrictEqual(turns.map(turn => turn.responseParts.map(part =>
			part.kind === ResponsePartKind.Reasoning || part.kind === ResponsePartKind.SystemNotification
				? { kind: part.kind, content: part.content }
				: { kind: part.kind }
		)), [[
			{ kind: ResponsePartKind.Reasoning, content: 'Before notification' },
			{ kind: ResponsePartKind.SystemNotification, content: 'Background agent `Completed reviewer` is complete' },
			{ kind: ResponsePartKind.Reasoning, content: 'After notification' },
		]]);
	});

	test('does not restore a passive notification outside an assistant turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Check for instructions' } },
			{ type: 'assistant.turn_start', data: { turnId: '0', interactionId: 'interaction-1' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'No new instructions.', toolRequests: [] } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
			{
				type: 'system.notification',
				id: 'notification-event',
				data: {
					content: '<system_notification>\nInstruction discovered\n</system_notification>',
					kind: { type: 'instruction_discovered', sourcePath: 'AGENTS.md', triggerFile: 'src/index.ts', triggerTool: 'view', description: 'Workspace instructions' },
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			parts: [{ kind: ResponsePartKind.Markdown, content: 'No new instructions.' }],
		}]);
	});

	for (const hasPreviousTurn of [false, true]) {
		test(`restores user-invoked skills in the following request (${hasPreviousTurn ? 'follow-up' : 'first'} turn)`, async () => {
			const previousEvents: ISessionEvent[] = hasPreviousTurn ? [
				{ type: 'user.message', id: 'previous-user', data: { content: 'Previous request' } },
				{ type: 'assistant.message', data: { content: 'Previous response' } },
			] : [];
			const events: ISessionEvent[] = [
				...previousEvents,
				{ type: 'skill.invoked', id: 'user-skill', data: { name: 'publish', path: '/skills/publish/SKILL.md', content: '', trigger: 'user-invoked' } },
				{ type: 'skill.invoked', id: 'second-user-skill', data: { name: 'review', path: '/skills/review/SKILL.md', content: '', trigger: 'user-invoked' } },
				{ type: 'user.message', id: 'user-event', timestamp: '2026-10-16T18:58:31.354Z', data: { content: '/publish the SDK' } },
				{ type: 'assistant.message', data: { content: 'Publishing the SDK' } },
				{ type: 'skill.invoked', id: 'agent-skill', data: { name: 'test', path: '/skills/test/SKILL.md', content: '', trigger: 'agent-invoked' } },
				{ type: 'assistant.message', data: { content: 'Published' } },
			];

			const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

			assert.deepStrictEqual(turns.map(turn => ({
				id: turn.id,
				message: turn.message.text,
				startedAt: turn.startedAt,
				state: turn.state,
				parts: turn.responseParts.map(part => part.kind === ResponsePartKind.ToolCall
					? { kind: part.kind, toolCallId: part.toolCall.toolCallId }
					: partKinds([part])[0]),
			})), [
				...(hasPreviousTurn ? [{
					id: 'previous-user',
					message: 'Previous request',
					startedAt: undefined,
					state: TurnState.Complete,
					parts: [{ kind: ResponsePartKind.Markdown, content: 'Previous response' }],
				}] : []),
				{
					id: 'user-event',
					message: '/publish the SDK',
					startedAt: '2026-10-16T18:58:31.354Z',
					state: TurnState.Complete,
					parts: [
						{ kind: ResponsePartKind.ToolCall, toolCallId: 'synth-skill-user-skill' },
						{ kind: ResponsePartKind.ToolCall, toolCallId: 'synth-skill-second-user-skill' },
						{ kind: ResponsePartKind.Markdown, content: 'Publishing the SDK' },
						{ kind: ResponsePartKind.ToolCall, toolCallId: 'synth-skill-agent-skill' },
						{ kind: ResponsePartKind.Markdown, content: 'Published' },
					],
				},
			]);
		});
	}

	test('restores the worktree announcement below the first request with a pre-request skill', async () => {
		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'skill.invoked', id: 'user-skill', data: { name: 'publish', path: '/skills/publish/SKILL.md', content: '', trigger: 'user-invoked' } },
			{ type: 'user.message', id: 'user-event', data: { content: '/publish the SDK' } },
			{ type: 'assistant.message', data: { content: 'Published' } },
		]));
		const restored = prependAnnouncementToFirstTurn(turns, 'Created isolated worktree\n\n');

		assert.deepStrictEqual(restored.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			message: '/publish the SDK',
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'Created isolated worktree\n\n' },
				{ kind: ResponsePartKind.ToolCall },
				{ kind: ResponsePartKind.Markdown, content: 'Published' },
			],
		}]);
	});

	test('restores an initial skill without trigger metadata in the following request', async () => {
		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'skill.invoked', id: 'legacy-skill', data: { name: 'publish', path: '/skills/publish/SKILL.md', content: '' } },
			{ type: 'user.message', id: 'user-event', data: { content: '/publish the SDK' } },
			{ type: 'assistant.message', data: { content: 'Published' } },
		]));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			message: '/publish the SDK',
			parts: [
				{ kind: ResponsePartKind.ToolCall },
				{ kind: ResponsePartKind.Markdown, content: 'Published' },
			],
		}]);
	});

	test('preserves a skill invocation when history has no user message', async () => {
		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
			{ type: 'skill.invoked', id: 'user-skill', data: { name: 'publish', path: '/skills/publish/SKILL.md', content: '', trigger: 'user-invoked' } },
		]));

		assert.deepStrictEqual(turns.map(turn => ({
			message: turn.message.text,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			message: '',
			state: TurnState.Cancelled,
			parts: [{ kind: ResponsePartKind.ToolCall }],
		}]);
	});

	for (const boundary of ['abort', 'session.error'] as const) {
		for (const hasPreviousTurn of [false, true]) {
			for (const hasReplacementRequest of [false, true]) {
				test(`preserves a pending skill at ${boundary} (previous: ${hasPreviousTurn}, replacement: ${hasReplacementRequest})`, async () => {
					const previousEvents: ISessionEvent[] = hasPreviousTurn ? [
						{ type: 'user.message', id: 'previous-user', data: { content: 'Previous request' } },
						{ type: 'assistant.message', data: { content: 'Previous response' } },
					] : [];
					const replacementEvents: ISessionEvent[] = hasReplacementRequest ? [
						{ type: 'user.message', id: 'replacement-user', data: { content: 'Explain this file' } },
						{ type: 'assistant.message', data: { content: 'File explanation' } },
					] : [];
					const { turns } = await mapSessionEvents(session, undefined, toSessionEvents([
						...previousEvents,
						{ type: 'skill.invoked', id: 'user-skill', data: { name: 'publish', path: '/skills/publish/SKILL.md', content: '', trigger: 'user-invoked' } },
						boundary === 'abort'
							? { type: 'abort', data: { reason: 'user requested' } }
							: { type: 'session.error', data: { errorType: 'requestFailed', message: 'Skill request failed' } },
						...replacementEvents,
					]));

					assert.deepStrictEqual(turns.map(turn => ({
						message: turn.message.text,
						state: turn.state,
						parts: turn.responseParts.map(part => part.kind),
						error: getTurnError(turn)?.message,
					})), [
						...(hasPreviousTurn ? [{
							message: 'Previous request',
							state: TurnState.Complete,
							parts: [ResponsePartKind.Markdown],
							error: undefined,
						}] : []),
						{
							message: '',
							state: boundary === 'abort' ? TurnState.Cancelled : TurnState.Error,
							parts: boundary === 'abort' ? [ResponsePartKind.ToolCall] : [ResponsePartKind.ToolCall, ResponsePartKind.Error],
							error: boundary === 'abort' ? undefined : 'Skill request failed',
						},
						...(hasReplacementRequest ? [{
							message: 'Explain this file',
							state: TurnState.Complete,
							parts: [ResponsePartKind.Markdown],
							error: undefined,
						}] : []),
					]);
				});
			}
		}
	}

	test('synthetic user messages do not start a new turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event-1', data: { interactionId: 'interaction-1', content: 'Use the skill' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'I will use it.', toolRequests: [] } },
			{ type: 'user.message', id: 'synthetic-event', data: { interactionId: 'interaction-2', content: 'Injected skill content', source: 'skill' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-2', content: 'The skill is complete.', toolRequests: [] } },
			{ type: 'user.message', id: 'user-event-2', data: { interactionId: 'interaction-3', content: 'Thanks' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-3', content: 'You are welcome.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			parts: partKinds(turn.responseParts),
		})), [
			{
				id: 'user-event-1',
				message: 'Use the skill',
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'I will use it.' },
					{ kind: ResponsePartKind.Markdown, content: 'The skill is complete.' },
				],
			},
			{
				id: 'user-event-2',
				message: 'Thanks',
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'You are welcome.' },
				],
			},
		]);
	});

	test('strips prompt scaffolding from user message content', async () => {
		const wrapped = 'hi\n <reminder>\nIMPORTANT: ignore this\n</reminder>\n<attachments>\n<attachment id="microsoft/vscode">repo</attachment>\n</attachments>\n<userRequest>\nhi\n</userRequest>\n';
		// The Copilot CLI injects context as a `<system_reminder>` block (e.g. the
		// `IMPORTANT: this context may or may not be relevant…` preamble); it must
		// not leak into the reconstructed message (and thus the session title).
		const systemReminder = 'hi\n\n<system_reminder>\nIMPORTANT: this context may or may not be relevant\n<sql_tables>Available tables: todos, todo_deps</sql_tables>\n</system_reminder>';
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'wrapped', data: { interactionId: 'interaction-1', content: wrapped } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'Hello.', toolRequests: [] } },
			{ type: 'user.message', id: 'wrapper-only', data: { interactionId: 'interaction-2', content: '<userRequest>hi5</userRequest>' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-2', content: 'Hi again.', toolRequests: [] } },
			{ type: 'user.message', id: 'empty-wrapper', data: { interactionId: 'interaction-3', content: '/remote <reminder>x</reminder><userRequest></userRequest>' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-3', content: 'Ok remote.', toolRequests: [] } },
			{ type: 'user.message', id: 'plain', data: { interactionId: 'interaction-4', content: 'just text' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-4', content: 'Ok.', toolRequests: [] } },
			{ type: 'user.message', id: 'system-reminder', data: { interactionId: 'interaction-5', content: systemReminder } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-5', content: 'Hi.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => turn.message.text), ['hi', 'hi5', '/remote', 'just text', 'hi']);
	});

	test('terminal empty assistant message completes a tool-only turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Close out the todos' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'todo' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'todo', arguments: { status: 'done' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: '', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			message: 'Close out the todos',
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.ToolCall },
			],
		}]);
	});

	test('tool-only turn without a terminal assistant message remains cancelled', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Run the command' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo done' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'done\n' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			state: TurnState.Cancelled,
			parts: [
				{ kind: ResponsePartKind.ToolCall },
			],
		}]);
	});

	test('abort remains terminal for the turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'interaction-1', content: 'Wait for the task' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'The task is complete.', toolRequests: [] } },
			{ type: 'abort', data: { reason: 'user initiated' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-2', content: 'Late completion.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			state: TurnState.Cancelled,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'The task is complete.' },
				{ kind: ResponsePartKind.Markdown, content: 'Late completion.' },
			],
		}]);
	});

	test('restores a request error as terminal turn state', async () => {
		const events: ISessionEvent[] = [
			{
				type: 'session.error',
				data: { errorType: 'unassociated', message: 'Ignore this session diagnostic.' },
			},
			{
				type: 'user.message',
				id: 'user-event',
				timestamp: '2026-07-29T10:00:00.000Z',
				data: { interactionId: 'interaction-1', content: 'Complete this request' },
			},
			{
				type: 'assistant.turn_start',
				data: { turnId: 'assistant-turn', interactionId: 'interaction-1' },
			},
			{
				type: 'assistant.message',
				timestamp: '2026-07-29T10:00:01.000Z',
				data: { interactionId: 'interaction-1', content: 'Working on it.', toolRequests: [] },
			},
			{
				type: 'assistant.turn_end',
				data: { turnId: 'assistant-turn', interactionId: 'interaction-1' },
			},
			{
				type: 'session.error',
				id: 'error-event',
				timestamp: '2026-07-29T10:00:02.000Z',
				data: {
					errorType: 'quota',
					errorCode: 'quota_exceeded',
					message: 'No premium requests remain.',
					stack: 'Error: No premium requests remain.',
					statusCode: 402,
					providerCallId: 'provider-request-id',
					serviceRequestId: 'service-request-id',
				},
			},
			{
				type: 'assistant.message',
				data: { interactionId: 'interaction-1', content: 'Late completion.', toolRequests: [] },
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			state: turn.state,
			duration: turn.duration,
			error: getTurnError(turn),
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			state: TurnState.Error,
			duration: 2000,
			error: {
				errorType: 'quota',
				message: 'No premium requests remain.',
				stack: 'Error: No premium requests remain.',
				_meta: {
					chatError: {
						fetchError: {
							type: 'quotaExceeded',
							reason: 'No premium requests remain.',
							requestId: 'provider-request-id',
							serverRequestId: 'service-request-id',
							capiError: {
								code: 'quota_exceeded',
								message: 'No premium requests remain.',
							},
						},
					},
				},
			},
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'Working on it.' },
				{ kind: ResponsePartKind.Error },
			],
		}]);
	});

	test('restores turn timing from the SDK event envelopes', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', timestamp: '2026-07-29T10:00:00.000Z', data: { interactionId: 'm1', content: 'first' } },
			{ type: 'assistant.message', timestamp: '2026-07-29T10:00:03.500Z', data: { messageId: 'm2', content: 'First answer.' } },
			{ type: 'user.message', id: 'turn-2', timestamp: '2026-07-29T10:05:00.000Z', data: { interactionId: 'm3', content: 'second' } },
			{ type: 'assistant.message', timestamp: '2026-07-29T10:05:01.000Z', data: { messageId: 'm4', content: 'Second answer.' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
			{ id: 'turn-1', startedAt: '2026-07-29T10:00:00.000Z', duration: 3500 },
			{ id: 'turn-2', startedAt: '2026-07-29T10:05:00.000Z', duration: 1000 },
		]);
	});

	test('bounds turn duration by the last event belonging to the turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', timestamp: '2026-07-29T10:00:00.000Z', data: { interactionId: 'm1', content: 'first' } },
			{ type: 'assistant.turn_start', timestamp: '2026-07-29T10:00:00.500Z', data: { turnId: 't1' } },
			{ type: 'assistant.message', timestamp: '2026-07-29T10:00:03.500Z', data: { messageId: 'm2', content: 'First answer.' } },
			{ type: 'assistant.turn_end', timestamp: '2026-07-29T10:00:04.000Z', data: { turnId: 't1' } },
			// Ignored by the mapper an hour later: it must not extend the turn.
			{ type: 'session.unrelated_event', timestamp: '2026-07-29T11:00:00.000Z' },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
			{ id: 'turn-1', startedAt: '2026-07-29T10:00:00.000Z', duration: 4000 },
		]);
	});

	test('leaves turn timing undefined when envelopes carry no usable timestamp', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', data: { interactionId: 'm1', content: 'first' } },
			{ type: 'assistant.message', timestamp: 'not-a-date', data: { messageId: 'm2', content: 'First answer.' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
			{ id: 'turn-1', startedAt: undefined, duration: undefined },
		]);
	});
});

suite('mapSessionEvents — subagent routing', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = AgentSession.uri('copilot', 'test-session');

	function partKinds(parts: readonly ResponsePart[]): Array<{ kind: ResponsePartKind; content?: string }> {
		return parts.map(p => p.kind === ResponsePartKind.Markdown ? { kind: p.kind, content: p.content } : { kind: p.kind });
	}

	// The SDK migrated subagent correlation from the deprecated
	// `data.parentToolCallId` to an envelope-level `agentId`. Newer session
	// logs only carry `agentId`, so the replay path must route those events
	// into the subagent transcript rather than leaking them into the parent.
	test('routes subagent events tagged with envelope agentId into the subagent transcript', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'user.message', agentId: 'agent-1', data: { interactionId: 'subagent-prompt', content: 'Inspect the implementation.' } },
			// Inner subagent message + tool call, tagged only with the
			// envelope-level agentId (no data.parentToolCallId).
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: '', toolRequests: [{ toolCallId: 'tc-inner', name: 'bash' }] } },
			{ type: 'tool.execution_start', agentId: 'agent-1', data: { toolCallId: 'tc-inner', toolName: 'bash', arguments: { command: 'ls' } } },
			{ type: 'tool.execution_complete', agentId: 'agent-1', data: { toolCallId: 'tc-inner', success: true, result: { content: 'a\nb\n' } } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm4', content: 'Subagent is done.' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: true } },
			{ type: 'assistant.message', data: { messageId: 'm5', content: 'Here is what the subagent found.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		// The parent transcript must contain exactly the user turn with the
		// task tool call and the final parent assistant message — the
		// subagent's inner message must NOT appear as an extra turn.
		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.ToolCall },
			{ kind: ResponsePartKind.Markdown, content: 'Here is what the subagent found.' },
		]);

		// The subagent's inner content is routed to its own transcript keyed
		// by the parent task tool call id.
		const subagentTurns = subagentTurnsByToolCallId.get('tc-task');
		assert.ok(subagentTurns, 'Expected subagent turns for tc-task');
		assert.strictEqual(subagentTurns!.length, 1);
		assert.deepStrictEqual(subagentTurns![0].message, {
			text: 'Inspect the implementation.',
			origin: { kind: MessageKind.Tool },
		});
		assert.deepStrictEqual(partKinds(subagentTurns![0].responseParts), [
			{ kind: ResponsePartKind.ToolCall },
			{ kind: ResponsePartKind.Markdown, content: 'Subagent is done.' },
		]);
	});

	test('preserves user origin for explicit follow-ups after the worker seed turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'Delegate a task' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'task', toolName: 'task', arguments: { prompt: 'Seed prompt' } } },
			{ type: 'subagent.started', agentId: 'worker', data: { toolCallId: 'task', agentName: 'explore', agentDisplayName: 'Explore' } },
			{ type: 'user.message', agentId: 'worker', data: { interactionId: 'seed', content: 'Seed prompt' } },
			{ type: 'assistant.message', agentId: 'worker', data: { messageId: 'first', content: 'Initial answer' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'task', success: true } },
			{ type: 'user.message', agentId: 'worker', data: { interactionId: 'follow-up', content: 'Explicit follow-up' } },
			{ type: 'assistant.message', agentId: 'worker', data: { messageId: 'second', content: 'Follow-up answer' } },
		];
		const { subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		assert.deepStrictEqual(subagentTurnsByToolCallId.get('task')?.map(turn => turn.message), [
			{ text: 'Seed prompt', origin: { kind: MessageKind.Tool } },
			{ text: 'Explicit follow-up', origin: { kind: MessageKind.User } },
		]);
	});

	for (const source of [undefined, 'user', 'agent-parent', 'agent-sibling']) {
		test(`restores separate forwarded subagent messages and responses (source=${source})`, async () => {
			const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents([
				{ type: 'user.message', data: { content: 'Delegate a task' } },
				{ type: 'tool.execution_start', data: { toolCallId: 'task', toolName: 'task', arguments: { prompt: 'Seed prompt' } } },
				{ type: 'subagent.started', agentId: 'worker', data: { toolCallId: 'task', agentName: 'explore', agentDisplayName: 'Explore' } },
				{ type: 'tool.execution_complete', data: { toolCallId: 'task', success: true } },
				{ type: 'user.message', agentId: 'worker', data: { content: 'Seed prompt' } },
				{ type: 'assistant.message', agentId: 'worker', data: { content: 'Initial answer' } },
				{ type: 'user.message', agentId: 'worker', data: { messageId: 'followup-1', content: 'Follow up', source } },
				{ type: 'user.message', agentId: 'worker', data: { messageId: 'followup-2', content: 'Follow up', source } },
				{ type: 'user.message', agentId: 'worker', data: { content: 'Hidden skill instructions', source: 'skill-testing' } },
				{ type: 'tool.execution_start', agentId: 'worker', data: { toolCallId: 'child-tool', toolName: 'bash', arguments: { command: 'npm test' } } },
				{ type: 'tool.execution_complete', agentId: 'worker', data: { toolCallId: 'child-tool', success: true } },
				{ type: 'assistant.message', agentId: 'worker', data: { content: 'Follow-up answer' } },
				{ type: 'user.message', agentId: 'worker', data: { content: 'Next steps', source } },
				{ type: 'assistant.message', data: { content: 'Parent answer' } },
			]));

			assert.deepStrictEqual({
				parent: turns.map(turn => ({ message: turn.message.text, parts: partKinds(turn.responseParts) })),
				child: subagentTurnsByToolCallId.get('task')?.map(turn => ({ message: turn.message, parts: partKinds(turn.responseParts) })),
			}, {
				parent: [{
					message: 'Delegate a task',
					parts: [{ kind: ResponsePartKind.ToolCall }, { kind: ResponsePartKind.Markdown, content: 'Parent answer' }],
				}],
				child: [
					{ message: { text: 'Seed prompt', origin: { kind: MessageKind.Tool } }, parts: [{ kind: ResponsePartKind.Markdown, content: 'Initial answer' }] },
					{ message: { text: 'Follow up', origin: { kind: MessageKind.User } }, parts: [] },
					{ message: { text: 'Follow up', origin: { kind: MessageKind.User } }, parts: [{ kind: ResponsePartKind.ToolCall }, { kind: ResponsePartKind.Markdown, content: 'Follow-up answer' }] },
					{ message: { text: 'Next steps', origin: { kind: MessageKind.User } }, parts: [] },
				],
			});
		});
	}

	for (const responseBeforeLaunchCompletes of [false, true]) {
		test(`keeps the background subagent seed and response together (responseBeforeLaunchCompletes=${responseBeforeLaunchCompletes})`, async () => {
			const events: ISessionEvent[] = [
				{ type: 'user.message', data: { content: 'Delegate a task' } },
				{ type: 'tool.execution_start', data: { toolCallId: 'task', toolName: 'task', arguments: { prompt: 'Seed prompt', mode: 'background' } } },
				{ type: 'subagent.started', agentId: 'worker', data: { toolCallId: 'task', agentName: 'explore', agentDisplayName: 'Explore' } },
				{ type: 'user.message', agentId: 'worker', data: { content: 'Seed prompt', source: 'agent-parent' } },
			];
			if (responseBeforeLaunchCompletes) {
				events.push({ type: 'assistant.message', agentId: 'worker', data: { content: 'Working' } });
			}
			events.push(
				{ type: 'tool.execution_complete', data: { toolCallId: 'task', success: true } },
				{ type: 'assistant.message', agentId: 'worker', data: { content: 'Initial answer' } },
				{ type: 'user.message', agentId: 'worker', data: { content: 'Follow up', source: 'agent-parent' } },
				{ type: 'assistant.message', agentId: 'worker', data: { content: 'Follow-up answer' } },
			);
			const { subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
			assert.deepStrictEqual(subagentTurnsByToolCallId.get('task')?.map(turn => ({ message: turn.message, parts: partKinds(turn.responseParts) })), [
				{
					message: { text: 'Seed prompt', origin: { kind: MessageKind.Tool } },
					parts: [...(responseBeforeLaunchCompletes ? [{ kind: ResponsePartKind.Markdown, content: 'Working' }] : []), { kind: ResponsePartKind.Markdown, content: 'Initial answer' }],
				},
				{ message: { text: 'Follow up', origin: { kind: MessageKind.User } }, parts: [{ kind: ResponsePartKind.Markdown, content: 'Follow-up answer' }] },
			]);
		});
	}

	test('reconstructs subagent content when legacy completion precedes subagent start', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'summarize the service' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'Summarize agent service', agent_type: 'explore' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: true, result: { content: 'Agent started in background.' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore Agent', agentDescription: 'Explores' } },
			{ type: 'user.message', agentId: 'agent-1', data: { interactionId: 'subagent-prompt', content: 'Inspect agentService.ts.' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: 'Summary complete.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const toolCall = turns[0].responseParts.find((part): part is ToolCallResponsePart => part.kind === ResponsePartKind.ToolCall)?.toolCall;
		const subagentContent = toolCall?.status === ToolCallStatus.Completed
			? toolCall.content?.find(content => content.type === ToolResultContentType.Subagent)
			: undefined;

		assert.deepStrictEqual({
			description: toolCall ? readToolCallMeta(toolCall).subagentDescription : undefined,
			subagentContent,
			childMarkdown: subagentTurnsByToolCallId.get('tc-task')?.flatMap(turn => turn.responseParts)
				.filter(part => part.kind === ResponsePartKind.Markdown)
				.map(part => part.content),
		}, {
			description: 'Summarize agent service',
			subagentContent: {
				type: ToolResultContentType.Subagent,
				resource: 'copilot:/test-session/subagent/tc-task',
				title: 'Explore Agent',
				agentName: 'explore',
				description: 'Explores',
			},
			childMarkdown: ['Summary complete.'],
		});
	});

	test('drops subagent user messages whose agentId cannot be mapped', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'root-message', data: { interactionId: 'm1', content: 'Continue the task' } },
			{ type: 'user.message', id: 'orphan-subagent-message', agentId: 'unknown-agent', data: { interactionId: 'm2', content: 'Delegated prompt' } },
			{ type: 'assistant.message', data: { messageId: 'm3', content: 'Done.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			turns: turns.map(turn => ({
				id: turn.id,
				message: turn.message.text,
				parts: partKinds(turn.responseParts),
			})),
			subagentTurns: [...subagentTurnsByToolCallId],
		}, {
			turns: [{
				id: 'root-message',
				message: 'Continue the task',
				parts: [{ kind: ResponsePartKind.Markdown, content: 'Done.' }],
			}],
			subagentTurns: [],
		});
	});

	test('routes subagent skill events into the subagent transcript', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'skill.invoked', agentId: 'agent-1', data: { name: 'research', path: '/skills/research', content: '' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: true } },
			{ type: 'assistant.message', data: { messageId: 'm3', content: 'The subagent finished.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			parentState: turns[0].state,
			parentParts: partKinds(turns[0].responseParts),
			subagentParts: partKinds(subagentTurnsByToolCallId.get('tc-task')?.[0].responseParts ?? []),
		}, {
			parentState: TurnState.Complete,
			parentParts: [
				{ kind: ResponsePartKind.ToolCall },
				{ kind: ResponsePartKind.Markdown, content: 'The subagent finished.' },
			],
			subagentParts: [
				{ kind: ResponsePartKind.ToolCall },
			],
		});
	});

	test('subagent abort marks the subagent turn cancelled', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: 'Partial result.' } },
			{ type: 'abort', agentId: 'agent-1', data: { reason: 'user initiated' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: false } },
			{ type: 'assistant.message', data: { messageId: 'm4', content: 'The subagent was cancelled.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const subagentTurn = subagentTurnsByToolCallId.get('tc-task')?.[0];

		assert.deepStrictEqual({
			parentState: turns[0].state,
			subagentState: subagentTurn?.state,
			subagentParts: partKinds(subagentTurn?.responseParts ?? []),
		}, {
			parentState: TurnState.Complete,
			subagentState: TurnState.Cancelled,
			subagentParts: [
				{ kind: ResponsePartKind.Markdown, content: 'Partial result.' },
			],
		});
	});

	test('subagent abort before its first response remains cancelled', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'abort', agentId: 'agent-1', data: { reason: 'user initiated' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: 'Late partial result.' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: false } },
			{ type: 'assistant.message', data: { messageId: 'm4', content: 'The subagent was cancelled.' } },
		];

		const { subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const subagentTurn = subagentTurnsByToolCallId.get('tc-task')?.[0];

		assert.deepStrictEqual({
			state: subagentTurn?.state,
			parts: partKinds(subagentTurn?.responseParts ?? []),
		}, {
			state: TurnState.Cancelled,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'Late partial result.' },
			],
		});
	});

	test('subagent error marks only the subagent turn errored and remains terminal', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: 'Partial result.' } },
			{ type: 'session.error', agentId: 'agent-1', data: { errorType: 'rate_limit', message: 'Subagent rate limited.', statusCode: 429 } },
			{ type: 'abort', agentId: 'agent-1', data: { reason: 'cleanup after failure' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: false } },
			{ type: 'assistant.message', data: { messageId: 'm4', content: 'The subagent failed.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const subagentTurn = subagentTurnsByToolCallId.get('tc-task')?.[0];

		assert.deepStrictEqual({
			parentState: turns[0].state,
			parentError: getTurnError(turns[0]),
			subagentState: subagentTurn?.state,
			subagentError: getTurnError(subagentTurn),
			subagentParts: partKinds(subagentTurn?.responseParts ?? []),
		}, {
			parentState: TurnState.Complete,
			parentError: undefined,
			subagentState: TurnState.Error,
			subagentError: {
				errorType: 'rate_limit',
				message: 'Subagent rate limited.',
				stack: undefined,
				_meta: {
					chatError: {
						fetchError: {
							type: 'rateLimited',
							reason: 'Subagent rate limited.',
							requestId: '',
							capiError: { code: undefined, message: 'Subagent rate limited.' },
						},
					},
				},
			},
			subagentParts: [
				{ kind: ResponsePartKind.Markdown, content: 'Partial result.' },
				{ kind: ResponsePartKind.Error },
			],
		});
	});
});

suite('getSdkToolResultContent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const contents: NonNullable<ToolExecutionCompleteResult['contents']> = [
		{ type: 'text', text: 'Image generated successfully.' },
		{ type: 'image', data: 'original-one', mimeType: 'image/png' },
		{ type: 'image', data: 'original-two', mimeType: 'image/png' },
		{ type: 'image', data: 'resized-model-copy', mimeType: 'image/png' },
	];
	const originals = [{ contentIndex: 1, mimeType: 'image/png' }, { contentIndex: 2, mimeType: 'image/png' }];
	const binaries: NonNullable<ToolExecutionCompleteResult['binaryResultsForLlm']> = [
		{ type: 'image', data: 'resized-model-copy', mimeType: 'image/png' },
		{ type: 'image', assetId: 'model-copy', byteLength: 100, mimeType: 'image/png' },
		{ type: 'image', byteLength: 100, mimeType: 'image/png', omittedReason: 'too_large' },
	];

	test('keeps indexed originals in content order and preserves non-image content', () => {
		const result: ToolExecutionCompleteResult = {
			content: '', contents, binaryResultsForLlm: binaries,
			structuredContent: { imageGeneration: { images: [...originals].reverse() } },
		};
		assert.deepStrictEqual({
			selected: getSdkToolResultContent('image_generation', result),
			unmodified: result.contents,
			unmodifiedBinaries: result.binaryResultsForLlm,
			otherTool: getSdkToolResultContent('view_image', result),
		}, { selected: { contents: contents.slice(0, 3), binaryResultsForLlm: [] }, unmodified: contents, unmodifiedBinaries: binaries, otherTool: result });
	});

	for (const images of [
		undefined, null, [], [null], [{ contentIndex: -1, mimeType: 'image/png' }],
		[{ contentIndex: 1.5, mimeType: 'image/png' }], [{ contentIndex: 6, mimeType: 'image/png' }],
		[{ contentIndex: 0, mimeType: 'image/png' }], [{ contentIndex: 1, mimeType: 'image/jpeg' }],
		[originals[0], originals[0]], [originals[0], { contentIndex: '2', mimeType: 'image/png' }],
	]) {
		test(`preserves all image content for absent or invalid optional indexes (${JSON.stringify(images)})`, () => {
			const result: ToolExecutionCompleteResult = {
				content: '', contents, binaryResultsForLlm: binaries, structuredContent: { imageGeneration: images === undefined ? {} : { images } },
			};
			assert.strictEqual(getSdkToolResultContent('image_generation', result), result);
		});
	}

	test('preserves binary-only image results without indexed originals', () => {
		const result: ToolExecutionCompleteResult = { content: '', binaryResultsForLlm: binaries };
		assert.strictEqual(getSdkToolResultContent('image_generation', result), result);
	});

	test('preserves a valid multi-image result without additional copies', () => {
		assert.deepStrictEqual(getSdkToolResultContent('image_generation', {
			content: '', contents: contents.slice(0, 3), structuredContent: { imageGeneration: { images: originals } },
		})?.contents, contents.slice(0, 3));
	});
});

suite('appendSdkToolResultContent', () => {

	ensureNoDisposablesAreLeakedInTestSuite();
	const session = AgentSession.uri('copilot', 'test-session');
	const chat = URI.parse(buildChatUri(session, 'default'));
	const terminalDescriptor = { storage: session, session, chat, toolCallId: 'tc-1', title: 'Run Shell Command' };
	const terminalResource = buildNonPtyShellTerminalUri(session, session, chat, 'tc-1');

	test('retains detailed output unless structured text reproduces it', () => {
		assert.deepStrictEqual([
			getSdkToolResultText(undefined),
			getSdkToolResultText({ content: 'Short' }),
			getSdkToolResultText({ content: 'Short', detailedContent: 'Full' }),
			getSdkToolResultText({ content: 'Short', detailedContent: 'Full', contents: [{ type: 'text', text: '' }] }),
			getSdkToolResultText({ content: 'Short', contents: [{ type: 'text', text: 'Structured' }] }),
			getSdkToolResultText({ content: 'Short', detailedContent: 'Complete diff', contents: [{ type: 'text', text: 'Summary' }] }),
			getSdkToolResultText({ content: 'Short', detailedContent: 'Full', contents: [{ type: 'text', text: ' \n\t' }] }),
			getSdkToolResultText({ content: 'Short', detailedContent: 'Full', contents: [{ type: 'text', text: ' Full\n' }] }),
			getSdkToolResultText({ content: 'Short', detailedContent: 'First\n\nSecond', contents: [{ type: 'text', text: 'First' }, { type: 'text', text: 'Second' }] }),
			getSdkToolResultText({ content: 'Short', detailedContent: 'Full', contents: [{ type: 'resource', resource: { uri: 'mcp:/text', text: 'Full' } }] }),
			getSdkToolResultText({ content: 'IntroBodyOutro', contents: [{ type: 'text', text: 'Intro' }, { type: 'resource', resource: { uri: 'demo://resource/1', text: 'Body' } }, { type: 'text', text: 'Outro' }] }),
		], [undefined, 'Short', 'Full', 'Full', 'Short', 'Complete diff', 'Full', undefined, undefined, undefined, undefined]);
	});

	for (const { resource, filename, data, contentType, sizeHint } of [
		{ resource: { uri: 'demo://resource/1', text: 'héllo' }, filename: '1', data: 'aMOpbGxv', contentType: 'text/plain', sizeHint: 6 },
		{ resource: { uri: 'demo://resource/README.md.gz', blob: 'AP8=' }, filename: 'README.md.gz', data: 'AP8=', contentType: 'application/octet-stream', sizeHint: 2 },
		{ resource: { uri: 'demo://resource/unsafe:name', text: '', mimeType: 'text/markdown' }, filename: 'unsafe:name', data: '', contentType: 'text/markdown', sizeHint: 0 },
		{ resource: { uri: 'demo://resource/a\\b', text: '' }, filename: 'a_b', data: '', contentType: 'text/plain', sizeHint: 0 },
		{ resource: { uri: 'demo://resource/../../evil', text: '' }, filename: 'evil', data: '', contentType: 'text/plain', sizeHint: 0 },
		{ resource: { uri: 'demo://resource/', text: '' }, filename: 'resource', data: '', contentType: 'text/plain', sizeHint: 0 },
	]) {
		test(`persists embedded resource ${resource.uri} as a named reference`, async () => {
			const database = new TestSessionDatabase();
			await database.createTurn('turn-1');
			const block: ToolExecutionCompleteContentResource = { type: 'resource', resource };
			const embedded = await persistSdkToolResultResources([block], session.toString(), 'turn-1', 'tc-1', database, new NullLogService());
			const content: ToolResultContent[] = [];
			appendSdkToolResultContent(content, [block], undefined, typeof resource.blob === 'string' ? [{ type: 'image', data: resource.blob, mimeType: contentType }] : undefined, undefined, { embedded });
			const reference = buildToolResultResourceUri(session.toString(), 'tc-1', 0, filename);
			const stored = await database.readToolResultResourceContent('tc-1', 0);
			assert.deepStrictEqual({
				content,
				path: URI.parse(reference).path,
				routing: parseToolResultResourceUri(URI.parse(reference).with({ path: '/../../ignored' })),
				written: stored && encodeBase64(VSBuffer.wrap(stored.content)),
			}, {
				content: [{ type: ToolResultContentType.Resource, uri: reference, contentType, sizeHint }],
				path: `/${filename}`,
				routing: { sessionUri: session.toString(), toolCallId: 'tc-1', ordinal: 0 },
				written: data,
			});
		});
	}

	test('failed persistence retains the original text and blob blocks', async () => {
		const database = new TestSessionDatabase();
		const contents: ToolExecutionCompleteContentResource[] = [
			{ type: 'resource', resource: { uri: 'demo://resource/1', text: 'Document' } },
			{ type: 'resource', resource: { uri: 'demo://resource/2', blob: 'AP8=' } },
		];
		const embedded = await persistSdkToolResultResources(contents, session.toString(), 'missing-turn', 'tc-1', database, new NullLogService());
		const content: ToolResultContent[] = [];
		appendSdkToolResultContent(content, contents, undefined, [{ type: 'image', data: 'AP8=', mimeType: 'application/octet-stream' }], undefined, { embedded });
		assert.deepStrictEqual(content, [
			{ type: ToolResultContentType.Text, text: 'Document' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'AP8=', contentType: 'application/octet-stream' },
		]);
	});

	test('oversized resources retain inline fallback while bounded siblings are stored', async () => {
		const database = new TestSessionDatabase();
		await database.createTurn('turn-1');
		const text = 'x'.repeat(MAX_TOOL_RESULT_RESOURCE_BYTES + 1);
		const blob = encodeBase64(VSBuffer.wrap(new Uint8Array(MAX_TOOL_RESULT_RESOURCE_BYTES + 1)));
		const contents: ToolExecutionCompleteContentResource[] = [
			{ type: 'resource', resource: { uri: 'demo:/large-text', text } },
			{ type: 'resource', resource: { uri: 'demo:/large-blob', blob } },
			{ type: 'resource', resource: { uri: 'demo:/small', text: 'ok' } },
		];
		const embedded = await persistSdkToolResultResources(contents, session.toString(), 'turn-1', 'tc-1', database, new NullLogService());
		const content: ToolResultContent[] = [];
		appendSdkToolResultContent(content, contents, undefined, undefined, undefined, { embedded });
		assert.deepStrictEqual({ content, ordinals: (await database.getToolResultResources(['tc-1'])).get('tc-1')?.map(row => row.ordinal) }, {
			content: [
				{ type: ToolResultContentType.Text, text },
				{ type: ToolResultContentType.EmbeddedResource, data: blob, contentType: 'application/octet-stream' },
				{ type: ToolResultContentType.Resource, uri: buildToolResultResourceUri(session.toString(), 'tc-1', 2, 'small'), contentType: 'text/plain', sizeHint: 2 },
			],
			ordinals: [2],
		});
	});

	test('maps MCP resource links to the originating server channel', () => {
		const channel = buildMcpChannel(chat, 'everything', 'copilot');
		const content: ToolResultContent[] = [];
		appendSdkToolResultContent(content, [
			{ type: 'resource_link', uri: 'demo://resource/1', name: 'Document.txt', mimeType: 'text/plain', size: 12 },
			{ type: 'resource_link', uri: 'demo://resource/2', name: '' },
		], undefined, undefined, undefined, { mcpChannel: channel });
		assert.deepStrictEqual(content.map(block => block.type === ToolResultContentType.Resource ? {
			name: URI.parse(block.uri).path,
			routing: parseMcpResourceUri(URI.parse(block.uri)),
			contentType: block.contentType,
			sizeHint: block.sizeHint,
		} : block), [
			{ name: '/Document.txt', routing: { channel, uri: 'demo://resource/1' }, contentType: 'text/plain', sizeHint: 12 },
			{ name: '/2', routing: { channel, uri: 'demo://resource/2' }, contentType: undefined, sizeHint: undefined },
		]);
	});

	test('invalid MCP resource routing fields are not accepted', () => {
		const uri = URI.parse(buildMcpResourceUri('mcp://copilot/chat/server', 'demo://resource/1'));
		assert.deepStrictEqual([
			parseMcpResourceUri(uri.with({ query: '{' })),
			parseMcpResourceUri(uri.with({ query: 'null' })),
			parseMcpResourceUri(uri.with({ query: '{"channel":1,"uri":"demo://resource/1"}' })),
			parseMcpResourceUri(uri.with({ query: '{"channel":"mcp://copilot/chat/server","uri":""}' })),
		], [undefined, undefined, undefined, undefined]);
	});

	test('invalid database resource identities are not accepted', () => {
		const uri = URI.parse(buildToolResultResourceUri(session.toString(), 'tc-1', 0, 'resource'));
		const invalidQueries = ['{', 'null', '{}', ...[-1, 0.5, '0'].map(ordinal =>
			JSON.stringify({ sessionUri: session.toString(), toolCallId: 'tc-1', ordinal }))];
		assert.deepStrictEqual([
			parseToolResultResourceUri(uri.with({ scheme: 'other' })),
			...invalidQueries.map(query => parseToolResultResourceUri(uri.with({ query }))),
		], [undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
	});

	test('maps structured text, audio, and inline resources', () => {
		const content: ToolResultContent[] = [];
		appendSdkToolResultContent(content, [
			{ type: 'text', text: 'MCP result' },
			{ type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' },
			{ type: 'resource', resource: { uri: 'mcp:/text', text: 'Document body', mimeType: 'text/plain' } },
			{ type: 'resource', resource: { uri: 'mcp:/blob', blob: 'YmxvYg==' } },
		]);
		assert.deepStrictEqual(content, [
			{ type: ToolResultContentType.Text, text: 'MCP result' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'YXVkaW8=', contentType: 'audio/wav' },
			{ type: ToolResultContentType.Text, text: 'Document body' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'YmxvYg==', contentType: 'application/octet-stream' },
		]);
	});

	test('binary projection deduplicates against structured blocks but preserves carrier multiplicity', () => {
		const content: ToolResultContent[] = [];
		const asset = { type: 'image' as const, assetId: 'asset-1', data: 'YQ==', mimeType: 'image/png', byteLength: 1 };
		appendSdkToolResultContent(content, [{ type: 'image', data: 'Yg==', mimeType: 'image/JPEG' }], undefined, [
			{ type: 'image', data: 'Yg==', mimeType: 'image/jpeg' },
			{ type: 'image', assetId: 'asset-1', byteLength: 1, mimeType: '' },
			{ type: 'image', data: 'YQ==', mimeType: 'image/png' },
			{ type: 'image', byteLength: 100, mimeType: 'image/png', omittedReason: 'too_large' },
			{ type: 'image', assetId: 'missing', byteLength: 1, mimeType: 'image/png' },
		], new Map([[asset.assetId, asset]]));
		assert.deepStrictEqual(content, [
			{ type: ToolResultContentType.EmbeddedResource, data: 'Yg==', contentType: 'image/JPEG' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'YQ==', contentType: 'image/png' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'YQ==', contentType: 'image/png' },
		]);
	});

	for (const existingTerminal of [false, true]) {
		for (const outputPreview of [undefined, null, '', 'preview\n']) {
			test(`retains full output with ${existingTerminal ? 'existing' : 'new'} terminal and ${JSON.stringify(outputPreview)} preview`, () => {
				const terminal = { type: ToolResultContentType.Terminal, resource: 'agenthost-terminal://shell/abc', title: 'Bash' } as const;
				const content: ToolResultContent[] = existingTerminal ? [terminal] : [];
				const result = appendSdkToolResultContent(content, [{
					type: 'shell_exit',
					shellId: '0',
					exitCode: 2,
					outputPreview,
					outputFilePath: '/tmp/full output #1.txt',
				}], terminalDescriptor);
				const expectedResult = {
					exitCode: 2,
					...(typeof outputPreview === 'string' ? { preview: outputPreview } : {}),
				};
				assert.deepStrictEqual({ result, content }, {
					result: { shellId: '0', result: expectedResult, outputFilePath: '/tmp/full output #1.txt' },
					content: [{
						...(existingTerminal ? terminal : {
							type: ToolResultContentType.Terminal,
							resource: terminalResource,
							title: 'Run Shell Command',
							isPty: false,
						}),
						result: expectedResult,
					}],
				});
			});
		}
	}

	test('does not convert unsupported SDK links into host-readable resources', () => {
		const content: ToolResultContent[] = [];
		appendSdkToolResultContent(content, [
			{ type: 'resource_link', uri: 'generated-images:/session/result', name: 'result' },
			{ type: 'resource_link', uri: 'https://example.com/image.png', name: 'image', mimeType: 'image/png' },
			{ type: 'resource_link', uri: 'mcp:/document', name: 'document', mimeType: 'text/plain' },
		]);
		assert.deepStrictEqual(content, []);
	});

	test('folds shell_exit into an existing terminal block instead of adding a second one', () => {
		const content: ToolResultContent[] = [
			{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal://shell/abc', title: 'Bash' },
		];

		const result = appendSdkToolResultContent(content, [
			{ type: 'shell_exit', shellId: '0', exitCode: 2, outputPreview: 'boom\n', outputTruncated: false },
		], terminalDescriptor);

		assert.deepStrictEqual(result, { shellId: '0', result: { exitCode: 2, preview: 'boom\n', truncated: false } });
		assert.deepStrictEqual(content, [
			{
				type: ToolResultContentType.Terminal,
				resource: 'agenthost-terminal://shell/abc',
				title: 'Bash',
				result: { exitCode: 2, preview: 'boom\n', truncated: false },
			},
		]);
	});

	test('ignores a null shell_exit output preview', () => {
		const content: ToolResultContent[] = [];

		const result = appendSdkToolResultContent(content, [
			{ type: 'shell_exit', shellId: '0', exitCode: 7, outputPreview: null, outputTruncated: false },
		], terminalDescriptor);

		assert.deepStrictEqual({ result, content }, {
			result: { shellId: '0', result: { exitCode: 7, truncated: false } },
			content: [
				{
					type: ToolResultContentType.Terminal,
					resource: terminalResource,
					title: 'Run Shell Command',
					isPty: false,
					result: { exitCode: 7, truncated: false },
				},
			],
		});
	});
});
