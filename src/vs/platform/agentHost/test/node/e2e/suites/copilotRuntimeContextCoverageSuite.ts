/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { retry } from '../../../../../../base/common/async.js';
import { dirname, join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../common/agent.js';
import { readHostSnapshotAttachmentMeta, toHostSnapshotAttachmentMeta } from '../../../../common/meta/agentSnapshotAttachmentMeta.js';
import { ChatSourceKind, type ResourceReadResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageAttachmentKind, readUsageInfoMeta, ResponsePartKind, ROOT_STATE_URI, type ChatState, type MessageAttachment } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, driveChatTurnToCompletion, driveTurnWithAttachmentsToCompletion, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { summarizeAnthropicRequest, summarizeResponsesRequest, type IReadableAnthropicRequest } from '../harness/capiWireCodec.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

interface IContextSession {
	readonly sessionUri: string;
	readonly chatUri: string;
	readonly workspace: string;
	clientSeq: number;
}

interface IModelRequestOptions {
	readonly system?: string | readonly { readonly text?: string }[];
	readonly instructions?: string;
	readonly tool_choice?: string | { readonly type?: string };
	readonly tools?: readonly object[];
	readonly messages?: readonly { readonly role: string; readonly content: unknown }[];
	readonly input?: readonly { readonly role?: string; readonly content?: unknown }[];
}

export function defineCopilotRuntimeContextCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	async function createSession(files: Readonly<Record<string, string>>): Promise<IContextSession> {
		const workspace = mkdtempSync(join(process.cwd(), '.build', 'ahp-runtime-context-'));
		context.tempDirs.push(workspace);
		execFileSync('git', ['init', '--quiet', workspace]);
		for (const [name, content] of Object.entries(files)) {
			const path = join(workspace, name);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, content);
		}
		const sessionUri = await createRealSession(context.client, context.config, 'runtime-context-client', context.createdSessions, URI.file(workspace));
		return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), workspace, clientSeq: 1 };
	}

	async function chatState(chatUri: string): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		return result.snapshot!.state as ChatState;
	}

	function observedRequest(body: string | undefined): IReadableAnthropicRequest {
		assert.ok(body, 'Expected a native model request');
		const request = summarizeAnthropicRequest(body) ?? summarizeResponsesRequest(body);
		assert.ok(request, 'Expected an Anthropic or Responses request');
		return request;
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function contentText(value: unknown): string {
		if (typeof value === 'string') {
			return value;
		}
		if (Array.isArray(value)) {
			return value.map(contentText).join('\n');
		}
		if (isRecord(value)) {
			return contentText(value.text ?? value.content);
		}
		return '';
	}

	function toolBlocks(value: unknown, type: 'tool_use' | 'tool_result'): readonly Record<string, unknown>[] {
		if (Array.isArray(value)) {
			return value.flatMap(block => toolBlocks(block, type));
		}
		return isRecord(value) && value.type === type ? [value] : [];
	}

	function toolResultTexts(request: IReadableAnthropicRequest): readonly string[] {
		return request.messages.flatMap(message => toolBlocks(message.content, 'tool_result').map(block => contentText(block.content)));
	}

	function systemText(body: string): string {
		const options: IModelRequestOptions = JSON.parse(body);
		return contentText(options.system ?? options.instructions);
	}

	function rawMessages(body: string): readonly { readonly role?: string; readonly content?: unknown }[] {
		const request: IModelRequestOptions = JSON.parse(body);
		return request.messages ?? request.input ?? [];
	}

	function hasCompactionSummary(content: unknown): boolean {
		const text = contentText(content);
		return (text.includes('The conversation history has been summarized to free up context.')
			|| text.includes('Some of the conversation history has been summarized to free up context.'))
			&& text.includes('Here is a summary of the prior context:\n<summary>');
	}

	function compactedText(body: string, retainPostCompactionTools = false): string {
		const messages = rawMessages(body);
		const summaries = messages.filter(message =>
			message.role === 'user' && hasCompactionSummary(message.content));
		assert.strictEqual(summaries.length, 1, 'Manual compaction should replace the old history with one native summary message');
		if (!retainPostCompactionTools) {
			assert.strictEqual(messages.flatMap(message => toolBlocks(message.content, 'tool_use')).length, 0, 'Completed tool calls must not be replayed in a fresh post-compaction request');
		}
		return contentText(summaries[0].content);
	}

	async function turn(session: IContextSession, turnId: string, prompt: string): Promise<readonly string[]> {
		const start = context.observedModelRequestBodies.length;
		const clientSeq = session.clientSeq;
		session.clientSeq += 100;
		await driveChatTurnToCompletion(context.client, session.chatUri, turnId, prompt, clientSeq);
		return context.observedModelRequestBodies.slice(start);
	}

	async function attachmentTurn(session: IContextSession, turnId: string, attachment: MessageAttachment): Promise<void> {
		const clientSeq = session.clientSeq;
		session.clientSeq += 100;
		await driveTurnWithAttachmentsToCompletion(context.client, session.sessionUri, turnId,
			'Read the attached routing note. It names the workspace text file to read on my later verification request. Do not read the target yet. Do not use shell tools. Reply exactly READY.',
			[attachment], clientSeq);
	}

	function assertNativeResult(session: IContextSession, turnId: string, toolName: string, expected: RegExp): void {
		assertToolCallCompleteText(context.client, {
			channel: session.chatUri, turnId, toolNames: [toolName], expected: [expected],
		});
		const finalRequest = observedRequest(context.observedModelRequestBodies.at(-1));
		assert.ok(toolResultTexts(finalRequest).some(text => expected.test(text)), 'The actual native tool result must reach the next model request');
	}

	function assertSkillInvocation(session: IContextSession, turnId: string, name: string, instruction: string): void {
		const calls = new Set(context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallStart) && getActionEnvelope(notification).channel === session.chatUri)
			.map(notification => getActionEnvelope(notification).action as ChatToolCallStartAction)
			.filter(action => action.turnId === turnId && action.toolName === 'skill')
			.map(action => action.toolCallId));
		const completions = context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallComplete) && getActionEnvelope(notification).channel === session.chatUri)
			.map(notification => getActionEnvelope(notification).action as ChatToolCallCompleteAction)
			.filter(action => action.turnId === turnId && calls.has(action.toolCallId));
		assert.deepStrictEqual(completions.map(action => {
			const message = action.result.pastTenseMessage;
			const text = typeof message === 'string' ? message : message.markdown;
			return { success: action.result.success, namesSkill: text.includes(name), linksSkill: text.includes('/SKILL.md') };
		}), [{ success: true, namesSkill: true, linksSkill: true }]);
		const request = observedRequest(context.observedModelRequestBodies.at(-1));
		assert.ok(request.messages.some(message => contentText(message.content).includes(instruction)), 'The loaded native skill instructions must reach the model');
	}

	async function read(session: IContextSession, turnId: string, prompt: string, expected: RegExp): Promise<readonly string[]> {
		const requests = await turn(session, turnId, `${prompt} Use view, not shell tools. Read exactly one file. Then reply exactly VERIFIED.`);
		assertNativeResult(session, turnId, 'view', expected);
		return requests;
	}

	async function compact(session: IContextSession, turnId: string): Promise<string> {
		const requests = await turn(session, turnId, '/compact');
		assert.strictEqual(requests.length, 1, 'Manual compaction should make one native summarization request');
		const request = observedRequest(requests[0]);
		assert.ok(contentText(request.messages.at(-1)?.content).includes('Please create a detailed summary of the conversation so far.'));
		const options: IModelRequestOptions = JSON.parse(requests[0]);
		const toolChoice = typeof options.tool_choice === 'string' ? options.tool_choice : options.tool_choice?.type;
		assert.ok(toolChoice === 'none' || (options.tools?.length ?? 0) === 0, 'Summarization must disable tool selection or omit callable tool definitions');
		const toolCalls = context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallStart) && getActionEnvelope(notification).channel === session.chatUri)
			.map(notification => getActionEnvelope(notification).action as ChatToolCallStartAction)
			.filter(action => action.turnId === turnId);
		const state = await chatState(session.chatUri);
		const compactTurn = state.turns.find(item => item.id === turnId);
		assert.ok(compactTurn?.usage, 'Compaction should report the refreshed context-window occupancy over AHP');
		const totals = readUsageInfoMeta(compactTurn.usage).turnTokenTotals;
		const contextTokens = compactTurn.usage.inputTokens;
		assert.deepStrictEqual({
			executedTools: toolCalls.length,
			contextTokensAreNonnegativeIntegers: typeof contextTokens === 'number' && Number.isInteger(contextTokens) && contextTokens >= 0,
			conversationOutputTokens: compactTurn.usage.outputTokens,
			summarizationIsBilledToThisTurn: totals?.some(total => total.inputTokens > 0 && total.outputTokens > 0) ?? false,
		}, {
			executedTools: 0,
			contextTokensAreNonnegativeIntegers: true,
			conversationOutputTokens: 0,
			summarizationIsBilledToThisTurn: true,
		});
		return requests[0];
	}

	async function assertCompactionCount(session: IContextSession, turnId: string, count: number): Promise<void> {
		const state = await chatState(session.chatUri);
		const usage = state.turns.find(item => item.id === turnId)?.usage;
		assert.ok(usage, 'The completed native task should report usage over AHP');
		const body = context.observedModelRequestBodies.at(-1);
		assert.ok(body);
		if (count > 0) {
			assert.ok(systemText(body).includes(`- checkpoints/: ${count} prior checkpoints`), 'The native workspace metadata should report every successful compaction checkpoint');
		} else {
			assert.ok(!rawMessages(body).some(message => hasCompactionSummary(message.content)), 'Truncation must remove the discarded compaction context');
		}
		const attribution = readUsageInfoMeta(usage).contextAttribution;
		if (attribution) {
			assert.deepStrictEqual({
				compactions: attribution.compactions.count,
				totalTokensArePositiveIntegers: Number.isInteger(attribution.totalTokens) && attribution.totalTokens > 0,
			}, { compactions: count, totalTokensArePositiveIntegers: true });
		}
	}

	function skill(name: string, instruction: string): string {
		return `---\nname: ${name}\ndescription: Supplies a synthetic routing rule for context retention tests\n---\n${instruction}\n`;
	}

	function responsePartIds(state: ChatState): readonly string[] {
		return durableTurns(state).flatMap(item => item.responseParts.flatMap(part =>
			part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning ? [part.id] : []));
	}

	function durableTurns(state: ChatState): ChatState['turns'] {
		return state.turns.filter(item => item.message.text !== '/compact');
	}

	function routingFiles(): Record<string, string> {
		return {
			'routing.txt': 'The verification target is retained-target.txt. Read that file when verification is requested.',
			'retained-target.txt': 'CONTEXT_RETAINED_TARGET',
		};
	}

	async function seedRouting(session: IContextSession, turnId: string): Promise<void> {
		await read(session, turnId,
			'Read routing.txt. Retain its verification rule for a later request, but do not read the verification target yet.',
			/retained-target\.txt/);
	}

	function contextTest(title: string, run: () => Promise<void>): void {
		test(`runtime coverage context: ${title}`, async function () {
			this.timeout(300_000);
			await run();
		});
	}

	contextTest('manual compaction preserves native file-tool observations for the next task', async () => {
		const session = await createSession(routingFiles());
		await seedRouting(session, 'context-file-seed');
		const summaryRequest = await compact(session, 'context-file-compact');
		assert.ok(toolResultTexts(observedRequest(summaryRequest)).some(text => text.includes('retained-target.txt')));
		const requests = await read(session, 'context-file-verify', 'Perform the verification from the routing note you read earlier.', /CONTEXT_RETAINED_TARGET/);
		assert.ok(compactedText(requests[0]).includes('retained-target.txt'));
		await assertCompactionCount(session, 'context-file-verify', 1);
	});

	contextTest('embedded text attachment content survives summarization with its AHP attachment history', async () => {
		const session = await createSession({ 'embedded-target.txt': 'CONTEXT_EMBEDDED_TARGET' });
		const attachment: MessageAttachment = {
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'embedded-routing.txt',
			contentType: 'text/plain',
			data: Buffer.from('The verification target is embedded-target.txt.').toString('base64'),
		};
		await attachmentTurn(session, 'context-embedded-seed', attachment);
		const summaryRequest = await compact(session, 'context-embedded-compact');
		const summaryMessages = observedRequest(summaryRequest).messages;
		assert.ok(summaryMessages.some(message => contentText(message.content).includes('embedded-target.txt')),
			`Embedded snapshot content must reach the summarization request: ${JSON.stringify(summaryMessages)}`);
		const requests = await read(session, 'context-embedded-verify', 'Perform the verification specified by the attachment shared earlier.', /CONTEXT_EMBEDDED_TARGET/);
		assert.ok(compactedText(requests[0]).includes('embedded-target.txt'));
		const state = await chatState(session.chatUri);
		const retainedAttachments = state.turns.find(item => item.id === 'context-embedded-seed')?.message.attachments;
		assert.ok(retainedAttachments?.length === 1);
		const retainedAttachment = retainedAttachments[0];
		assert.ok(retainedAttachment.type === MessageAttachmentKind.Resource);
		assert.deepStrictEqual({
			label: retainedAttachment.label,
			snapshot: readHostSnapshotAttachmentMeta(retainedAttachment),
		}, { label: attachment.label, snapshot: { isSnapshot: true, contentType: 'text/plain' } });
		const retainedContent = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI, uri: retainedAttachment.uri, encoding: ContentEncoding.Base64,
		});
		assert.strictEqual(retainedContent.encoding, ContentEncoding.Base64);
		assert.strictEqual(retainedContent.data, attachment.data);
		await assertCompactionCount(session, 'context-embedded-verify', 1);
	});

	contextTest('resource snapshot reminders and contents reach compaction without editing the shared snapshot', async () => {
		const note = 'The verification target is snapshot-target.txt.';
		const session = await createSession({ 'shared-snapshot.txt': note, 'snapshot-target.txt': 'CONTEXT_SNAPSHOT_TARGET' });
		const attachment: MessageAttachment = {
			type: MessageAttachmentKind.Resource,
			label: 'shared-snapshot.txt',
			uri: URI.file(join(session.workspace, 'shared-snapshot.txt')).toString(),
			_meta: toHostSnapshotAttachmentMeta('text/plain'),
		};
		await attachmentTurn(session, 'context-snapshot-seed', attachment);
		const summaryRequest = await compact(session, 'context-snapshot-compact');
		const summaryInput = rawMessages(summaryRequest).map(message => contentText(message.content)).join('\n');
		assert.ok(summaryInput.includes('read-only snapshots of content the user shared'));
		assert.ok(summaryInput.includes('snapshot-target.txt'));
		const requests = await read(session, 'context-snapshot-verify', 'Perform the verification specified by the shared snapshot from earlier.', /CONTEXT_SNAPSHOT_TARGET/);
		assert.ok(compactedText(requests[0]).includes('snapshot-target.txt'));
		assert.strictEqual(readFileSync(join(session.workspace, 'shared-snapshot.txt'), 'utf8'), note);
		await assertCompactionCount(session, 'context-snapshot-verify', 1);
	});

	contextTest('repository instructions remain in the native system prompt after history replacement', async () => {
		const session = await createSession({
			...routingFiles(),
			[join('.github', 'copilot-instructions.md')]: 'CONTEXT_REPOSITORY_RULE: Verification requests must use view and must never use shell tools.',
		});
		await seedRouting(session, 'context-instructions-seed');
		assert.ok(systemText(context.observedModelRequestBodies[0]).includes('CONTEXT_REPOSITORY_RULE'));
		const summaryRequest = await compact(session, 'context-instructions-compact');
		assert.ok(systemText(summaryRequest).includes('CONTEXT_REPOSITORY_RULE'));
		const requests = await read(session, 'context-instructions-verify', 'Perform the verification according to the repository instructions and earlier routing note.', /CONTEXT_RETAINED_TARGET/);
		assert.ok(systemText(requests[0]).includes('CONTEXT_REPOSITORY_RULE'));
		compactedText(requests[0]);
		await assertCompactionCount(session, 'context-instructions-verify', 1);
	});

	contextTest('the latest invoked skill instructions and earlier skill references survive compaction', async () => {
		const session = await createSession({
			[join('.github', 'skills', 'context-first', 'SKILL.md')]: skill('context-first', 'CONTEXT_FIRST_SKILL_RULE: The first reference file is first-skill-target.txt. Do not read it until verification is requested.'),
			[join('.github', 'skills', 'context-latest', 'SKILL.md')]: skill('context-latest', 'CONTEXT_LATEST_SKILL_RULE: The latest verification target is latest-skill-target.txt. Do not read it until verification is requested.'),
			[join('.github', 'skills', 'context-first', 'first-skill-target.txt')]: 'CONTEXT_FIRST_SKILL_TARGET',
			[join('.github', 'skills', 'context-latest', 'latest-skill-target.txt')]: 'CONTEXT_LATEST_SKILL_TARGET',
		});
		await turn(session, 'context-skill-first', 'Invoke context-first with the skill tool exactly once. Do not read reference files yet. Reply exactly READY.');
		assertSkillInvocation(session, 'context-skill-first', 'context-first', 'CONTEXT_FIRST_SKILL_RULE');
		await turn(session, 'context-skill-latest', 'Invoke context-latest with the skill tool exactly once. Do not read reference files yet. Reply exactly READY.');
		assertSkillInvocation(session, 'context-skill-latest', 'context-latest', 'CONTEXT_LATEST_SKILL_RULE');
		await compact(session, 'context-skills-compact');
		const requests = await read(session, 'context-skills-verify', 'Perform the verification specified by the most recent skill without invoking any skill again.', /CONTEXT_LATEST_SKILL_TARGET/);
		const summary = compactedText(requests[0]);
		assert.ok(summary.includes('## Most recent skill: context-latest'));
		assert.ok(summary.includes('CONTEXT_LATEST_SKILL_RULE'));
		assert.ok(summary.includes('## Previously used skills'));
		assert.ok(summary.includes('context-first'));
		await assertCompactionCount(session, 'context-skills-verify', 1);
	});

	contextTest('native SQL dependency state remains queryable after its tool history is summarized', async () => {
		const session = await createSession(routingFiles());
		await turn(session, 'context-sql-seed',
			`Call sql exactly once with description "Create context tasks" and query "INSERT INTO todos (id, title, status) VALUES ('context-first', 'CONTEXT_COMPLETED_TASK', 'done'), ('context-next', 'CONTEXT_READY_TASK', 'pending'); INSERT INTO todo_deps (todo_id, depends_on) VALUES ('context-next', 'context-first'); SELECT title, status FROM todos ORDER BY id;". Do not call other tools. Reply exactly READY.`);
		assertNativeResult(session, 'context-sql-seed', 'sql', /CONTEXT_READY_TASK/);
		const summaryRequest = await compact(session, 'context-sql-compact');
		assert.ok(toolResultTexts(observedRequest(summaryRequest)).some(text => text.includes('CONTEXT_COMPLETED_TASK')));
		const requests = await turn(session, 'context-sql-verify',
			`Call sql exactly once with description "Read ready context tasks" and query "SELECT t.title FROM todos t WHERE t.status = 'pending' AND NOT EXISTS (SELECT 1 FROM todo_deps d JOIN todos p ON p.id = d.depends_on WHERE d.todo_id = t.id AND p.status != 'done');". Do not call other tools. Reply exactly VERIFIED.`);
		assertNativeResult(session, 'context-sql-verify', 'sql', /CONTEXT_READY_TASK/);
		assert.ok(compactedText(requests[0]).includes('CONTEXT_READY_TASK'));
		await assertCompactionCount(session, 'context-sql-verify', 1);
	});

	contextTest('successive compactions persist numbered checkpoints that native file tools can read', async () => {
		const session = await createSession({
			...routingFiles(), 'second-routing.txt': 'The alternate target is checkpoint-target.txt.', 'checkpoint-target.txt': 'CONTEXT_CHECKPOINT_TARGET',
		});
		await seedRouting(session, 'context-checkpoint-first-seed');
		await compact(session, 'context-checkpoint-first-compact');
		const summaryRequest = context.observedModelRequestBodies.at(-1);
		assert.ok(summaryRequest);
		const runtimeSessionId = /Session folder: [^\r\n]*[\\/](?<sessionId>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\r?\n/i.exec(systemText(summaryRequest))?.groups?.sessionId;
		assert.ok(runtimeSessionId, 'The native system context must advertise its own session-folder identifier');
		await read(session, 'context-checkpoint-second-seed', `For the session-folder identifier ${runtimeSessionId} shown in your system context, read second-routing.txt and retain its alternate routing fact.`, /checkpoint-target\.txt/);
		await compact(session, 'context-checkpoint-second-compact');
		const requests = await turn(session, 'context-checkpoint-read',
			'Use glob exactly once to list *.md in the checkpoints subdirectory of the session folder shown in your system context. Then use view exactly once to read the highest-numbered checkpoint, not index.md. Do not use shell tools or read repository files. Reply exactly VERIFIED.');
		assertNativeResult(session, 'context-checkpoint-read', 'view', /checkpoint-target\.txt/);
		const system = systemText(requests[0]);
		assert.ok(system.includes('- checkpoints/: 2 prior checkpoints'));
		compactedText(requests[0]);
		assertToolCallCompleteText(context.client, { channel: session.chatUri, turnId: 'context-checkpoint-read', toolNames: ['glob'], expected: [/\.md/] });
		await assertCompactionCount(session, 'context-checkpoint-read', 2);
	});

	contextTest('cold resubscription restores compacted history without replaying old native tool calls', async () => {
		const session = await createSession(routingFiles());
		await seedRouting(session, 'context-resubscribe-seed');
		await compact(session, 'context-resubscribe-compact');
		const before = await chatState(session.chatUri);
		const beforeIds = responsePartIds(before);
		assert.ok(beforeIds.length > 0);
		context.client.notify('unsubscribe', { channel: session.chatUri });
		context.client.notify('unsubscribe', { channel: session.sessionUri });
		await retry(async () => {
			try {
				await context.client.call<SubscribeResult>('subscribe', { channel: session.sessionUri });
				const restored = await chatState(session.chatUri);
				const ids = responsePartIds(restored);
				assert.deepStrictEqual(durableTurns(restored).map(item => ({ message: item.message.text, state: item.state })), durableTurns(before).map(item => ({ message: item.message.text, state: item.state })));
				assert.strictEqual(ids.length, beforeIds.length);
				assert.ok(ids.some((id, index) => id !== beforeIds[index]), 'Expected a cold provider-history reconstruction, not the resident chat');
			} catch (error) {
				context.client.notify('unsubscribe', { channel: session.chatUri });
				context.client.notify('unsubscribe', { channel: session.sessionUri });
				throw error;
			}
		}, 50, 20);
		const requests = await read(session, 'context-resubscribe-verify', 'Perform the verification from the earlier routing note.', /CONTEXT_RETAINED_TARGET/);
		assert.ok(compactedText(requests[0]).includes('retained-target.txt'));
		await assertCompactionCount(session, 'context-resubscribe-verify', 1);
	});

	contextTest('host restart rehydrates compacted native context and checkpoint metadata', async () => {
		const session = await createSession(routingFiles());
		await seedRouting(session, 'context-restart-seed');
		await compact(session, 'context-restart-compact');
		const before = await chatState(session.chatUri);
		await context.restartServer();
		context.client.setWorkingDirectory(session.workspace);
		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'runtime-context-reconnected' }, 30_000);
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI, resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: context.config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
		await context.client.call<SubscribeResult>('subscribe', { channel: session.sessionUri });
		const restored = await chatState(session.chatUri);
		assert.deepStrictEqual(durableTurns(restored).map(item => ({ message: item.message.text, state: item.state })), durableTurns(before).map(item => ({ message: item.message.text, state: item.state })));
		const requests = await read(session, 'context-restart-verify', 'Perform the verification from the earlier routing note.', /CONTEXT_RETAINED_TARGET/);
		assert.ok(compactedText(requests[0]).includes('retained-target.txt'));
		assert.ok(systemText(requests[0]).includes('- checkpoints/: 1 prior checkpoints'));
		await assertCompactionCount(session, 'context-restart-verify', 1);
	});

	contextTest('a fork inherits compacted context while subsequent peer routing stays isolated', async () => {
		const session = await createSession({
			...routingFiles(), 'peer-target.txt': 'CONTEXT_PEER_TARGET',
		});
		await seedRouting(session, 'context-fork-seed');
		await compact(session, 'context-fork-compact');
		await read(session, 'context-fork-boundary', 'Perform the verification from the earlier routing note.', /CONTEXT_RETAINED_TARGET/);
		const peerUri = buildChatUri(session.sessionUri, 'context-fork-peer');
		await context.client.call('createChat', {
			channel: session.sessionUri,
			chat: peerUri,
			source: { kind: ChatSourceKind.Fork, chat: session.chatUri, turnId: 'context-fork-boundary' },
		}, 30_000);
		await context.client.call<SubscribeResult>('subscribe', { channel: peerUri });
		const peer: IContextSession = { ...session, chatUri: peerUri, clientSeq: 1 };
		const peerRequests = await read(peer, 'context-fork-peer-read', 'For this peer only, change the verification target to peer-target.txt and verify it now.', /CONTEXT_PEER_TARGET/);
		assert.ok(compactedText(peerRequests[0], true).includes('retained-target.txt'));
		const sourceRequests = await read(session, 'context-fork-source-read', 'Perform the verification using the original routing note again.', /CONTEXT_RETAINED_TARGET/);
		assert.ok(!observedRequest(sourceRequests[0]).messages.some(message => contentText(message.content).includes('For this peer only')));
		await assertCompactionCount(session, 'context-fork-source-read', 1);
	});

	contextTest('truncating before compaction restores earlier tool context and removes discarded routing', async () => {
		const session = await createSession({
			...routingFiles(), 'discarded-routing.txt': 'CONTEXT_DISCARDED_RULE: the new verification target is discarded-target.txt.', 'discarded-target.txt': 'CONTEXT_DISCARDED_TARGET',
		});
		await seedRouting(session, 'context-rollback-keep');
		await read(session, 'context-rollback-discard', 'Read discarded-routing.txt and replace the earlier verification rule with this new rule.', /CONTEXT_DISCARDED_RULE/);
		await compact(session, 'context-rollback-compact');
		context.client.dispatch({
			channel: session.chatUri, clientSeq: session.clientSeq,
			action: { type: ActionType.ChatTruncated, turnId: 'context-rollback-keep' },
		});
		session.clientSeq += 100;
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.ChatTruncated) && getActionEnvelope(notification).channel === session.chatUri, 30_000);
		const requests = await read(session, 'context-rollback-verify', 'Perform the verification from the retained routing note.', /CONTEXT_RETAINED_TARGET/);
		const messages = observedRequest(requests[0]).messages.map(message => contentText(message.content)).join('\n');
		assert.ok(messages.includes('retained-target.txt'));
		assert.ok(!messages.includes('CONTEXT_DISCARDED_RULE'));
		assert.ok(!messages.includes('discarded-target.txt'));
		assert.deepStrictEqual((await chatState(session.chatUri)).turns.map(item => item.id), ['context-rollback-keep', 'context-rollback-verify']);
		await assertCompactionCount(session, 'context-rollback-verify', 0);
	});
}
