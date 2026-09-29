/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, type CancellationToken } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { appendEscapedMarkdownCodeBlockFence } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { compare } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentSession } from '../../../common/agent.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAppliedClientAction, type IDispatchedAction, type IHydrationContext, type IOutgoingTurn, type ISendContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ChatOriginKind, isAhpChatChannel, isDefaultChatUri, parseRequiredSessionUriFromChatUri, type Turn, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { resolveAgentHostFileCompletionRoots } from '../../agentHostFileCompletionUtils.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostWorkspaceFiles } from '../../agentHostWorkspaceFiles.js';
import { IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

const firstTurnSeenMemento = createChatMementoKey<boolean>('firstTurnSeen', () => false);
const MAX_STRUCTURE_LENGTH = 2000;

/** One root's rendered tree, filled in when its preparation finishes. */
interface IPreparedRoot {
	settled: boolean;
	/** The rendered tree, or `undefined` for a root that produced none. */
	tree: string | undefined;
}

/** A chat's snapshot preparation. Disposing it stops any enumeration still running. */
interface IPreparedSnapshot extends IDisposable {
	/** Identifies the roots it was prepared for, to detect a change before send. */
	readonly key: string;
	readonly roots: readonly IPreparedRoot[];
}

/** Mirrors the send path, where a created worktree replaces only the process root. */
function withProcessRoot(worktree: URI, workingDirectories: readonly URI[]): URI[] {
	return [worktree, ...workingDirectories.slice(1)];
}

function snapshotKey(enumerationRoots: readonly URI[]): string {
	return enumerationRoots.map(root => root.toString()).join('\n');
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
	private readonly _awaitingWorktree = new Map<string, Set<ProtocolURI>>();

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._workspaceFiles = this._register(new AgentHostWorkspaceFiles(_logService));
		this._register(_worktreeIsolation.onDidChangeWorkingDirectoryPending(sessionId => this._onWorktreeResolved(sessionId)));
		this._register(_stateManager.onDidRemoveSession(session => this._releaseSession(session)));
	}

	/**
	 * Starts preparing as soon as a first turn is accepted, so the snapshot is
	 * usually complete by the time {@link onOutgoingTurn} needs it. A session still
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
			let awaiting = this._awaitingWorktree.get(sessionId);
			if (!awaiting) {
				awaiting = new Set();
				this._awaitingWorktree.set(sessionId, awaiting);
			}
			awaiting.add(channel);
			return;
		}
		// The session's worktree may already exist, e.g. when its creation finished before this hook ran.
		const worktree = isDefaultChatUri(channel) ? this._worktreeIsolation.getResolvedWorktree(sessionId) : undefined;
		this._prepare(channel, worktree ? withProcessRoot(worktree, workingDirectories) : workingDirectories);
	}

	/**
	 * Sends only what is already prepared, so the snapshot never delays the
	 * send: a root still being listed or rendered is omitted, and anything
	 * still running is stopped.
	 */
	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		try {
			if (!this._firstTurnWorkingDirectories(turn.chat)) {
				return undefined;
			}
			this._context.memento(firstTurnSeenMemento, turn.chat).set(true, undefined);
			// Compare against the directories the provider will run in, not session state: a worktree created on this send is not in state until the provider materializes.
			const prepared = this._prepared.get(turn.chat);
			if (!prepared || prepared.key !== snapshotKey(resolveAgentHostFileCompletionRoots(turn.workingDirectories ?? []).enumerationRoots)) {
				this._logService.trace(`[WorkspaceContext] Sent a first turn without a snapshot: none was prepared for its working directories`);
				return undefined;
			}
			const pending = prepared.roots.filter(root => !root.settled).length;
			if (pending) {
				this._logService.trace(`[WorkspaceContext] Sent a first turn without ${pending} root(s) whose file list was not ready`);
			}
			const structure = prepared.roots.map(root => root.tree).filter(Boolean).join('\n\n');
			if (!structure) {
				return undefined;
			}
			return {
				instructions: [`<workspace_info>\nInitial workspace structure (file names only):\n${appendEscapedMarkdownCodeBlockFence(structure, 'text')}\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`],
			};
		} finally {
			this._release(turn.chat);
		}
	}

	/** Releases preparation for a first turn that ended before it was sent (rejected, cancelled, or failed). */
	onTurnEnd(turn: ITurnEnd): void {
		this._release(turn.channel);
	}

	/** Stops preparation for a removed chat. Session removal is handled through {@link AgentHostStateManager.onDidRemoveSession}. */
	onDidDispatchAction({ action, rejectionReason }: IDispatchedAction): void {
		if (action.type === ActionType.SessionChatRemoved && rejectionReason === undefined) {
			this._release(action.chat);
		}
	}

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		if (turns.length > 0) {
			this._context.memento(firstTurnSeenMemento, context.chat).set(true, undefined);
		}
		return turns;
	}

	/** Starts preparing the first-turn snapshots that were waiting for the worktree their session just created. */
	private _onWorktreeResolved(sessionId: string): void {
		const awaiting = this._awaitingWorktree.get(sessionId);
		if (!awaiting || this._worktreeIsolation.isWorkingDirectoryPending(sessionId)) {
			return;
		}
		this._awaitingWorktree.delete(sessionId);
		const worktree = this._worktreeIsolation.getResolvedWorktree(sessionId);
		for (const chat of awaiting) {
			const workingDirectories = this._firstTurnWorkingDirectories(chat);
			if (workingDirectories) {
				this._prepare(chat, worktree ? withProcessRoot(worktree, workingDirectories) : workingDirectories);
			}
		}
	}

	/** Stops a chat's preparation, including a pending wait for its worktree. */
	private _release(chat: ProtocolURI): void {
		for (const [sessionId, awaiting] of this._awaitingWorktree) {
			if (awaiting.delete(chat) && awaiting.size === 0) {
				this._awaitingWorktree.delete(sessionId);
			}
		}
		this._prepared.deleteAndDispose(chat);
	}

	private _releaseSession(session: ProtocolURI): void {
		this._awaitingWorktree.delete(AgentSession.id(session));
		for (const chat of [...this._prepared.keys()]) {
			if (parseRequiredSessionUriFromChatUri(chat) === session) {
				this._prepared.deleteAndDispose(chat);
			}
		}
	}

	/**
	 * Starts preparing the chat's snapshot for `workingDirectories`, unless it is
	 * already being prepared for the same roots. A different set replaces and
	 * stops the previous preparation.
	 */
	private _prepare(chat: ProtocolURI, workingDirectories: readonly URI[]): void {
		const { enumerationRoots } = resolveAgentHostFileCompletionRoots(workingDirectories);
		const key = snapshotKey(enumerationRoots);
		if (this._prepared.get(chat)?.key === key) {
			return;
		}
		const cancellation = new CancellationTokenSource();
		const budget = enumerationRoots.length ? Math.floor(MAX_STRUCTURE_LENGTH / enumerationRoots.length) : 0;
		const roots = enumerationRoots.map(root => {
			const prepared: IPreparedRoot = { settled: false, tree: undefined };
			this._prepareRoot(root, budget, cancellation.token).then(tree => {
				prepared.tree = tree;
				prepared.settled = true;
			});
			return prepared;
		});
		this._prepared.set(chat, { key, roots, dispose: () => cancellation.dispose(true) });
	}

	/** Renders one root's tree. Failures are isolated to the root, so other roots still contribute. */
	private async _prepareRoot(root: URI, budget: number, token: CancellationToken): Promise<string | undefined> {
		try {
			const result = await this._workspaceFiles.enumerate(root, token);
			const workspaceTree = await buildWorkspaceTree(root, result.files, token);
			if (!workspaceTree) {
				return undefined;
			}
			const heading = JSON.stringify(root.fsPath).slice(1, -1);
			const tree = renderWorkspaceTree(workspaceTree, result.isTruncated, budget - heading.length - 3);
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
	/** Children in display order, computed once when first rendered. */
	sorted?: readonly IWorkspaceNode[];
}

/**
 * Paths added to the tree between yields to the event loop. Listing can
 * return tens of thousands of paths per root, so building in batches lets the
 * provider send and other host work run while a snapshot is prepared.
 */
const BUILD_BATCH_SIZE = 2000;

function yieldToEventLoop(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

function sortedChildren(node: IWorkspaceNode): readonly IWorkspaceNode[] {
	node.sorted ??= [...node.children.values()].sort((a, b) => Number(a.children.size > 0) - Number(b.children.size > 0) || compare(a.name, b.name));
	return node.sorted;
}

/**
 * Builds the tree from plain path segments rather than URIs, in batches that
 * yield to the event loop. Returns `undefined` once `token` is cancelled.
 */
async function buildWorkspaceTree(root: URI, files: readonly URI[], token: CancellationToken): Promise<IWorkspaceNode | undefined> {
	const tree: IWorkspaceNode = { name: '', children: new Map() };
	const prefix = root.path.endsWith('/') ? root.path : `${root.path}/`;
	for (let index = 0; index < files.length; index++) {
		if (index > 0 && index % BUILD_BATCH_SIZE === 0) {
			await yieldToEventLoop();
		}
		if (token.isCancellationRequested) {
			return undefined;
		}
		const path = files[index].path;
		if (!path.startsWith(prefix)) {
			continue;
		}
		const segments = path.slice(prefix.length).split(/[\\/]/);
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
	return token.isCancellationRequested ? undefined : tree;
}

/** Renders at most `maxLength` characters of `tree`, breadth first, so top-level orientation survives truncation. */
function renderWorkspaceTree(tree: IWorkspaceNode, isTruncated: boolean, maxLength: number): string {
	if (maxLength < 4) {
		return '';
	}
	const selected = new Map<IWorkspaceNode, string>();
	const queue = sortedChildren(tree).map(node => ({ node, depth: 0 }));
	let length = 0;
	let truncated = isTruncated;
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
