/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import type { ChatErrorAction } from '../../../../common/state/protocol/actions.js';
import { CompletionItemKind, type CompletionsResult, type ResolveSessionConfigResult, type SessionConfigCompletionsResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import type { RootState } from '../../../../common/state/protocol/state.js';
import { ActionType, type RootAgentsChangedAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageAttachmentKind, MessageKind, ROOT_STATE_URI, type MessageAttachment, type SessionState } from '../../../../common/state/sessionState.js';
import {
	createRealSession,
	dispatchTurn,
	driveTurnWithCancelledInputToCompletion,
	driveTurnWithAttachmentsToCompletion,
	driveTurnToCompletion,
	driveTurnWithModelToCompletion,
	resolveGitHubToken,
} from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import { summarizeAnthropicRequest, summarizeResponsesRequest, type IReadableAnthropicRequest } from '../harness/capiWireCodec.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { providerHostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineCoreTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;
	const behaviorSnapshot = { profile: 'behavior' } as const;
	const modelSwitchTarget = config.modelSwitchTarget;
	const modelSwitchWireTarget = config.modelSwitchWireTarget ?? modelSwitchTarget;
	const modelSwitchReturnTarget = config.modelSwitchReturnTarget;
	const modelSwitchWireReturnTarget = config.modelSwitchWireReturnTarget ?? modelSwitchReturnTarget;
	const interactiveInputPrompt = config.interactiveInputPrompt;
	const cancelledInputPrompt = config.cancelledInputPrompt;
	const textInputPrompt = config.textInputPrompt;
	const multiSelectInputPrompt = config.multiSelectInputPrompt;

	function observedModelRequest(body: string | undefined): IReadableAnthropicRequest {
		assert.ok(body, 'Expected an observed model request');
		const request = summarizeAnthropicRequest(body) ?? summarizeResponsesRequest(body);
		assert.ok(request, `Expected an Anthropic or Responses model request: ${body}`);
		return request;
	}

	function modelContentText(value: unknown): string {
		if (typeof value === 'string') {
			return value;
		}
		if (Array.isArray(value)) {
			return value.map(modelContentText).join('');
		}
		if (isRecord(value)) {
			if (typeof value.text === 'string') {
				return value.text;
			}
			return modelContentText(value.content);
		}
		return '';
	}

	function toolResultTexts(value: unknown): readonly string[] {
		if (Array.isArray(value)) {
			return value.flatMap(toolResultTexts);
		}
		if (!isRecord(value)) {
			return [];
		}
		return value.type === 'tool_result' ? [modelContentText(value.content)] : [];
	}

	function observedToolResultTexts(): readonly string[] {
		const request = observedModelRequest(context.observedModelRequestBodies.at(-1));
		return request.messages.flatMap(message => toolResultTexts(message.content));
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
	}

	async function createSessionWithWorkingDirectories(prefix: string, workingDirectories: readonly URI[]): Promise<string> {
		const clientWorkspace = workingDirectories[0]?.fsPath ?? mkdtempSync(join(tmpdir(), 'ahp-client-workspace-'));
		if (workingDirectories.length === 0) {
			tempDirs.push(clientWorkspace);
		}
		context.client.setWorkingDirectory(clientWorkspace);
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `${prefix}-${config.provider}`,
		}, 30_000);
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			workingDirectories: workingDirectories.map(directory => directory.toString()),
			config: { isolation: 'folder' },
		}, 30_000);
		createdSessions.push(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		context.client.clearReceived();
		return sessionUri;
	}

	async function createAdditionalSession(workingDirectory: URI): Promise<string> {
		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			workingDirectories: [workingDirectory.toString()],
			config: { isolation: 'folder' },
		}, 30_000);
		createdSessions.push(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		context.client.clearReceived();
		return sessionUri;
	}

	async function prepareInputSession(sessionUri: string): Promise<number> {
		if (!config.inputRequestMode) {
			return 1;
		}
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: { type: ActionType.SessionConfigChanged, config: { mode: config.inputRequestMode } },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'session/configChanged')
			&& getActionEnvelope(n).channel === sessionUri,
			30_000,
		);
		return 2;
	}

	test('sends a simple message and receives a response', async function () {
		this.timeout(120_000);

		const workspaceDir = mkdtempSync(`${tmpdir()}/read-sdk-simple`);
		tempDirs.push(workspaceDir);

		const sessionUri = await createRealSession(context.client, config, `real-sdk-simple-${config.provider}`, createdSessions, URI.file(workspaceDir));
		dispatchTurn(context.client, sessionUri, 'turn-1', 'Say exactly "hello" and nothing else', 1);

		const complete = await context.client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
		const completeAction = getActionEnvelope(complete).action as { turnId: string };
		assert.strictEqual(completeAction.turnId, 'turn-1');

		const responseParts = context.client.receivedNotifications(n => isActionNotification(n, 'chat/responsePart'));
		assert.ok(responseParts.length > 0, 'should have received at least one response part');
	});

	test('preserves a fenced multiline markdown response', async function () {
		this.timeout(120_000);
		const workspaceDir = mkdtempSync(join(tmpdir(), 'ahp-markdown-response-'));
		tempDirs.push(workspaceDir);
		const sessionUri = await createRealSession(
			context.client,
			config,
			`markdown-response-${config.provider}`,
			createdSessions,
			URI.file(workspaceDir),
		);
		const expected = '```text\nALPHA\nBETA\n```';

		const result = await driveTurnToCompletion(
			context.client,
			sessionUri,
			'turn-markdown-response',
			`Reply with exactly this Markdown code block and nothing else:\n${expected}`,
			1,
		);

		assert.strictEqual(result.responseText, expected);
	});

	test('listModels returns well-shaped model entries after authenticate', async function () {
		this.timeout(60_000);

		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-list-models-${config.provider}` }, 30_000);

		// Subscribe to root state *before* authenticating so we can observe
		// the agentsChanged action that carries the populated model list.
		const rootResult = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI }, 30_000);
		const initial = rootResult.snapshot!.state as RootState;
		const providerAgent = initial.agents.find(a => a.provider === config.provider);
		assert.ok(providerAgent, `Expected ${config.provider} agent in root state, got: ${initial.agents.map(a => a.provider).join(', ')}`);

		await context.client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

		// Models load asynchronously after the *first* authenticate against
		// the shared server. If a sibling test already authenticated, the
		// list is in the subscribe snapshot already; otherwise wait for the
		// `agentsChanged` action that populates them.
		let agent = providerAgent;
		if (agent.models.length === 0) {
			try {
				const notif = await context.client.waitForNotification(n => {
					if (!isActionNotification(n, 'root/agentsChanged')) {
						return false;
					}
					const action = getActionEnvelope(n).action as RootAgentsChangedAction;
					const a = action.agents.find(a => a.provider === config.provider);
					return !!a && a.models.length > 0;
				}, 30_000);
				const action = getActionEnvelope(notif).action as RootAgentsChangedAction;
				agent = action.agents.find(a => a.provider === config.provider)!;
			} catch (err) {
				// Surface every agentsChanged we did see so failures point
				// at the actual data instead of a bare timeout.
				const seen = context.client.receivedNotifications(n => isActionNotification(n, 'root/agentsChanged'))
					.map(n => {
						const a = getActionEnvelope(n).action as RootAgentsChangedAction;
						const entry = a.agents.find(x => x.provider === config.provider);
						return entry ? { modelCount: entry.models.length, modelIds: entry.models.map(m => m.id) } : { missing: true };
					});
				throw new Error(`${config.provider}: timed out waiting for agentsChanged with non-empty models. Observed agentsChanged: ${JSON.stringify(seen)}. Original error: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		assert.ok(agent.models.length > 0, 'Expected at least one model from listModels');
		const expectedModelProviders = config.modelProviders ?? [config.provider];

		for (const model of agent.models) {
			assert.strictEqual(typeof model.id, 'string', `model.id should be a string: ${JSON.stringify(model)}`);
			assert.ok(model.id.length > 0, `model.id should be non-empty: ${JSON.stringify(model)}`);
			assert.strictEqual(typeof model.name, 'string', `model.name should be a string: ${JSON.stringify(model)}`);
			assert.ok(expectedModelProviders.includes(model.provider), `model.provider should be one of ${expectedModelProviders.join(', ')}: ${JSON.stringify(model)}`);
			assert.ok(model.maxContextWindow === undefined || (typeof model.maxContextWindow === 'number' && model.maxContextWindow >= 0),
				`model.maxContextWindow should be undefined or a non-negative number: ${JSON.stringify(model)}`);
			assert.ok(model.supportsVision === undefined || typeof model.supportsVision === 'boolean',
				`model.supportsVision should be boolean or undefined: ${JSON.stringify(model)}`);
		}
	});

	test('retains context across consecutive turns', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-memory-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-memory-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const first = await driveTurnToCompletion(context.client, sessionUri, 'turn-memory-1', 'Remember the code word ORCHID. Reply exactly "ready".', 1);
		assert.match(first.responseText, /ready/i);

		context.client.beginAhpSnapshotRound();
		const second = await driveTurnToCompletion(context.client, sessionUri, 'turn-memory-2', 'What code word did I ask you to remember? Reply with only the code word.', 10);
		assert.match(second.responseText, /ORCHID/i);
		await assertRecordedAhpSnapshot(this.test!, context.client, behaviorSnapshot);
	});

	(modelSwitchTarget ? test : test.skip)('client-selected model is used for the turn', async function () {
		this.timeout(180_000);
		assert.ok(modelSwitchTarget);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-model-switch-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `model-switch-${config.provider}`, createdSessions, URI.file(workspace));

		const result = await driveTurnWithModelToCompletion(
			context.client,
			sessionUri,
			'turn-model-switch',
			'Reply exactly "model selected".',
			modelSwitchTarget,
			1,
		);

		assert.deepStrictEqual({
			model: observedModelRequest(context.observedModelRequestBodies.at(-1)).model,
			response: result.responseText.trim(),
		}, {
			model: modelSwitchWireTarget,
			response: 'model selected',
		});
	});

	(interactiveInputPrompt ? test : test.skip)('provider input request is answered through AHP', async function () {
		this.timeout(180_000);
		assert.ok(interactiveInputPrompt);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-input-request-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `input-request-${config.provider}`, createdSessions, URI.file(workspace));
		const clientSeq = await prepareInputSession(sessionUri);

		const result = await driveTurnToCompletion(
			context.client,
			sessionUri,
			'turn-input-request',
			interactiveInputPrompt,
			clientSeq,
		);

		assert.deepStrictEqual({
			sawInputRequest: result.sawInputRequest,
			forwardedAnswer: observedToolResultTexts().some(text => text.includes('Apple')),
		}, {
			sawInputRequest: true,
			forwardedAnswer: true,
		});
	});

	(modelSwitchTarget && modelSwitchReturnTarget ? test : test.skip)('model changes between turns retain provider context', async function () {
		this.timeout(180_000);
		assert.ok(modelSwitchTarget);
		assert.ok(modelSwitchReturnTarget);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-model-change-context-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `model-change-context-${config.provider}`, createdSessions, URI.file(workspace));

		const first = await driveTurnWithModelToCompletion(
			context.client,
			sessionUri,
			'turn-model-change-first',
			'Remember the exact code word MARIGOLD. Reply exactly "ready".',
			modelSwitchTarget,
			1,
		);
		const second = await driveTurnWithModelToCompletion(
			context.client,
			sessionUri,
			'turn-model-change-second',
			'Reply with only the exact code word I asked you to remember.',
			modelSwitchReturnTarget,
			10,
		);

		assert.deepStrictEqual({
			models: context.observedModelRequestBodies.slice(-2).map(body => observedModelRequest(body).model),
			first: first.responseText.trim(),
			secondRemembersCodeWord: /MARIGOLD/i.test(second.responseText),
		}, {
			models: [modelSwitchWireTarget, modelSwitchWireReturnTarget],
			first: 'ready',
			secondRemembersCodeWord: true,
		});
	});

	(cancelledInputPrompt ? test : test.skip)('provider input request cancellation returns to the turn', async function () {
		this.timeout(180_000);
		assert.ok(cancelledInputPrompt);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-input-cancel-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `input-cancel-${config.provider}`, createdSessions, URI.file(workspace));
		const clientSeq = await prepareInputSession(sessionUri);

		const result = await driveTurnWithCancelledInputToCompletion(
			context.client,
			sessionUri,
			'turn-input-cancel',
			cancelledInputPrompt,
			clientSeq,
		);

		assert.deepStrictEqual({
			sawInputRequest: result.sawInputRequest,
			responseEndsWithCancelled: result.responseText.trim().endsWith('cancelled'),
		}, {
			sawInputRequest: true,
			responseEndsWithCancelled: true,
		});
	});

	(interactiveInputPrompt && config.supportsPausedTurnCancellationE2E ? test : test.skip)('cancelling a turn paused for input allows a replacement turn', async function () {
		this.timeout(180_000);
		assert.ok(interactiveInputPrompt);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-cancel-input-turn-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `cancel-input-turn-${config.provider}`, createdSessions, URI.file(workspace));
		const clientSeq = await prepareInputSession(sessionUri);
		const chatUri = buildDefaultChatUri(sessionUri);
		const turnId = 'turn-cancel-input';
		dispatchTurn(context.client, sessionUri, turnId, interactiveInputPrompt, clientSeq);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/inputRequested')
			&& getActionEnvelope(n).channel === chatUri,
			90_000,
		);
		context.client.dispatch({
			channel: chatUri,
			clientSeq: clientSeq + 1,
			action: { type: ActionType.ChatTurnCancelled, turnId, duration: 0 },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnCancelled')
			&& getActionEnvelope(n).channel === chatUri,
			30_000,
		);
		const replacement = await driveTurnToCompletion(
			context.client,
			sessionUri,
			'turn-after-input-cancel',
			'Reply exactly "replacement".',
			clientSeq + 2,
		);

		assert.strictEqual(replacement.responseText.trim(), 'replacement');
	});

	(textInputPrompt ? test : test.skip)('provider freeform input is answered through AHP', async function () {
		this.timeout(180_000);
		assert.ok(textInputPrompt);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-input-text-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `input-text-${config.provider}`, createdSessions, URI.file(workspace));
		const clientSeq = await prepareInputSession(sessionUri);

		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-input-text', textInputPrompt, clientSeq);

		assert.deepStrictEqual({
			sawInputRequest: result.sawInputRequest,
			forwardedAnswer: observedToolResultTexts().some(text => text.includes('interactive')),
		}, {
			sawInputRequest: true,
			forwardedAnswer: true,
		});
	});

	(multiSelectInputPrompt ? test : test.skip)('provider multi-select input is answered through AHP', async function () {
		this.timeout(180_000);
		assert.ok(multiSelectInputPrompt);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-input-multi-select-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `input-multi-select-${config.provider}`, createdSessions, URI.file(workspace));

		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-input-multi-select', multiSelectInputPrompt, 1);
		const forwardedSelections = observedToolResultTexts();

		assert.deepStrictEqual({
			sawInputRequest: result.sawInputRequest,
			forwardedSelectionsContainRed: forwardedSelections.length > 0 && forwardedSelections.every(text => text.includes('Red')),
		}, {
			sawInputRequest: true,
			forwardedSelectionsContainRed: true,
		});
	});

	(config.supportsWorkspacelessE2E ? test : test.skip)('workspaceless session materializes and completes a turn', async function () {
		this.timeout(180_000);
		const sessionUri = await createSessionWithWorkingDirectories('workspaceless', []);

		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-workspaceless', 'Reply exactly "workspaceless".', 1);
		const session = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });

		assert.deepStrictEqual({
			response: result.responseText.trim(),
			workingDirectoryCount: (session.snapshot!.state as SessionState).workingDirectories?.length,
		}, {
			response: 'workspaceless',
			workingDirectoryCount: 1,
		});
	});

	(config.supportsRuntimeSlashCommandsE2E ? test : test.skip)('materialized provider exposes runtime slash command completions', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-runtime-slash-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `runtime-slash-${config.provider}`, createdSessions, URI.file(workspace));
		await driveTurnToCompletion(context.client, sessionUri, 'turn-runtime-slash', 'Reply exactly "ready".', 1);

		const completions = await context.client.call<CompletionsResult>('completions', {
			channel: buildDefaultChatUri(sessionUri),
			kind: CompletionItemKind.UserMessage,
			text: '/',
			offset: 1,
		});

		assert.ok(completions.items.some(item => item.insertText.startsWith('/')));
	});

	if (config.supportsAttachmentsE2E) {
		test('default chat simple attachment reaches the provider request', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-simple-attachment-'));
			tempDirs.push(workspace);
			const sessionUri = await createRealSession(context.client, config, `simple-attachment-${config.provider}`, createdSessions, URI.file(workspace));
			const attachments: MessageAttachment[] = [{
				type: MessageAttachmentKind.Simple,
				label: 'facts.txt',
				modelRepresentation: 'ATTACHMENT_SIMPLE_VALUE',
			}];

			const result = await driveTurnWithAttachmentsToCompletion(
				context.client,
				sessionUri,
				'turn-simple-attachment',
				'Reply with only the value provided directly in the attachment. Do not inspect the workspace or use tools.',
				attachments,
				1,
			);

			assert.ok(result.responseText.includes('ATTACHMENT_SIMPLE_VALUE'));
		});

		test('default chat resource attachment reaches the provider request', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-resource-attachment-'));
			tempDirs.push(workspace);
			const file = join(workspace, 'resource.txt');
			writeFileSync(file, 'ATTACHMENT_RESOURCE_VALUE');
			const sessionUri = await createRealSession(context.client, config, `resource-attachment-${config.provider}`, createdSessions, URI.file(workspace));
			const attachments: MessageAttachment[] = [{
				type: MessageAttachmentKind.Resource,
				label: 'resource.txt',
				uri: URI.file(file).toString(),
			}];

			const result = await driveTurnWithAttachmentsToCompletion(
				context.client,
				sessionUri,
				'turn-resource-attachment',
				'Read the attached resource and reply with only its exact contents.',
				attachments,
				1,
			);

			assert.ok(result.responseText.includes('ATTACHMENT_RESOURCE_VALUE'));
		});

		test('default chat embedded text attachment reaches the provider request', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-embedded-attachment-'));
			tempDirs.push(workspace);
			const sessionUri = await createRealSession(context.client, config, `embedded-attachment-${config.provider}`, createdSessions, URI.file(workspace));
			const attachments: MessageAttachment[] = [{
				type: MessageAttachmentKind.EmbeddedResource,
				label: 'embedded.txt',
				contentType: 'text/plain',
				data: Buffer.from('ATTACHMENT_EMBEDDED_VALUE').toString('base64'),
			}];

			const result = await driveTurnWithAttachmentsToCompletion(
				context.client,
				sessionUri,
				'turn-embedded-attachment',
				'Read the embedded attachment and reply with only its exact contents.',
				attachments,
				1,
			);

			assert.ok(result.responseText.includes('ATTACHMENT_EMBEDDED_VALUE'));
		});

		test('chat attachment pins the latest completed source turn', async function () {
			this.timeout(240_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-chat-attachment-latest-'));
			tempDirs.push(workspace);
			const source = await createRealSession(context.client, config, `chat-attachment-source-${config.provider}`, createdSessions, URI.file(workspace));
			await driveTurnToCompletion(
				context.client,
				source,
				'turn-chat-attachment-source',
				'Remember CHAT_ATTACHMENT_LATEST. Reply exactly "ready".',
				1,
			);
			const target = await createAdditionalSession(URI.file(workspace));
			const attachments: MessageAttachment[] = [{
				type: MessageAttachmentKind.Chat,
				label: 'Source conversation',
				resource: buildDefaultChatUri(source),
			}];

			const result = await driveTurnWithAttachmentsToCompletion(
				context.client,
				target,
				'turn-chat-attachment-target',
				'Reply with only the code word from the attached conversation.',
				attachments,
				10,
			);

			assert.ok(result.responseText.includes('CHAT_ATTACHMENT_LATEST'));
		});

		test('chat attachment end turn excludes later source turns', async function () {
			this.timeout(240_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-chat-attachment-bounded-'));
			tempDirs.push(workspace);
			const source = await createRealSession(context.client, config, `chat-attachment-bounded-source-${config.provider}`, createdSessions, URI.file(workspace));
			await driveTurnToCompletion(
				context.client,
				source,
				'turn-chat-attachment-alpha',
				'Remember CHAT_ATTACHMENT_ALPHA. Reply exactly "ready".',
				1,
			);
			await driveTurnToCompletion(
				context.client,
				source,
				'turn-chat-attachment-beta',
				'Now remember CHAT_ATTACHMENT_BETA too. Reply exactly "ready".',
				10,
			);
			const target = await createAdditionalSession(URI.file(workspace));
			const attachments: MessageAttachment[] = [{
				type: MessageAttachmentKind.Chat,
				label: 'Bounded source conversation',
				resource: buildDefaultChatUri(source),
				endTurn: 'turn-chat-attachment-alpha',
			}];

			const result = await driveTurnWithAttachmentsToCompletion(
				context.client,
				target,
				'turn-chat-attachment-bounded-target',
				'Reply exactly "alpha only" if the attachment contains CHAT_ATTACHMENT_ALPHA but not CHAT_ATTACHMENT_BETA.',
				attachments,
				20,
			);

			assert.strictEqual(result.responseText.trim(), 'alpha only');
		});
	}

	if (config.supportsTruncateE2E) {
		test('truncating a materialized chat removes later context and allows continuation', async function () {
			this.timeout(240_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-truncate-'));
			tempDirs.push(workspace);
			const sessionUri = await createRealSession(context.client, config, `truncate-${config.provider}`, createdSessions, URI.file(workspace));
			await driveTurnToCompletion(context.client, sessionUri, 'turn-truncate-first', 'Remember ALPHA. Reply exactly "ready".', 1);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-truncate-second', 'Now remember BETA too. Reply exactly "ready".', 10);
			const chatUri = buildDefaultChatUri(sessionUri);
			context.client.dispatch({
				channel: chatUri,
				clientSeq: 20,
				action: { type: ActionType.ChatTruncated, turnId: 'turn-truncate-first' },
			});
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/truncated')
				&& getActionEnvelope(n).channel === chatUri,
				30_000,
			);

			const result = await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-truncate-followup',
				'Reply with exactly "ALPHA only".',
				30,
			);
			const state = await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });

			assert.deepStrictEqual({
				response: result.responseText.trim(),
				messages: (state.snapshot!.state as { readonly turns: readonly { readonly message: { readonly text: string } }[] }).turns.map(turn => turn.message.text),
			}, {
				response: 'ALPHA only',
				messages: [
					'Remember ALPHA. Reply exactly "ready".',
					'Reply with exactly "ALPHA only".',
				],
			});
		});
	}

	providerHostOnlyTest(context, 'provider session config schema is exposed through AHP', async function () {
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `config-schema-${config.provider}`,
		}, 30_000);
		const resolved = await context.client.call<ResolveSessionConfigResult>('resolveSessionConfig', {
			channel: ROOT_STATE_URI,
			provider: config.provider,
			workingDirectories: [],
		}, 30_000);

		assert.deepStrictEqual({
			schemaType: resolved.schema.type,
			hasProperties: Object.keys(resolved.schema.properties ?? {}).length > 0,
			valuesType: typeof resolved.values,
		}, {
			schemaType: 'object',
			hasProperties: true,
			valuesType: 'object',
		});
	});

	providerHostOnlyTest(context, 'provider session config completions are deterministic', async function () {
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `config-completions-${config.provider}`,
		}, 30_000);
		const result = await context.client.call<SessionConfigCompletionsResult>('sessionConfigCompletions', {
			channel: ROOT_STATE_URI,
			provider: config.provider,
			property: 'mode',
			query: '',
			workingDirectories: [],
		}, 30_000);

		assert.ok(Array.isArray(result.items));
	});

	providerHostOnlyTest(context, 'stale model selection fails the turn without contacting a model', async function () {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-stale-model-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `stale-model-${config.provider}`, createdSessions, URI.file(workspace));
		const chatUri = buildDefaultChatUri(sessionUri);
		const turnId = 'turn-stale-model';
		context.client.dispatch({
			channel: chatUri,
			clientSeq: 1,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: new Date().toISOString(),
				message: {
					text: 'This turn must fail before contacting a model.',
					origin: { kind: MessageKind.User },
					model: { id: 'e2e-model-that-does-not-exist' },
				},
			},
		});

		const failed = await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/error')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { readonly turnId: string }).turnId === turnId,
			30_000,
		);
		const action = getActionEnvelope(failed).action as ChatErrorAction;

		assert.deepStrictEqual({
			errorType: action.part.error.errorType,
			mentionsModel: /model/i.test(action.part.error.message),
		}, {
			errorType: config.provider === 'copilotcli' ? 'sendFailed' : config.provider === 'claude' ? 'success' : 'modelSelectionFailed',
			mentionsModel: true,
		});
	});

}
