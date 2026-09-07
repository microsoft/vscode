/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, getErrorResponsePart, getInlineToolInput, ROOT_STATE_URI, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState, type ToolDefinition } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, dispatchTurn, driveTurnToCompletion, driveTurnWithModelToCompletion } from '../harness/agentHostE2ETestHarness.js';
import { anthropicMessageToSse } from '../harness/capiWireCodec.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const imageData = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4z8BAEiJN9aiGUQ1DSgMAkPn/Afnh+ngAAAAASUVORK5CYII=';
const RECORD = process.env.AGENT_HOST_REPLAY_RECORD === '1' || process.env.AGENT_HOST_UPDATE_SNAPSHOTS === '1';

export function defineCopilotRuntimeToolsTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	async function createSession(prefix: string): Promise<{ sessionUri: string; workspace: string }> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-${prefix}-`));
		context.tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, context.config, prefix, context.createdSessions, URI.file(workspace));
		return { sessionUri, workspace };
	}

	test('runtime tools: an accepted empty response reports a query error instead of completing silently', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession('runtime-empty-response');
		const chatUri = buildDefaultChatUri(sessionUri);
		const turnId = 'turn-runtime-empty-response';
		if (RECORD) {
			context.setRecordingModelResponse({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({ content: [], stopReason: 'end_turn' }),
			}, '/v1/messages');
		}
		dispatchTurn(context.client, sessionUri, turnId, 'Reply exactly EMPTY_RESPONSE_PROBE.', 1);
		const ending = await context.client.waitForNotification(n => (isActionNotification(n, ActionType.ChatError)
			|| isActionNotification(n, ActionType.ChatTurnComplete))
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as ChatErrorAction).turnId === turnId, 90_000);
		assert.strictEqual(getActionEnvelope(ending).action.type, ActionType.ChatError);
		const state = await fetchSessionWithChat(context.client, sessionUri);
		const turn = state.turns.find(turn => turn.id === turnId);
		assert.deepStrictEqual({
			state: turn?.state,
			error: getErrorResponsePart(turn)?.error,
			activeTurn: state.activeTurn,
			errorCount: context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatError)).length,
		}, {
			state: TurnState.Error,
			error: { errorType: 'query', message: 'No response was returned. Send your message again to retry.' },
			activeTurn: undefined,
			errorCount: 1,
		});
	});

	test('runtime tools: Claude uses the client tool-search schema and executes its deferred result', async function () {
		this.timeout(180_000);
		const clientId = 'runtime-claude-tool-search';
		const { sessionUri } = await createSession(clientId);
		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: 1,
			action: { type: ActionType.RootConfigChanged, config: { [CopilotCliConfigKey.ToolSearchEnabled]: true } },
		});
		await context.client.waitForNotification(n => isActionNotification(n, ActionType.RootConfigChanged), 30_000);
		try {
			const description = 'Search the client catalog by natural-language query for the get_magic_word tool.';
			const inputSchema: ToolDefinition['inputSchema'] = { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] };
			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 2,
				action: {
					type: ActionType.SessionActiveClientSet,
					activeClient: {
						clientId,
						tools: [{
							name: 'toolSearch',
							description,
							inputSchema,
						}, {
							name: 'get_magic_word',
							description: 'Returns the secret magic word.',
							inputSchema: { type: 'object', properties: {} },
						}],
					},
				},
			});
			await context.client.waitForNotification(n => isActionNotification(n, ActionType.SessionActiveClientSet), 30_000);
			const turnId = 'turn-runtime-claude-tool-search';
			const clientTools: string[] = [];
			let searchConfirmation: ToolCallConfirmationReason | undefined;
			const [result] = await Promise.all([
				driveTurnWithModelToCompletion(context.client, sessionUri, turnId, 'Search for get_magic_word first, then call it exactly once. Reply with only its exact result.', 'claude-sonnet-5', 3),
				(async () => {
					for (const [index, toolName] of ['tool_search_tool', 'get_magic_word'].entries()) {
						const start = await context.client.waitForNotification(n => isActionNotification(n, ActionType.ChatToolCallStart)
							&& (getActionEnvelope(n).action as ChatToolCallStartAction).toolName === toolName, 90_000);
						const toolCallId = (getActionEnvelope(start).action as ChatToolCallStartAction).toolCallId;
						const ready = await context.client.waitForNotification(n => isActionNotification(n, ActionType.ChatToolCallReady)
							&& (getActionEnvelope(n).action as ChatToolCallReadyAction).toolCallId === toolCallId, 90_000);
						assert.deepStrictEqual((getActionEnvelope(ready).action as ChatToolCallReadyAction).contributor, {
							kind: ToolCallContributorKind.Client,
							clientId,
						});
						if (index === 0) {
							searchConfirmation = (getActionEnvelope(ready).action as ChatToolCallReadyAction).confirmed;
						}
						clientTools.push(toolName);
						context.client.dispatch({
							channel: chatUri,
							clientSeq: 100 + index,
							action: {
								type: ActionType.ChatToolCallComplete,
								turnId,
								toolCallId,
								result: {
									success: true,
									pastTenseMessage: `Completed ${toolName}`,
									content: [{ type: ToolResultContentType.Text, text: index === 0 ? '["get_magic_word"]' : 'SEARCH_RESULT_WORD' }],
								},
							},
						});
					}
				})(),
			]);
			const request: { tools: { name: string; description?: string; input_schema?: typeof inputSchema; defer_loading?: boolean }[] } = JSON.parse(context.observedModelRequestBodies[0]);
			const search = request.tools.find(tool => tool.name === 'tool_search_tool');
			assert.deepStrictEqual({
				clientTools,
				description: search?.description,
				inputSchema: search?.input_schema,
				deferredTool: request.tools.find(tool => tool.name === 'get_magic_word')?.defer_loading,
				searchConfirmation,
				response: result.responseText.trim(),
			}, {
				clientTools: ['tool_search_tool', 'get_magic_word'],
				description,
				inputSchema,
				deferredTool: true,
				searchConfirmation: ToolCallConfirmationReason.NotNeeded,
				response: 'SEARCH_RESULT_WORD',
			});
		} finally {
			context.client.clearReceived();
			context.client.dispatch({
				channel: ROOT_STATE_URI,
				clientSeq: 200,
				action: { type: ActionType.RootConfigChanged, config: { [CopilotCliConfigKey.ToolSearchEnabled]: false } },
			});
			await context.client.waitForNotification(n => isActionNotification(n, ActionType.RootConfigChanged), 30_000);
		}
	});

	test('runtime tools: image client tool results preserve event delivery through turn completion', async function () {
		this.timeout(180_000);
		const clientId = 'runtime-image-tool';
		const { sessionUri } = await createSession(clientId);
		const chatUri = buildDefaultChatUri(sessionUri);
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId,
					tools: [{
						name: 'get_test_image',
						description: 'Returns a synthetic PNG image and an acknowledgement token.',
						inputSchema: { type: 'object', properties: {}, required: [] },
					}],
				},
			},
		});
		await context.client.waitForNotification(n => isActionNotification(n, ActionType.SessionActiveClientSet), 30_000);

		const turnId = 'turn-runtime-image';
		let toolCallId: string | undefined;
		const [result] = await Promise.all([
			driveTurnToCompletion(context.client, sessionUri, turnId, 'Call get_test_image exactly once. After receiving the image, reply with only its acknowledgement token.', 2),
			(async () => {
				const start = await context.client.waitForNotification(n => isActionNotification(n, ActionType.ChatToolCallStart)
					&& (getActionEnvelope(n).action as ChatToolCallStartAction).toolName === 'get_test_image', 90_000);
				toolCallId = (getActionEnvelope(start).action as ChatToolCallStartAction).toolCallId;
				const ready = await context.client.waitForNotification(n => isActionNotification(n, ActionType.ChatToolCallReady)
					&& (getActionEnvelope(n).action as ChatToolCallReadyAction).toolCallId === toolCallId, 90_000);
				assert.deepStrictEqual((getActionEnvelope(ready).action as ChatToolCallReadyAction).contributor, {
					kind: ToolCallContributorKind.Client,
					clientId,
				});
				context.client.dispatch({
					channel: chatUri,
					clientSeq: 100,
					action: {
						type: ActionType.ChatToolCallComplete,
						turnId,
						toolCallId,
						result: {
							success: true,
							pastTenseMessage: 'Returned the synthetic image',
							content: [
								{ type: ToolResultContentType.Text, text: 'Acknowledgement token: IMAGE_DELIVERED' },
								{ type: ToolResultContentType.EmbeddedResource, data: imageData, contentType: 'image/png' },
							],
						},
					},
				});
			})(),
		]);
		const state = await fetchSessionWithChat(context.client, sessionUri);
		const completion = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
			.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
			.find(action => action.toolCallId === toolCallId);
		const followupRequest = context.observedModelRequestBodies.at(-1) ?? '';
		assert.deepStrictEqual({
			response: result.responseText.trim(),
			toolSucceeded: completion?.result.success,
			imageReachedModel: followupRequest.includes(imageData) && followupRequest.includes('image/png'),
			turnState: state.turns.at(-1)?.state,
			activeTurn: state.activeTurn,
		}, {
			response: 'IMAGE_DELIVERED',
			toolSucceeded: true,
			imageReachedModel: true,
			turnState: TurnState.Complete,
			activeTurn: undefined,
		});
	});

	test('runtime tools: native apply_patch handles bare-minus hunks on zero-byte files', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession('runtime-empty-patch');
		writeFileSync(join(workspace, 'replacement.txt'), '');
		writeFileSync(join(workspace, 'deletion.txt'), '');
		const patch = '*** Begin Patch\n*** Update File: replacement.txt\n@@\n-\n+A\n*** Update File: deletion.txt\n@@\n-\n*** End Patch';
		const result = await driveTurnWithModelToCompletion(context.client, sessionUri, 'turn-runtime-empty-patch',
			`The files replacement.txt and deletion.txt both exist and contain zero bytes. Call apply_patch exactly once with the following exact patch, preserving each bare minus line. Do not substitute another edit tool or change the patch. Then reply exactly PATCH_COMPLETE.\n${patch}`,
			'gpt-5.6-sol', 1);
		const patchStarts = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallStart))
			.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
			.filter(action => action.toolName === 'apply_patch');
		const ready = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallReady))
			.map(n => getActionEnvelope(n).action as ChatToolCallReadyAction)
			.find(action => action.toolCallId === patchStarts[0]?.toolCallId);
		const patchInput: string | null = JSON.parse(getInlineToolInput(ready?.toolInput) ?? 'null');
		assert.deepStrictEqual({
			patchCalls: patchStarts.length,
			patchInput: patchInput?.trim(),
			replacement: readFileSync(join(workspace, 'replacement.txt'), 'utf8').trimEnd(),
			deletionBytes: readFileSync(join(workspace, 'deletion.txt')).length,
			response: result.responseText.trim(),
		}, {
			patchCalls: 1,
			patchInput: patch,
			replacement: 'A',
			deletionBytes: 0,
			response: 'PATCH_COMPLETE',
		});
	});

	test('runtime tools: GPT requests detailed reasoning and unfinished-task continuation guidance by default', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession('runtime-gpt-defaults');
		const result = await driveTurnWithModelToCompletion(context.client, sessionUri, 'turn-runtime-gpt-defaults', 'Reply exactly DEFAULTS_READY.', 'gpt-5.6-sol', 1);
		assert.strictEqual(context.observedModelRequestBodies.length, 1);
		const request: { model: string; reasoning?: { summary?: string }; instructions?: string } = JSON.parse(context.observedModelRequestBodies[0]);
		assert.deepStrictEqual({
			model: request.model,
			reasoningSummary: request.reasoning?.summary,
			continuationGuidance: request.instructions?.includes('If the user asks a side question while a task is in progress, answer it briefly and then continue the unfinished task unless they ask you to stop, pause, or change direction.'),
			response: result.responseText.trim(),
		}, {
			model: 'gpt-5.6-sol',
			// Responses spells the runtime's detailed summary mode "auto".
			reasoningSummary: 'auto',
			continuationGuidance: true,
			response: 'DEFAULTS_READY',
		});
	});
}
