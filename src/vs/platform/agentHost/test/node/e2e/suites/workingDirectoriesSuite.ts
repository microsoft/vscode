/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { editorWindowAgentHostClientInfo } from '../../../../common/agentHostClientInfo.js';
import { AgentHostClaudeMultiRootEnabledConfigKey, AgentHostCodexMultiRootEnabledConfigKey, AgentHostCopilotMultiRootEnabledConfigKey } from '../../../../common/agentHostSchema.js';
import { ChatSourceKind, CompletionItemKind, type CompletionsResult, type ListSessionsResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, type StateAction } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageAttachmentKind, ROOT_STATE_URI, withSessionMultiRootMetadata, type ChatState, type RootState, type SessionState } from '../../../../common/state/sessionState.js';
import { driveChatTurnToCompletion, initTestGitRepo, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

interface IWorkspaceSession {
	readonly session: string;
	readonly chat: string;
	readonly workspace: string;
	readonly primary: URI;
	readonly secondary: URI;
	readonly replacement: URI;
}

export function defineWorkingDirectoriesTests(context: IAgentHostE2ETestContext): void {
	const { config } = context;
	const multiRootKey = config.provider === 'claude'
		? AgentHostClaudeMultiRootEnabledConfigKey
		: config.provider === 'codex' ? AgentHostCodexMultiRootEnabledConfigKey : AgentHostCopilotMultiRootEnabledConfigKey;
	let clientSequence = 30_000;

	async function initialize(prefix: string): Promise<void> {
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `${prefix}-${config.provider}`,
			clientInfo: editorWindowAgentHostClientInfo,
		});
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: config.githubToken ?? resolveGitHubToken(),
		});
	}

	async function dispatch(channel: string, action: StateAction): Promise<void> {
		const clientSeq = clientSequence++;
		context.client.dispatch({ channel, clientSeq, action });
		const notification = await context.client.waitForNotification(candidate =>
			isActionNotification(candidate, action.type)
			&& getActionEnvelope(candidate).channel === channel
			&& getActionEnvelope(candidate).origin?.clientSeq === clientSeq,
		);
		assert.strictEqual(getActionEnvelope(notification).rejectionReason, undefined);
	}

	async function setMultiRoot(enabled: boolean): Promise<boolean> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const wasEnabled = (result.snapshot!.state as RootState).config?.values[multiRootKey] === true;
		if (wasEnabled !== enabled) {
			await dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [multiRootKey]: enabled } });
		}
		return wasEnabled;
	}

	async function withSession(prefix: string, run: (session: IWorkspaceSession) => Promise<void>, includeSecondary = true): Promise<void> {
		const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'ahp-working-directories-')));
		context.tempDirs.push(workspace);
		const primary = URI.file(join(workspace, 'primary'));
		const secondary = URI.file(join(workspace, 'secondary'));
		const replacement = URI.file(join(workspace, 'replacement'));
		for (const directory of [primary, secondary, replacement]) {
			mkdirSync(directory.fsPath);
			writeFileSync(join(directory.fsPath, 'marker.txt'), `${directory.path.split('/').at(-1)}\n`);
		}
		const workspaceFile = URI.file(join(workspace, 'test.code-workspace'));
		writeFileSync(workspaceFile.fsPath, JSON.stringify({ folders: [{ path: 'primary' }, { path: 'secondary' }] }));
		context.client.setWorkingDirectory(workspace);
		await initialize(prefix);
		const wasMultiRootEnabled = await setMultiRoot(true);
		try {
			const session = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
			await context.client.call('createSession', {
				channel: session,
				provider: config.provider,
				workingDirectories: (includeSecondary ? [primary, secondary] : [primary]).map(directory => directory.toString()),
				config: { isolation: 'folder', ...config.sessionConfig },
				_meta: withSessionMultiRootMetadata(undefined, { workspaceFile: workspaceFile.toString() }),
			});
			context.createdSessions.push(session);
			await sessionState(session);
			const chat = buildDefaultChatUri(session);
			await chatState(chat);
			await run({ session, chat, workspace, primary, secondary, replacement });
		} finally {
			await setMultiRoot(wasMultiRootEnabled);
		}
	}

	async function sessionState(session: string): Promise<SessionState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: session });
		return result.snapshot!.state as SessionState;
	}

	async function chatState(chat: string): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: chat });
		return result.snapshot!.state as ChatState;
	}

	async function createPeer(session: string, id: string, workingDirectories?: readonly URI[]): Promise<string> {
		const chat = buildChatUri(session, id);
		await context.client.call('createChat', {
			channel: session,
			chat,
			workingDirectories: workingDirectories?.map(directory => directory.toString()),
		});
		await chatState(chat);
		return chat;
	}

	async function fileCompletions(chat: string): Promise<string[]> {
		const result = await context.client.call<CompletionsResult>('completions', {
			channel: chat, kind: CompletionItemKind.UserMessage, text: '@marker', offset: '@marker'.length,
		});
		return result.items.flatMap(item => item.attachment.type === MessageAttachmentKind.Resource ? [item.attachment.uri] : []).sort();
	}

	function markerFiles(...directories: URI[]): string[] {
		return directories.map(directory => URI.file(join(directory.fsPath, 'marker.txt')).toString()).sort();
	}

	async function turn(chat: string, id: string, prompt: string): Promise<string> {
		const clientSeq = clientSequence;
		clientSequence += 100;
		return (await driveChatTurnToCompletion(context.client, chat, id, prompt, clientSeq)).responseText;
	}

	async function writeInChat(chat: string, id: string, file: string): Promise<void> {
		const prompt = `Run exactly this shell command, with no modifications: \`node -e "require('fs').writeFileSync('${file}', require('fs').readFileSync('marker.txt'))"\`. Use the shell's existing working directory: omit workdir, cwd, and all directory overrides from the tool arguments; do not prefix the command with cd or replace relative paths. Then reply exactly "done".`;
		await turn(chat, id, prompt);
	}

	async function restart(session: IWorkspaceSession): Promise<void> {
		await context.restartServer();
		context.client.setWorkingDirectory(session.workspace);
		await initialize('working-directories-restored');
		await sessionState(session.session);
		await chatState(session.chat);
	}

	async function createDelegatedPeer(session: IWorkspaceSession, directory: URI, isolated: boolean, id: string): Promise<string> {
		const before = new Set((await sessionState(session.session)).chats.map(chat => chat.resource));
		const response = await turn(session.chat, id,
			`Call create_session exactly once with relationship "currentSession", workspace "${directory.fsPath}", worktree ${isolated}, prompt "/rename Directory Peer", and title "Directory Peer". Then reply exactly "created".`,
		);
		assert.match(response.trim(), /(?:^|\n)created$/, 'the invoking provider must finish its response after creating the peer');
		const peer = (await sessionState(session.session)).chats.find(chat => !before.has(chat.resource));
		assert.ok(peer, 'create_session must publish a new peer in the existing session');
		let state = await chatState(peer.resource);
		if (state.activeTurn) {
			const turnId = state.activeTurn.id;
			await context.client.waitForNotification(notification =>
				isActionNotification(notification, ActionType.ChatTurnComplete)
				&& getActionEnvelope(notification).channel === peer.resource
				&& (getActionEnvelope(notification).action as { turnId: string }).turnId === turnId,
			);
			state = await chatState(peer.resource);
		}
		assert.deepStrictEqual({
			activeTurn: state.activeTurn,
			messages: state.turns.map(turn => turn.message.text),
		}, { activeTurn: undefined, messages: ['/rename Directory Peer'] });
		return peer.resource;
	}

	function makeRepository(directory: URI): void {
		initTestGitRepo(directory.fsPath);
		execFileSync('git', ['add', '.'], { cwd: directory.fsPath });
		execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: directory.fsPath });
	}

	function parityTest(title: string, run: Mocha.AsyncFunc, enabled = true): void {
		if (context.tier === 'parity') {
			(enabled ? test : test.skip)(title, function () {
				this.timeout(180_000);
				return run.call(this);
			});
		}
	}

	conformanceTest(context, 'workspace lifecycle: peer file completions use only its selected folder', async function () {
		await withSession('peer-completions', async session => {
			const peer = await createPeer(session.session, 'secondary', [session.secondary]);
			const state = await sessionState(session.session);
			assert.deepStrictEqual({
				defaultFiles: await fileCompletions(session.chat),
				peerFiles: await fileCompletions(peer),
				peerDirectories: state.chats.find(chat => chat.resource === peer)?.workingDirectories,
			}, {
				defaultFiles: markerFiles(session.primary, session.secondary),
				peerFiles: markerFiles(session.secondary),
				peerDirectories: [session.secondary.toString()],
			});
		});
	});

	conformanceTest(context, 'workspace lifecycle: rejecting an outside peer folder leaves the chat catalog unchanged', async function () {
		await withSession('outside-folder', async session => {
			const before = (await sessionState(session.session)).chats.map(chat => chat.resource);
			await assert.rejects(createPeer(session.session, 'outside', [session.replacement]), /working director/i);
			assert.deepStrictEqual((await sessionState(session.session)).chats.map(chat => chat.resource), before);
			const valid = await createPeer(session.session, 'inside', [session.secondary]);
			assert.deepStrictEqual(await fileCompletions(valid), markerFiles(session.secondary));
		});
	});

	parityTest('workspace lifecycle: peer tools execute in their selected folder', async function () {
		await withSession('peer-tools', async session => {
			const peer = await createPeer(session.session, 'secondary', [session.secondary]);
			await writeInChat(peer, 'peer-write', 'copied.txt');
			assert.deepStrictEqual({
				contents: readFileSync(join(session.secondary.fsPath, 'copied.txt'), 'utf8').trim(),
				wroteToPrimary: existsSync(join(session.primary.fsPath, 'copied.txt')),
			}, { contents: 'secondary', wroteToPrimary: false });
		});
	});

	// Copilot resumes the peer's tools in the session's primary folder.
	parityTest('workspace lifecycle: peer folder selection survives a host restart', async function () {
		await withSession('peer-restore', async session => {
			await turn(session.chat, 'default-before-restart', 'Reply exactly "ready".');
			const peer = await createPeer(session.session, 'secondary', [session.secondary]);
			await turn(peer, 'peer-before-restart', 'Remember DIRECTORY_MEMORY. Reply exactly "ready".');
			await restart(session);
			const restored = await chatState(peer);
			await writeInChat(peer, 'peer-after-restart', 'restored.txt');
			assert.deepStrictEqual({
				directories: restored.workingDirectories,
				messages: restored.turns.map(turn => turn.message.text),
				contents: readFileSync(join(session.secondary.fsPath, 'restored.txt'), 'utf8').trim(),
				wroteToPrimary: existsSync(join(session.primary.fsPath, 'restored.txt')),
			}, {
				directories: [session.secondary.toString()],
				messages: ['Remember DIRECTORY_MEMORY. Reply exactly "ready".'],
				contents: 'secondary',
				wroteToPrimary: false,
			});
		});
	}, config.provider !== 'copilotcli' || context.runKnownIssueTests);

	// An unmaterialized default chat prevents reopening the peer-only session.
	parityTest('workspace lifecycle: a session used only through a peer can reopen after restart', async function () {
		await withSession('peer-only-restore', async session => {
			const peer = await createPeer(session.session, 'secondary', [session.secondary]);
			await turn(peer, 'peer-only-before-restart', 'Reply exactly "ready".');
			await restart(session);
			assert.deepStrictEqual((await chatState(peer)).turns.map(turn => turn.message.text), ['Reply exactly "ready".']);
		});
	}, context.runKnownIssueTests);

	parityTest('workspace lifecycle: expanding a live session preserves the original chat completion scope', async function () {
		await withSession('live-expansion', async session => {
			await turn(session.chat, 'before-live-expansion', 'Reply exactly "ready".');
			await dispatch(session.session, { type: ActionType.SessionWorkingDirectorySet, directory: session.secondary.toString() });
			const peer = await createPeer(session.session, 'expanded');
			assert.deepStrictEqual({
				defaultFiles: await fileCompletions(session.chat),
				peerFiles: await fileCompletions(peer),
				directories: (await sessionState(session.session)).workingDirectories,
			}, {
				defaultFiles: markerFiles(session.primary),
				peerFiles: markerFiles(session.primary, session.secondary),
				directories: [session.primary.toString(), session.secondary.toString()],
			});
		}, false);
	});

	// Claude's existing current-session creation limitation also applies to workspace delegation.
	if (config.provider !== 'claude') {
		parityTest('workspace delegation: a new folder is scoped to the delegated peer', async function () {
			await withSession('delegated-folder', async session => {
				const peer = await createDelegatedPeer(session, session.replacement, false, 'delegate-folder');
				assert.deepStrictEqual({
					directories: (await sessionState(session.session)).workingDirectories,
					defaultFiles: await fileCompletions(session.chat),
					peerFiles: await fileCompletions(peer),
				}, {
					directories: [session.primary.toString(), session.secondary.toString(), session.replacement.toString()],
					defaultFiles: markerFiles(session.primary, session.secondary),
					peerFiles: markerFiles(session.replacement),
				});
			});
		});

		parityTest('workspace delegation: selecting an existing folder does not duplicate the session workspace', async function () {
			await withSession('delegated-existing', async session => {
				const peer = await createDelegatedPeer(session, session.secondary, false, 'delegate-existing');
				assert.deepStrictEqual({
					directories: (await sessionState(session.session)).workingDirectories,
					peerFiles: await fileCompletions(peer),
				}, {
					directories: [session.primary.toString(), session.secondary.toString()],
					peerFiles: markerFiles(session.secondary),
				});
			});
		});

		parityTest('workspace delegation: an isolated peer gets a real worktree that is removed with its session', async function () {
			await withSession('delegated-worktree', async session => {
				makeRepository(session.replacement);
				const peer = await createDelegatedPeer(session, session.replacement, true, 'delegate-worktree');
				const state = await chatState(peer);
				assert.ok(state.workingDirectories?.[0]);
				const worktree = URI.parse(state.workingDirectories[0]).fsPath;
				assert.notStrictEqual(realpathSync(worktree), realpathSync(session.replacement.fsPath));
				assert.strictEqual(readFileSync(join(worktree, 'marker.txt'), 'utf8').trim(), 'replacement');
				assert.strictEqual(execFileSync('git', ['status', '--porcelain'], { cwd: session.replacement.fsPath, encoding: 'utf8' }).trim(), '');
				await context.client.call('disposeSession', { channel: session.session }, 60_000);
				context.createdSessions.splice(context.createdSessions.indexOf(session.session), 1);
				assert.strictEqual(existsSync(worktree), false, 'disposing the owner must remove its additional worktree');
			});
		});

		parityTest('workspace delegation: explicit isolation creates independent worktrees for sibling peers', async function () {
			await withSession('delegated-reuse', async session => {
				makeRepository(session.replacement);
				const first = await createDelegatedPeer(session, session.replacement, true, 'delegate-first');
				const second = await createDelegatedPeer(session, session.replacement, true, 'delegate-second');
				const firstState = await chatState(first);
				const secondState = await chatState(second);
				assert.ok(firstState.workingDirectories?.[0]);
				assert.ok(secondState.workingDirectories?.[0]);
				assert.notStrictEqual(firstState.workingDirectories[0], secondState.workingDirectories[0]);
				assert.strictEqual((await sessionState(session.session)).workingDirectories?.length, 4);
				for (const directory of [firstState.workingDirectories[0], secondState.workingDirectories[0]]) {
					assert.strictEqual(readFileSync(join(URI.parse(directory).fsPath, 'marker.txt'), 'utf8').trim(), 'replacement');
				}
			});
		});
	}

	// Accepted directory mutations currently restore the original set.
	parityTest('workspace lifecycle: adding a folder pins the existing chat across restart', async function () {
		await withSession('session-expansion', async session => {
			await turn(session.chat, 'before-expansion', 'Reply exactly "ready".');
			await dispatch(session.session, { type: ActionType.SessionWorkingDirectorySet, directory: session.secondary.toString() });
			await restart(session);
			const peer = await createPeer(session.session, 'expanded');
			const catalog = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
			assert.deepStrictEqual({
				defaultFiles: await fileCompletions(session.chat),
				newPeerFiles: await fileCompletions(peer),
				defaultDirectories: (await chatState(session.chat)).workingDirectories,
				catalogDirectories: catalog.items.find(item => item.resource === session.session)?.workingDirectories,
			}, {
				defaultFiles: markerFiles(session.primary),
				newPeerFiles: markerFiles(session.primary, session.secondary),
				defaultDirectories: [session.primary.toString()],
				catalogDirectories: [session.primary.toString(), session.secondary.toString()],
			});
		}, false);
	}, context.runKnownIssueTests);

	// Accepted directory mutations currently restore the original set.
	parityTest('workspace lifecycle: removing a secondary folder remains authoritative after restart', async function () {
		await withSession('session-removal', async session => {
			await turn(session.chat, 'before-removal', 'Reply exactly "ready".');
			await dispatch(session.session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: session.secondary.toString() });
			await restart(session);
			assert.deepStrictEqual({
				directories: (await sessionState(session.session)).workingDirectories,
				files: await fileCompletions(session.chat),
			}, {
				directories: [session.primary.toString()],
				files: markerFiles(session.primary),
			});
		});
	}, context.runKnownIssueTests);

	if (config.supportsChatForkE2E) {
		// Forks currently omit the source subset from their host-owned state.
		parityTest('workspace lifecycle: a fork retains the source chat folder instead of the requested override', async function () {
			await withSession('fork-folder', async session => {
				const peer = await createPeer(session.session, 'source', [session.secondary]);
				await turn(peer, 'source-turn', 'Reply exactly "ready".');
				const fork = buildChatUri(session.session, 'fork');
				await context.client.call('createChat', {
					channel: session.session,
					chat: fork,
					source: { kind: ChatSourceKind.Fork, chat: peer, turnId: 'source-turn' },
					workingDirectories: [session.primary.toString()],
				});
				const state = await chatState(fork);
				await writeInChat(fork, 'fork-write', 'forked.txt');
				assert.deepStrictEqual({
					directories: state.workingDirectories,
					contents: existsSync(join(session.secondary.fsPath, 'forked.txt')) ? readFileSync(join(session.secondary.fsPath, 'forked.txt'), 'utf8').trim() : undefined,
					wroteToPrimary: existsSync(join(session.primary.fsPath, 'forked.txt')),
				}, { directories: [session.secondary.toString()], contents: 'secondary', wroteToPrimary: false });
			});
		}, context.runKnownIssueTests);
	}
}
