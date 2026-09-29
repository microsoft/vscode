/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource, type CancellationToken } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { appendEscapedMarkdownCodeBlockFence } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { compare } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentSession } from '../../../common/agent.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAppliedClientAction, type IHydrationContext, type IOutgoingTurn, type ISendContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ChatOriginKind, isAhpChatChannel, type Turn, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { resolveAgentHostFileCompletionRoots } from '../../agentHostFileCompletionUtils.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostWorkspaceFiles, type IAgentHostWorkspaceFilesResult } from '../../agentHostWorkspaceFiles.js';
import { IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

const firstTurnSeenMemento = createChatMementoKey<boolean>('firstTurnSeen', () => false);
const MAX_STRUCTURE_LENGTH = 2000;
/**
 * Longest the first send waits for a root's rendered tree before sending
 * without it. Preparation normally starts when the turn is accepted, or when a
 * first-send worktree is created, so it overlaps working-directory, model, and
 * attachment resolution; this only bounds what a slow or very large checkout
 * can add to time to first token.
 */
const SNAPSHOT_TIMEOUT_MS = 1000;

/** A chat's in-progress snapshot. Disposing it stops any enumeration still running. */
interface IPreparedSnapshot extends IDisposable {
	/** Identifies the roots it was prepared for, to detect a change before send. */
	readonly key: string;
	/** One rendered tree per root, or `undefined` for a root that produced none. Never rejects. */
	readonly roots: readonly Promise<string | undefined>[];
}

/**
 * Supplies a file-name snapshot on the first turn of a new conversation
 * without changing the user's task text.
 */
export class WorkspaceContextContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'workspaceContext';
	readonly order = 200;
	private readonly _workspaceFiles: AgentHostWorkspaceFiles;
	private readonly _prepared = this._register(new DisposableMap<ProtocolURI, IPreparedSnapshot>());
	/** First-turn chats whose session is creating its worktree, keyed by session id. */
	private readonly _awaitingWorktree = new Map<string, ProtocolURI>();

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._workspaceFiles = this._register(new AgentHostWorkspaceFiles(_logService));
		this._register(_worktreeIsolation.onDidChangeWorkingDirectoryPending(sessionId => this._onWorktreeResolved(sessionId)));
	}

	/**
	 * Starts preparing as soon as a first turn is accepted, so the snapshot is
	 * usually ready by the time {@link onOutgoingTurn} needs it. A session still
	 * creating its worktree waits for {@link _onWorktreeResolved} instead: the
	 * worktree does not exist yet, and scanning the source checkout would
	 * compete with its creation.
	 */
	onDidApplyClientAction({ channel, session, action }: IAppliedClientAction): void {
		if (action.type !== ActionType.ChatTurnStarted || !isAhpChatChannel(channel)) {
			return;
		}
		const workingDirectories = this._firstTurnWorkingDirectories(channel);
		if (!workingDirectories) {
			return;
		}
		const sessionId = AgentSession.id(session);
		if (this._worktreeIsolation.isWorkingDirectoryPending(sessionId)) {
			this._awaitingWorktree.set(sessionId, channel);
			return;
		}
		this._prepare(channel, workingDirectories);
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		this._forgetAwaitingWorktree(turn.chat);
		if (!this._firstTurnWorkingDirectories(turn.chat)) {
			this._prepared.deleteAndDispose(turn.chat);
			return undefined;
		}
		this._context.memento(firstTurnSeenMemento, turn.chat).set(true, undefined);
		try {
			// Use the directories the provider will run in, not session state: a worktree created on this send is not in state until the provider materializes.
			const prepared = this._prepare(turn.chat, turn.workingDirectories ?? []);
			const structures = await Promise.all(prepared.roots.map(root => raceTimeout(root, SNAPSHOT_TIMEOUT_MS, () => this._logService.trace(`[WorkspaceContext] Sent a first turn before a root's file list was ready within ${SNAPSHOT_TIMEOUT_MS}ms`))));
			const structure = structures.filter(Boolean).join('\n\n');
			if (!structure) {
				return undefined;
			}
			return {
				instructions: [`<workspace_info>\nInitial workspace structure (file names only):\n${appendEscapedMarkdownCodeBlockFence(structure, 'text')}\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`],
			};
		} finally {
			// Stop any enumeration the send did not wait for.
			this._prepared.deleteAndDispose(turn.chat);
		}
	}

	/** Releases preparation for a first turn that ended before it was sent (rejected, cancelled, or failed). */
	onTurnEnd(turn: ITurnEnd): void {
		this._forgetAwaitingWorktree(turn.channel);
		this._prepared.deleteAndDispose(turn.channel);
	}

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		if (turns.length > 0) {
			this._context.memento(firstTurnSeenMemento, context.chat).set(true, undefined);
		}
		return turns;
	}

	/** Starts preparing a first turn's snapshot in the worktree its session just created. */
	private _onWorktreeResolved(sessionId: string): void {
		const chat = this._awaitingWorktree.get(sessionId);
		if (!chat || this._worktreeIsolation.isWorkingDirectoryPending(sessionId)) {
			return;
		}
		this._awaitingWorktree.delete(sessionId);
		const workingDirectories = this._firstTurnWorkingDirectories(chat);
		if (!workingDirectories) {
			return;
		}
		// Mirrors the send path: a created worktree replaces only the process root.
		const worktree = this._worktreeIsolation.getResolvedWorktree(sessionId);
		this._prepare(chat, worktree ? [worktree, ...workingDirectories.slice(1)] : workingDirectories);
	}

	private _forgetAwaitingWorktree(chat: ProtocolURI): void {
		for (const [sessionId, awaiting] of this._awaitingWorktree) {
			if (awaiting === chat) {
				this._awaitingWorktree.delete(sessionId);
			}
		}
	}

	/**
	 * Returns the chat's snapshot for `workingDirectories`, starting it unless a
	 * snapshot for the same roots is already in progress. Starting a different
	 * set stops the previous one.
	 */
	private _prepare(chat: ProtocolURI, workingDirectories: readonly URI[]): IPreparedSnapshot {
		const { enumerationRoots } = resolveAgentHostFileCompletionRoots(workingDirectories);
		const key = enumerationRoots.map(root => root.toString()).join('\n');
		const existing = this._prepared.get(chat);
		if (existing?.key === key) {
			return existing;
		}
		const cancellation = new CancellationTokenSource();
		const budget = enumerationRoots.length ? Math.floor(MAX_STRUCTURE_LENGTH / enumerationRoots.length) : 0;
		const prepared: IPreparedSnapshot = {
			key,
			roots: enumerationRoots.map(root => this._prepareRoot(root, budget, cancellation.token)),
			dispose: () => cancellation.dispose(true),
		};
		this._prepared.set(chat, prepared);
		return prepared;
	}

	/** Renders one root's tree. Failures are isolated to the root, so other roots still contribute. */
	private async _prepareRoot(root: URI, budget: number, token: CancellationToken): Promise<string | undefined> {
		try {
			const result = await this._workspaceFiles.enumerate(root, token);
			if (token.isCancellationRequested) {
				return undefined;
			}
			const heading = JSON.stringify(root.fsPath).slice(1, -1);
			const tree = renderWorkspaceTree(root, result, budget - heading.length - 3);
			return tree ? `${heading}\n${tree}` : undefined;
		} catch (err) {
			if (!isCancellationError(err)) {
				this._logService.warn(`[WorkspaceContext] Could not list ${root.fsPath} for the initial workspace snapshot: ${toErrorMessage(err)}`);
			}
			return undefined;
		}
	}

	/**
	 * The chat's working directories when its next turn starts a new Copilot
	 * conversation, otherwise `undefined`. Forks and side chats inherit history
	 * that already carries the source chat's context, and tool-spawned chats
	 * receive a focused task from the chat that delegated it.
	 */
	private _firstTurnWorkingDirectories(chat: ProtocolURI): URI[] | undefined {
		const state = this._stateManager.getSessionState(chat);
		if (state?.provider !== 'copilotcli' || state.turns.length > 0 || this._context.memento(firstTurnSeenMemento, chat).get()) {
			return undefined;
		}
		const origin = this._stateManager.getChatOrigin(chat);
		if ((origin && origin.kind !== ChatOriginKind.User) || this._stateManager.getChatInheritedTurnId(chat) !== undefined) {
			return undefined;
		}
		return (state.workingDirectories ?? []).map(directory => URI.parse(directory));
	}
}

/** A file (no children) or directory in the rendered tree. */
interface IWorkspaceNode {
	readonly name: string;
	readonly children: Map<string, IWorkspaceNode>;
}

function sortedChildren(node: IWorkspaceNode): IWorkspaceNode[] {
	return [...node.children.values()].sort((a, b) => Number(a.children.size > 0) - Number(b.children.size > 0) || compare(a.name, b.name));
}

/**
 * Builds the tree from plain path segments rather than URIs: the file list can
 * hold tens of thousands of entries, and this runs synchronously on the host.
 */
function buildWorkspaceTree(root: URI, files: readonly URI[]): IWorkspaceNode {
	const tree: IWorkspaceNode = { name: '', children: new Map() };
	const prefix = root.path.endsWith('/') ? root.path : `${root.path}/`;
	for (const file of files) {
		if (!file.path.startsWith(prefix)) {
			continue;
		}
		const segments = file.path.slice(prefix.length).split(/[\\/]/);
		if (segments.some(segment => !segment || segment.startsWith('.') || segment === 'node_modules')) {
			continue;
		}
		let node = tree;
		for (const segment of segments) {
			let child = node.children.get(segment);
			if (!child) {
				child = { name: segment, children: new Map() };
				node.children.set(segment, child);
			}
			node = child;
		}
	}
	return tree;
}

function renderWorkspaceTree(root: URI, result: IAgentHostWorkspaceFilesResult, maxLength: number): string {
	if (maxLength < 4) {
		return '';
	}
	const tree = buildWorkspaceTree(root, result.files);

	const selected = new Map<IWorkspaceNode, string>();
	const queue = sortedChildren(tree).map(node => ({ node, depth: 0 }));
	let length = 0;
	let truncated = result.isTruncated;
	for (let index = 0; index < queue.length; index++) {
		const { node, depth } = queue[index];
		const name = JSON.stringify(node.name).slice(1, -1);
		const line = `${'\t'.repeat(depth)}${name}${node.children.size ? '/' : ''}`;
		if (length + line.length + 1 > maxLength - 4) {
			truncated = true;
			break;
		}
		selected.set(node, line);
		length += line.length + 1;
		queue.push(...sortedChildren(node).map(child => ({ node: child, depth: depth + 1 })));
	}
	if (selected.size === 0) {
		return '';
	}
	const lines: string[] = [];
	const render = (node: IWorkspaceNode): void => {
		const line = selected.get(node);
		if (line !== undefined) {
			lines.push(line);
			for (const child of sortedChildren(node)) {
				render(child);
			}
		}
	};
	for (const node of sortedChildren(tree)) {
		render(node);
	}
	if (truncated) {
		lines.push('...');
	}
	return lines.join('\n');
}
