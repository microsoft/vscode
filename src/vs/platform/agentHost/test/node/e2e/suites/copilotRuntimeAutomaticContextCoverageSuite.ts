/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CopilotCliConfigKey, type CopilotCliModelCapabilityOverrides } from '../../../../common/copilotCliConfig.js';
import { readHostSnapshotAttachmentMeta, toHostSnapshotAttachmentMeta } from '../../../../common/meta/agentSnapshotAttachmentMeta.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import type { ResourceReadResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, type IRootConfigChangedAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageAttachmentKind, readUsageInfoMeta, ResponsePartKind, ROOT_STATE_URI, type ChatState, type MessageAttachment, type RootState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, driveTurnToCompletion, driveTurnWithAttachmentsToCompletion, driveTurnWithModelToCompletion } from '../harness/agentHostE2ETestHarness.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

interface IAutomaticContextSession {
	readonly sessionUri: string;
	readonly chatUri: string;
	readonly workspace: string;
	readonly manifests: readonly string[];
	clientSeq: number;
	modelSelected: boolean;
}

interface INativeContentBlock {
	readonly type: string;
	readonly text?: string;
	readonly content?: string | readonly INativeContentBlock[];
}

interface INativeRequest {
	readonly model: string;
	readonly max_tokens?: number;
	readonly tools?: readonly object[];
	readonly tool_choice?: string | { readonly type?: string };
	readonly messages: readonly { readonly role: string; readonly content: string | readonly INativeContentBlock[] }[];
}

const model = 'claude-sonnet-5';
const promptBudget = 28_672;
const outputBudget = 2_048;
const targetContents = 'AUTOMATIC_CONTEXT_VERIFIED';

export function defineCopilotRuntimeAutomaticContextCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	let rootClientSeq = 7000;

	async function setOverrides(overrides: CopilotCliModelCapabilityOverrides): Promise<void> {
		const key = CopilotCliConfigKey.ModelCapabilityOverrides;
		context.client.clearReceived();
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: rootClientSeq++,
			action: { type: ActionType.RootConfigChanged, config: { [key]: overrides } },
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.RootConfigChanged)
			&& JSON.stringify((getActionEnvelope(notification).action as IRootConfigChangedAction).config[key]) === JSON.stringify(overrides), 30_000);
	}

	function manifest(service: number): string {
		return JSON.stringify({
			schemaVersion: 1,
			project: 'synthetic-node-service-project',
			service: `service-${service}`,
			runtime: { nodeVersion: '>=22', moduleType: 'commonjs', strictValidation: true },
			verification: service === 0 ? { file: 'retained-verification.txt', meaning: 'Read this file when the configuration review is finished.' } : undefined,
			routes: Array.from({ length: 12 }, (_, route) => ({
				id: `service-${service}-route-${route}`,
				method: route % 2 === 0 ? 'GET' : 'POST',
				path: `/services/service-${service}/route-${route}/health`,
				entry: `handlers/service-${service}/route-${route}.cjs`,
				response: { schema: 'HealthStatus', successStatus: 200 },
				timeoutMillis: 1000 + service * 20 + route,
				cache: { seconds: 30 + route, keyFields: ['route', 'region'] },
				headers: { accept: 'application/json', 'content-type': 'application/json' },
				dependencies: ['core-loader', 'schema-validator'],
				retry: { attempts: 3, backoffMillis: 50 + route },
				tests: { scenario: 'health-check', fixture: `fixtures/service-${service}/health-${route}.json` },
			})),
			manifestMarker: `AUTOMATIC_MANIFEST_${service}`,
		});
	}

	async function chatState(session: IAutomaticContextSession): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: session.chatUri });
		return result.snapshot!.state as ChatState;
	}

	async function withSession(run: (session: IAutomaticContextSession) => Promise<void>): Promise<void> {
		let original: CopilotCliModelCapabilityOverrides | undefined;
		let session: IAutomaticContextSession | undefined;
		try {
			const parent = join(process.cwd(), '.build', 'agent-host-automatic-context-fixtures');
			mkdirSync(parent, { recursive: true });
			const workspace = mkdtempSync(join(parent, 'project-'));
			context.tempDirs.push(workspace);
			execFileSync('git', ['init', '--quiet', workspace]);
			const manifests = Array.from({ length: 10 }, (_, index) => `service-${index}.json`);
			let totalCharacters = 0;
			for (const [index, name] of manifests.entries()) {
				const content = manifest(index);
				assert.ok(content.length < 7600, 'Each native view result must fit below the SDK large-output spill threshold');
				totalCharacters += content.length;
				writeFileSync(join(workspace, name), content);
			}
			assert.ok(totalCharacters >= 40_000 && totalCharacters <= 80_000);
			writeFileSync(join(workspace, 'retained-verification.txt'), targetContents);
			const sessionUri = await createRealSession(context.client, context.config, 'runtime-automatic-context-client', context.createdSessions, URI.file(workspace), async () => {
				const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
				const values = (root.snapshot!.state as RootState).config?.values;
				original = values?.[CopilotCliConfigKey.ModelCapabilityOverrides] as CopilotCliModelCapabilityOverrides | undefined ?? {};
				await setOverrides({
					...original,
					[model]: {
						...original[model],
						availableTools: ['builtin:view', 'builtin:sql'],
						modelCapabilities: {
							...original[model]?.modelCapabilities,
							limits: { max_context_window_tokens: 32_768, max_prompt_tokens: promptBudget, max_output_tokens: outputBudget },
						},
					},
				});
			});
			session = { sessionUri, chatUri: buildDefaultChatUri(sessionUri), workspace, manifests, clientSeq: 1, modelSelected: false };
			await run(session);
		} finally {
			try {
				if (session) {
					const state = await chatState(session);
					if (state.activeTurn) {
						const turnId = state.activeTurn.id;
						context.client.dispatch({
							channel: session.chatUri, clientSeq: session.clientSeq++,
							action: { type: ActionType.ChatTurnCancelled, turnId, duration: 0 },
						});
						await context.client.waitForNotification(notification =>
							isActionNotification(notification, ActionType.ChatTurnCancelled)
							&& getActionEnvelope(notification).channel === session!.chatUri, 30_000);
					}
				}
			} finally {
				if (original) {
					await setOverrides(original);
				}
			}
		}
	}

	function request(body: string): INativeRequest {
		const value: INativeRequest = JSON.parse(body);
		assert.strictEqual(value.model, model);
		assert.ok(Array.isArray(value.messages));
		return value;
	}

	function contentText(content: string | readonly INativeContentBlock[] | undefined): string {
		if (typeof content === 'string') {
			return content;
		}
		return content?.map(block => block.text ?? contentText(block.content)).join('\n') ?? '';
	}

	function isSummary(value: INativeRequest): boolean {
		return contentText(value.messages.at(-1)?.content).includes('Please create a detailed summary of the conversation so far.');
	}

	function retainedSummary(value: INativeRequest): string | undefined {
		return value.messages.filter(message => message.role === 'user').map(message => contentText(message.content))
			.find(text => text.includes('Some of the conversation history has been summarized to free up context.')
				&& text.includes('Here is a summary of the prior context:\n<summary>'));
	}

	async function turn(session: IAutomaticContextSession, turnId: string, text: string): Promise<readonly INativeRequest[]> {
		const start = context.observedModelRequestBodies.length;
		const clientSeq = session.clientSeq;
		session.clientSeq += 100;
		if (session.modelSelected) {
			await driveTurnToCompletion(context.client, session.sessionUri, turnId, text, clientSeq);
		} else {
			session.modelSelected = true;
			await driveTurnWithModelToCompletion(context.client, session.sessionUri, turnId, text, model, clientSeq);
		}
		return context.observedModelRequestBodies.slice(start).map(request);
	}

	function assertResult(session: IAutomaticContextSession, turnId: string, toolName: 'view' | 'sql', expected: RegExp, requests: readonly INativeRequest[]): void {
		assertToolCallCompleteText(context.client, { channel: session.chatUri, turnId, toolNames: [toolName], expected: [expected], success: true });
		const results = requests.filter(value => !isSummary(value)).flatMap(value => value.messages
			.flatMap(message => typeof message.content === 'string' ? [] : message.content.filter(block => block.type === 'tool_result')));
		assert.ok(results.some(block => expected.test(contentText(block.content))), 'Actual native tool output must be delivered to the model');
	}

	async function assertAutomaticSummaries(session: IAutomaticContextSession, turnId: string, requests: readonly INativeRequest[]): Promise<void> {
		const summaries = requests.filter(isSummary);
		if (summaries.length === 0) {
			return;
		}
		for (const summary of summaries) {
			const choice = typeof summary.tool_choice === 'string' ? summary.tool_choice : summary.tool_choice?.type;
			assert.ok(choice === 'none' || (summary.tools?.length ?? 0) === 0);
		}
		const usage = (await chatState(session)).turns.find(item => item.id === turnId)?.usage;
		assert.ok(usage, 'The automatic-compaction turn must report native usage over AHP');
		const totals = readUsageInfoMeta(usage).turnTokenTotals;
		assert.ok(totals?.some(total => total.model === model && total.inputTokens > 0 && total.outputTokens > 0));
	}

	async function readManifests(session: IAutomaticContextSession): Promise<void> {
		let summaries = 0;
		let modelRequests = 0;
		for (const [index, name] of session.manifests.entries()) {
			const turnId = `automatic-context-read-${index}`;
			const requests = await turn(session, turnId,
				`Review the Node service configuration ${name}. Call view exactly once with path "${join(session.workspace, name)}" and forceReadLargeFiles true. Retain the first configuration's verification.file rule for my final check. Do not read its verification target yet, do not use SQL, and do not summarize the conversation explicitly. Reply exactly REVIEWED.`);
			assertResult(session, turnId, 'view', new RegExp(`AUTOMATIC_MANIFEST_${index}`), requests);
			const regular = requests.filter(value => !isSummary(value));
			assert.ok(regular.length > 0);
			assert.deepStrictEqual(regular.map(value => value.max_tokens), regular.map(() => 32_000),
				'Sonnet5 retains its native client output budget while the capability override controls context accounting');
			await assertAutomaticSummaries(session, turnId, requests);
			summaries += requests.filter(isSummary).length;
			modelRequests += requests.length;
		}
		assert.ok(summaries > 0,
			`Bounded review must automatically compact: ${JSON.stringify({ files: session.manifests.length, modelRequests, summaries, promptBudget, contextWindow: 32_768 })}`);
	}

	async function verifyFile(session: IAutomaticContextSession, turnId: string): Promise<void> {
		const requests = await turn(session, turnId,
			'The configuration review is finished. Call view exactly once to read the verification.file target from the first configuration you reviewed, not the configuration itself. Do not call SQL or other tools. Reply exactly VERIFIED.');
		assertResult(session, turnId, 'view', /AUTOMATIC_CONTEXT_VERIFIED/, requests);
		const firstRegular = requests.find(value => !isSummary(value));
		assert.ok(firstRegular);
		assert.ok(retainedSummary(firstRegular)?.includes('retained-verification.txt'), 'The native automatically compacted history must retain the external verification fact');
		assert.ok(!(await chatState(session)).turns.some(item => item.message.text.startsWith('/compact')));
	}

	function automaticTest(title: string, run: (session: IAutomaticContextSession) => Promise<void>): void {
		// Background summarization can race the next ordinary request in strict ordinal replay.
		(context.runRecordOnlyTests ? test : test.skip)(`runtime coverage automatic context: ${title}`, async function () {
			this.timeout(600_000);
			await withSession(run);
		});
	}

	automaticTest('configured prompt limits automatically summarize a real Node configuration review before verification', async session => {
		await readManifests(session);
		await verifyFile(session, 'automatic-context-verify');
	});

	automaticTest('automatic history replacement preserves a native SQL review ledger', async session => {
		const seedRequests = await turn(session, 'automatic-context-sql-seed',
			`Call sql exactly once with description "Create review ledger" and query "CREATE TABLE review_ledger (service INTEGER PRIMARY KEY, status TEXT); INSERT INTO review_ledger VALUES (0, 'AUTOMATIC_LEDGER_SEEDED'); SELECT status FROM review_ledger;". Do not call other tools. Reply exactly READY.`);
		assertResult(session, 'automatic-context-sql-seed', 'sql', /AUTOMATIC_LEDGER_SEEDED/, seedRequests);
		await readManifests(session);
		const requests = await turn(session, 'automatic-context-sql-verify',
			`Call sql exactly once with description "Complete review ledger" and query "UPDATE review_ledger SET status = 'AUTOMATIC_LEDGER_COMPLETED' WHERE service = 0; SELECT service, status FROM review_ledger;". Do not call other tools. Reply exactly VERIFIED.`);
		assertResult(session, 'automatic-context-sql-verify', 'sql', /AUTOMATIC_LEDGER_COMPLETED/, requests);
		assert.ok(requests.some(value => retainedSummary(value)?.includes('review_ledger')));
	});

	automaticTest('reviewing attached service configurations compacts history without losing snapshot facts', async session => {
		let summaries = 0;
		const routeRequests = await turn(session, 'automatic-context-attachment-route',
			`Call view exactly once on "${join(session.workspace, session.manifests[0])}" with forceReadLargeFiles true. Retain its verification.file rule for my final check. Do not read the target yet. Reply exactly READY.`);
		assertResult(session, 'automatic-context-attachment-route', 'view', /AUTOMATIC_MANIFEST_0/, routeRequests);
		for (let index = 0; index < session.manifests.length; index += 2) {
			const attachments: MessageAttachment[] = session.manifests.slice(index, index + 2).map(name => ({
				type: MessageAttachmentKind.Resource,
				label: name,
				uri: URI.file(join(session.workspace, name)).toString(),
				_meta: toHostSnapshotAttachmentMeta('application/json'),
			}));
			const turnId = `automatic-context-attachments-${index}`;
			const start = context.observedModelRequestBodies.length;
			const clientSeq = session.clientSeq;
			session.clientSeq += 100;
			await driveTurnWithAttachmentsToCompletion(context.client, session.sessionUri, turnId,
				'Review both attached Node service configurations. Call view once per attached file with forceReadLargeFiles true. Keep the first configuration verification rule. Do not call other tools, edit the read-only snapshots, or summarize the conversation explicitly. Reply exactly REVIEWED.',
				attachments, clientSeq);
			const requests = context.observedModelRequestBodies.slice(start).map(request);
			assertResult(session, turnId, 'view', new RegExp(`AUTOMATIC_MANIFEST_${index + 1}`), requests);
			await assertAutomaticSummaries(session, turnId, requests);
			summaries += requests.filter(isSummary).length;
		}
		assert.ok(summaries > 0);
		await verifyFile(session, 'automatic-context-attachments-verify');
		const firstTurn = (await chatState(session)).turns.find(item => item.id === 'automatic-context-attachments-0');
		const attachment = firstTurn?.message.attachments?.[0];
		assert.ok(attachment?.type === MessageAttachmentKind.Resource);
		assert.deepStrictEqual(readHostSnapshotAttachmentMeta(attachment), { isSnapshot: true, contentType: 'application/json' });
		const content = await context.client.call<ResourceReadResult>('resourceRead', { channel: ROOT_STATE_URI, uri: attachment.uri, encoding: ContentEncoding.Base64 });
		assert.strictEqual(content.encoding, ContentEncoding.Base64);
		assert.strictEqual(Buffer.from(content.data, 'base64').toString('utf8'), manifest(0));
	});

	automaticTest('cold resubscription restores automatically compacted history for the next native task', async session => {
		await readManifests(session);
		const before = await chatState(session);
		const partIds = (state: ChatState): readonly string[] => state.turns.flatMap(item => item.responseParts.flatMap(part =>
			part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning ? [part.id] : []));
		const beforeIds = partIds(before);
		assert.ok(beforeIds.length > 0);
		context.client.notify('unsubscribe', { channel: session.chatUri });
		context.client.notify('unsubscribe', { channel: session.sessionUri });
		await retry(async () => {
			try {
				await context.client.call<SubscribeResult>('subscribe', { channel: session.sessionUri });
				const restored = await chatState(session);
				const ids = partIds(restored);
				assert.deepStrictEqual(restored.turns.map(item => item.message.text), before.turns.map(item => item.message.text));
				assert.strictEqual(ids.length, beforeIds.length);
				assert.ok(ids.some((id, index) => id !== beforeIds[index]));
			} catch (error) {
				context.client.notify('unsubscribe', { channel: session.chatUri });
				context.client.notify('unsubscribe', { channel: session.sessionUri });
				throw error;
			}
		}, 50, 20);
		await verifyFile(session, 'automatic-context-resumed-verify');
	});
}
