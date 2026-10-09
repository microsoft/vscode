/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import type { ResourceReadResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, getErrorResponsePart, getInlineToolInput, ROOT_STATE_URI, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState, type ToolCallResult, type ToolDefinition } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, type TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, dispatchTurn, driveChatTurnToCompletion, driveTurnToCompletion, driveTurnWithModelToCompletion, resolveGitHubToken, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { anthropicMessageToSse } from '../harness/capiWireCodec.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';
import { createTestDirectory } from '../harness/testDirectories.js';

const imageData = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4z8BAEiJN9aiGUQ1DSgMAkPn/Afnh+ngAAAAASUVORK5CYII=';
const RECORD = process.env.AGENT_HOST_REPLAY_RECORD === '1' || process.env.AGENT_HOST_UPDATE_SNAPSHOTS === '1';

export function defineCopilotRuntimeToolsTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	async function createSession(prefix: string): Promise<{ sessionUri: string; workspace: string }> {
		const workspace = createTestDirectory(join(tmpdir(), `ahp-${prefix}-`));
		context.tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, context.config, prefix, context.createdSessions, URI.file(workspace));
		return { sessionUri, workspace };
	}

	async function initializeAdditionalClient(clientId: string): Promise<TestProtocolClient> {
		const client = await context.connectClient();
		await client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId,
		});
		return client;
	}

	let liveToolSequence = 300_000;

	function nextLiveToolSequence(): number {
		const value = liveToolSequence;
		liveToolSequence += 100;
		return value;
	}

	function probeDefinition(name: string, field?: string, description = 'Returns the current probe value'): ToolDefinition {
		return {
			name,
			description,
			inputSchema: { type: 'object', properties: field ? { [field]: { type: 'string' } } : {}, required: field ? [field] : [] },
		};
	}

	async function publishTools(session: string, clientId: string, tools: readonly ToolDefinition[]): Promise<void> {
		const clientSeq = nextLiveToolSequence();
		context.client.dispatch({
			channel: session, clientSeq,
			action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [...tools] } },
		});
		const changed = await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.SessionActiveClientSet)
			&& getActionEnvelope(notification).channel === session
			&& getActionEnvelope(notification).origin?.clientSeq === clientSeq,
		);
		assert.strictEqual(getActionEnvelope(changed).rejectionReason, undefined);
	}

	async function withLiveTools(prefix: string, run: (session: { sessionUri: string; workspace: string; clientId: string }) => Promise<void>): Promise<void> {
		const session = { ...await createSession(prefix), clientId: prefix };
		await driveTurnToCompletion(context.client, session.sessionUri, 'tools-warmup', 'Reply exactly "READY". Do not call tools.', nextLiveToolSequence());
		try {
			await run(session);
		} finally {
			await publishTools(session.sessionUri, session.clientId, []);
		}
	}

	async function executeClientProbe(chat: string, clientId: string, toolName: string, turnId: string, prompt: string, result: ToolCallResult = {
		success: true,
		pastTenseMessage: 'Completed probe',
		content: [{ type: ToolResultContentType.Text, text: 'LIVE_PROBE_RESULT' }],
	}): Promise<Record<string, unknown>> {
		const [, input] = await Promise.all([
			driveChatTurnToCompletion(context.client, chat, turnId, prompt, nextLiveToolSequence()),
			(async () => {
				const start = await context.client.waitForNotification(notification =>
					isActionNotification(notification, ActionType.ChatToolCallStart)
					&& getActionEnvelope(notification).channel === chat
					&& (getActionEnvelope(notification).action as ChatToolCallStartAction).turnId === turnId
					&& (getActionEnvelope(notification).action as ChatToolCallStartAction).toolName === toolName,
					90_000,
				);
				const started = getActionEnvelope(start).action;
				assert.ok(started.type === ActionType.ChatToolCallStart);
				const notification = await context.client.waitForNotification(notification =>
					isActionNotification(notification, ActionType.ChatToolCallReady)
					&& getActionEnvelope(notification).channel === chat
					&& (getActionEnvelope(notification).action as ChatToolCallReadyAction).toolCallId === started.toolCallId,
					90_000,
				);
				const ready = getActionEnvelope(notification).action;
				assert.ok(ready.type === ActionType.ChatToolCallReady);
				assert.deepStrictEqual(ready.contributor, { kind: ToolCallContributorKind.Client, clientId });
				const rawInput = getInlineToolInput(ready.toolInput);
				assert.ok(typeof rawInput === 'string');
				const input: Record<string, unknown> = JSON.parse(rawInput);
				context.client.dispatch({
					channel: chat, clientSeq: nextLiveToolSequence(),
					action: { type: ActionType.ChatToolCallComplete, turnId, toolCallId: ready.toolCallId, result },
				});
				return input;
			})(),
		]);
		return input;
	}

	test('regression coverage: client tools added after materialization execute on the next turn', async function () {
		this.timeout(180_000);
		await withLiveTools('live-tools-added', async session => {
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('added_probe')]);
			const input = await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'added_probe', 'added-probe',
				'Call added_probe exactly once and report its result.');
			assert.deepStrictEqual(input, {});
		});
	});

	test('regression coverage: client tool schema replacement reaches a live provider session', async function () {
		this.timeout(180_000);
		await withLiveTools('live-tools-schema', async session => {
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('schema_probe', 'oldField')]);
			assert.deepStrictEqual(await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'schema_probe', 'schema-before',
				'Call schema_probe exactly once with oldField set to before and report its result.'), { oldField: 'before' });
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('schema_probe', 'newField')]);
			assert.deepStrictEqual(await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'schema_probe', 'schema-after',
				'Call schema_probe exactly once with newField set to after. Use the current schema, not the previous one.'), { newField: 'after' });
		});
	});

	test('regression coverage: client tool description replacement reaches the next model request', async function () {
		this.timeout(180_000);
		await withLiveTools('live-tools-description', async session => {
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('description_probe', undefined, 'DESCRIPTION_BEFORE')]);
			await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'description_probe', 'description-before',
				'Call description_probe exactly once and report its result.');
			const previous = context.observedModelRequestBodies.length;
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('description_probe', undefined, 'DESCRIPTION_AFTER')]);
			await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'description_probe', 'description-after',
				'Call description_probe exactly once using its current definition.');
			assert.ok(context.observedModelRequestBodies.slice(previous).some(body => body.includes('DESCRIPTION_AFTER')));
		});
	});

	test('regression coverage: removing an obsolete client tool leaves its replacement executable', async function () {
		this.timeout(180_000);
		await withLiveTools('live-tools-removal', async session => {
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('obsolete_probe')]);
			await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'obsolete_probe', 'obsolete-before',
				'Call obsolete_probe exactly once and report its result.');
			const previousRequests = context.observedModelRequestBodies.length;
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('replacement_probe')]);
			await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'replacement_probe', 'replacement-after',
				'Call replacement_probe exactly once. The obsolete_probe tool has been removed; do not call it.');
			const request: {
				tools: { name: string }[];
				messages: { role: string; content: string | { type: string; tool?: { type: string; name?: string; definition?: { name: string } } }[] }[];
			} = JSON.parse(context.observedModelRequestBodies[previousRequests]);
			assert.ok(Array.isArray(request.tools));
			assert.ok(Array.isArray(request.messages));
			const effectiveNames = new Set(request.tools.map(tool => tool.name));
			for (const message of request.messages) {
				if (message.role !== 'system' || !Array.isArray(message.content)) {
					continue;
				}
				for (const block of message.content) {
					if (block.type === 'tool_removal' && block.tool?.type === 'tool_reference' && block.tool.name) {
						effectiveNames.delete(block.tool.name);
					} else if (block.type === 'tool_addition' && block.tool?.type === 'tool_definition' && block.tool.definition) {
						effectiveNames.add(block.tool.definition.name);
					}
				}
			}
			assert.deepStrictEqual({
				replacement: effectiveNames.has('replacement_probe'),
				obsolete: effectiveNames.has('obsolete_probe'),
			}, { replacement: true, obsolete: false });
			assert.deepStrictEqual(context.client.receivedNotifications(notification =>
				isActionNotification(notification, ActionType.ChatToolCallStart))
				.map(notification => getActionEnvelope(notification).action)
				.flatMap(action => action.type === ActionType.ChatToolCallStart && action.turnId === 'replacement-after' ? [action.toolName] : []),
				['replacement_probe']);
		});
	});

	for (const variant of ['empty', 'failed', 'multiple text parts'] as const) {
		test(`regression coverage: client tool ${variant} results permit a subsequent successful call`, async function () {
			this.timeout(180_000);
			await withLiveTools(`live-tools-${variant.replaceAll(' ', '-')}`, async session => {
				await publishTools(session.sessionUri, session.clientId, [probeDefinition('result_probe')]);
				const result: ToolCallResult = {
					success: variant !== 'failed',
					pastTenseMessage: 'Completed result probe',
					content: variant === 'multiple text parts'
						? [{ type: ToolResultContentType.Text, text: 'LEFT_RESULT' }, { type: ToolResultContentType.Text, text: 'RIGHT_RESULT' }]
						: [{ type: ToolResultContentType.Text, text: variant === 'empty' ? '' : 'EXPECTED_PROBE_FAILURE' }],
				};
				await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'result_probe', 'result-first',
					'Call result_probe exactly once. If it fails or is empty, stop and report that without retrying.', result);
				if (variant === 'multiple text parts') {
					assert.ok(context.observedModelRequestBodies.some(body => body.includes('LEFT_RESULT') && body.includes('RIGHT_RESULT')));
				} else if (variant === 'failed') {
					assert.ok(context.observedModelRequestBodies.some(body => body.includes('EXPECTED_PROBE_FAILURE')));
				}
				await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'result_probe', 'result-followup',
					'Call result_probe exactly once again and report its new result.');
			});
		});
	}

	test('regression coverage: a new peer chat receives the current client tool definitions', async function () {
		this.timeout(180_000);
		await withLiveTools('live-tools-peer', async session => {
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('peer_probe', 'label')]);
			const chat = buildChatUri(session.sessionUri, 'tools-peer');
			await context.client.call('createChat', { channel: session.sessionUri, chat });
			await context.client.call('subscribe', { channel: chat });
			assert.deepStrictEqual(await executeClientProbe(chat, session.clientId, 'peer_probe', 'peer-probe',
				'Call peer_probe exactly once with label set to peer.'), { label: 'peer' });
		});
	});

	test('regression coverage: live client tool replacement reaches both materialized chats', async function () {
		this.timeout(240_000);
		await withLiveTools('live-tools-materialized-peer', async session => {
			const defaultChat = buildDefaultChatUri(session.sessionUri);
			const peer = buildChatUri(session.sessionUri, 'materialized-peer');
			await context.client.call('createChat', { channel: session.sessionUri, chat: peer });
			await context.client.call('subscribe', { channel: peer });
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('shared_probe', 'oldLabel')]);
			await executeClientProbe(defaultChat, session.clientId, 'shared_probe', 'default-old', 'Call shared_probe exactly once with oldLabel set to default.');
			await executeClientProbe(peer, session.clientId, 'shared_probe', 'peer-old', 'Call shared_probe exactly once with oldLabel set to peer.');
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('shared_probe', 'newLabel')]);
			assert.deepStrictEqual({
				defaultInput: await executeClientProbe(defaultChat, session.clientId, 'shared_probe', 'default-new', 'Call shared_probe exactly once with newLabel set to default. Use its current schema.'),
				peerInput: await executeClientProbe(peer, session.clientId, 'shared_probe', 'peer-new', 'Call shared_probe exactly once with newLabel set to peer. Use its current schema.'),
			}, { defaultInput: { newLabel: 'default' }, peerInput: { newLabel: 'peer' } });
		});
	});

	test('regression coverage: cold resume binds client tool execution to the current client', async function () {
		this.timeout(240_000);
		await withLiveTools('live-tools-resume', async session => {
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('resume_probe')]);
			await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'resume_probe', 'probe-before-restart',
				'Call resume_probe exactly once and report its result.');
			await context.restartServer();
			session.clientId = 'live-tools-resumed-client';
			await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: session.clientId });
			await context.client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() });
			await context.client.call('subscribe', { channel: session.sessionUri });
			await context.client.call('subscribe', { channel: buildDefaultChatUri(session.sessionUri) });
			await publishTools(session.sessionUri, session.clientId, [probeDefinition('resume_probe')]);
			await executeClientProbe(buildDefaultChatUri(session.sessionUri), session.clientId, 'resume_probe', 'probe-after-restart',
				'Call resume_probe exactly once again and report its result.');
		});
	});

	test('runtime tools: compacted shell output preserves the complete original', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession('shell-compaction');
		const warning = '(node:123) Warning: repeated warning for shell compaction';
		const original = [...Array<string>(80).fill(warning), 'FINAL_STATUS: SHELL_COMPACTION_OK'].join('\n');
		assert.ok(Buffer.byteLength(original) < 8192, 'Output must not take the generic large-output spill path');
		writeFileSync(join(workspace, 'warnings.ts'), `process.stdout.write(${JSON.stringify(original)});\n`);
		await driveTurnWithModelToCompletion(context.client, sessionUri, 'turn-shell-compaction',
			'Run exactly `node warnings.ts` with your shell tool in synchronous mode. Do not run any other tools. Then reply exactly "DONE".',
			'claude-sonnet-5', 1);

		const compacted = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
			.map(n => getActionEnvelope(n))
			.filter(envelope => envelope.channel === buildDefaultChatUri(sessionUri))
			.flatMap(({ action }) => action.type === ActionType.ChatToolCallComplete && action.turnId === 'turn-shell-compaction'
				? [textFromContent(action.result.content ?? [])] : [])
			.find(text => text.includes('Shell output was automatically compacted'));
		assert.ok(compacted, 'Expected lossy native-shell compaction in the AHP tool result');
		const originalPath = /Original at (?<path>.+?); only use if exact omitted lines are needed\./.exec(compacted)?.groups?.path;
		assert.ok(originalPath, 'Compacted output must advertise its recoverable original');
		const recovered = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI,
			uri: URI.file(originalPath).toString(),
			encoding: ContentEncoding.Utf8,
		});
		const followup = await driveTurnToCompletion(context.client, sessionUri, 'turn-shell-compaction-followup', 'Reply exactly "FOLLOWUP_DONE".', 2);

		assert.deepStrictEqual({
			omitsRepeatedWarnings: compacted.includes('[node warnings: omitted 79 repeated warning line(s)]'),
			modelReceivesCompaction: context.observedModelRequestBodies.some(body => body.includes('Shell output was automatically compacted')),
			retainsFinalStatus: compacted.includes('FINAL_STATUS: SHELL_COMPACTION_OK'),
			retainsExitCode: compacted.includes('completed with exit code 0'),
			fitsOutputLimit: Buffer.byteLength(compacted) <= 8192,
			savesAtLeastOneThousandCharacters: original.length - compacted.length >= 1000,
			recovered: recovered.data,
			followup: followup.responseText.trim(),
		}, {
			omitsRepeatedWarnings: true,
			modelReceivesCompaction: true,
			retainsFinalStatus: true,
			retainsExitCode: true,
			fitsOutputLimit: true,
			savesAtLeastOneThousandCharacters: true,
			recovered: original,
			followup: 'FOLLOWUP_DONE',
		});
	});

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

	test('runtime tools: removing a client transfers duplicate tool ownership to the surviving client', async function () {
		this.timeout(180_000);
		const removedClientId = 'runtime-tool-owner-removed';
		const survivingClientId = 'runtime-tool-owner-surviving';
		let removedClient: TestProtocolClient | undefined;
		let survivingClient: TestProtocolClient | undefined;
		try {
			removedClient = await initializeAdditionalClient(removedClientId);
			survivingClient = await initializeAdditionalClient(survivingClientId);
			const { sessionUri } = await createSession('runtime-tool-owner-cleanup');
			const chatUri = buildDefaultChatUri(sessionUri);
			const tool: ToolDefinition = {
				name: 'route_probe',
				description: 'Returns the client tool owner marker.',
				inputSchema: { type: 'object', properties: {} },
			};
			for (const [client, clientId] of [[removedClient, removedClientId], [survivingClient, survivingClientId]] as const) {
				await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
				await client.call<SubscribeResult>('subscribe', { channel: chatUri });
				client.dispatch({
					channel: sessionUri,
					clientSeq: 1,
					action: {
						type: ActionType.SessionActiveClientSet,
						activeClient: { clientId, tools: [tool] },
					},
				});
				await context.client.waitForNotification(n => {
					if (!isActionNotification(n, ActionType.SessionActiveClientSet)) {
						return false;
					}
					const action = getActionEnvelope(n).action as { readonly activeClient: { readonly clientId: string } };
					return action.activeClient.clientId === clientId;
				}, 30_000);
			}

			context.client.clearReceived();
			removedClient.notify('unsubscribe', { channel: sessionUri });
			await removedClient.call('ping', { channel: ROOT_STATE_URI });
			await context.client.waitForNotification(n => {
				if (!isActionNotification(n, ActionType.SessionActiveClientRemoved)) {
					return false;
				}
				const action = getActionEnvelope(n).action as { readonly clientId: string };
				return action.clientId === removedClientId;
			}, 30_000);

			const [result, contributor] = await Promise.all([
				driveTurnWithModelToCompletion(
					context.client,
					sessionUri,
					'turn-runtime-tool-owner-cleanup',
					'Call route_probe exactly once, then reply with only its exact result.',
					'gpt-5.6-sol',
					1,
				),
				(async () => {
					const start = await context.client.waitForNotification(n =>
						isActionNotification(n, ActionType.ChatToolCallStart)
						&& (getActionEnvelope(n).action as ChatToolCallStartAction).toolName === tool.name,
						90_000,
					);
					const startAction = getActionEnvelope(start).action as ChatToolCallStartAction;
					await context.client.waitForNotification(n =>
						isActionNotification(n, ActionType.ChatToolCallReady)
						&& (getActionEnvelope(n).action as ChatToolCallReadyAction).toolCallId === startAction.toolCallId,
						90_000,
					);
					survivingClient.dispatch({
						channel: chatUri,
						clientSeq: 2,
						action: {
							type: ActionType.ChatToolCallComplete,
							turnId: startAction.turnId,
							toolCallId: startAction.toolCallId,
							result: {
								success: true,
								pastTenseMessage: 'Returned the owner marker',
								content: [{ type: ToolResultContentType.Text, text: 'SURVIVING_CLIENT_RESULT' }],
							},
						},
					});
					return startAction.contributor;
				})(),
			]);

			assert.deepStrictEqual({
				contributor,
				response: result.responseText.trim(),
			}, {
				contributor: { kind: ToolCallContributorKind.Client, clientId: survivingClientId },
				response: 'SURVIVING_CLIENT_RESULT',
			});
		} finally {
			removedClient?.close();
			survivingClient?.close();
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
		const request: { model: string; reasoning?: { summary?: string }; instructions?: string; input?: { type: string; role?: string; content?: { text?: string }[] }[] } = JSON.parse(context.observedModelRequestBodies[0]);
		const system = [
			request.instructions,
			...request.input?.filter(item => item.type === 'message' && item.role === 'system').flatMap(item => item.content?.map(part => part.text) ?? []) ?? [],
		].join('\n');
		assert.deepStrictEqual({
			model: request.model,
			reasoningSummary: request.reasoning?.summary,
			continuationGuidance: system.includes('If the user asks a side question while a task is in progress, answer it briefly and then continue the unfinished task unless they ask you to stop, pause, or change direction.'),
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
