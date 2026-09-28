/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { appendEscapedMarkdownCodeBlockFence } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceTree, type IResourceNode } from '../../../../../base/common/resourceTree.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { compare } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentSession } from '../../../common/agent.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAppliedClientAction, type IHydrationContext, type IOutgoingTurn, type ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ChatOriginKind, isAhpChatChannel, type Turn, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { resolveAgentHostFileCompletionRoots } from '../../agentHostFileCompletionUtils.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostWorkspaceFiles, type IAgentHostWorkspaceFilesResult } from '../../agentHostWorkspaceFiles.js';
import { IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

const firstTurnSeenMemento = createChatMementoKey<boolean>('firstTurnSeen', () => false);
const MAX_STRUCTURE_LENGTH = 2000;
/**
 * Longest the first send waits for a root's file list before sending without
 * it. Enumeration normally starts when the turn is accepted, so it overlaps
 * working-directory, model, and attachment resolution; this only bounds how
 * much a slow or very large checkout can add to time to first token.
 */
const SNAPSHOT_TIMEOUT_MS = 1000;
type WorkspaceNode = IResourceNode<true, undefined>;

/**
 * Supplies a file-name snapshot on the first turn of a new conversation
 * without changing the user's task text.
 */
export class WorkspaceContextContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'workspaceContext';
	readonly order = 200;
	private readonly _workspaceFiles: AgentHostWorkspaceFiles;

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._workspaceFiles = this._register(new AgentHostWorkspaceFiles(_logService));
	}

	/**
	 * Starts enumerating as soon as a first turn is accepted, so the list is
	 * usually cached by the time {@link onOutgoingTurn} needs it. Skipped while a
	 * worktree is pending: the worktree does not exist yet, and scanning the
	 * source checkout would compete with its creation.
	 */
	onDidApplyClientAction({ channel, session, action }: IAppliedClientAction): void {
		if (action.type !== ActionType.ChatTurnStarted || !isAhpChatChannel(channel) || this._worktreeIsolation.isWorkingDirectoryPending(AgentSession.id(session))) {
			return;
		}
		const workingDirectories = this._firstTurnWorkingDirectories(channel);
		if (!workingDirectories) {
			return;
		}
		for (const root of resolveAgentHostFileCompletionRoots(workingDirectories).enumerationRoots) {
			this._workspaceFiles.getFiles(root, CancellationToken.None).catch(() => { /* Reported when the outgoing turn reads it. */ });
		}
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		if (!this._firstTurnWorkingDirectories(turn.chat)) {
			return undefined;
		}
		this._context.memento(firstTurnSeenMemento, turn.chat).set(true, undefined);
		// Use the directories the provider will run in, not session state: a worktree created on this send is not in state until the provider materializes.
		const { enumerationRoots } = resolveAgentHostFileCompletionRoots(turn.workingDirectories ?? []);
		if (enumerationRoots.length === 0) {
			return undefined;
		}

		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource());
		store.add(disposableTimeout(() => cancellation.cancel(), SNAPSHOT_TIMEOUT_MS));
		try {
			const budget = Math.floor(MAX_STRUCTURE_LENGTH / enumerationRoots.length);
			const structures = await Promise.all(enumerationRoots.map(async root => {
				const result = await this._getFilesWithinDeadline(root, cancellation.token);
				if (!result) {
					return '';
				}
				const heading = JSON.stringify(root.fsPath).slice(1, -1);
				const tree = renderWorkspaceTree(root, result, budget - heading.length - 3);
				return tree ? `${heading}\n${tree}` : '';
			}));
			const structure = structures.filter(Boolean).join('\n\n');
			if (!structure) {
				return undefined;
			}
			return {
				instructions: [`<workspace_info>\nInitial workspace structure (file names only):\n${appendEscapedMarkdownCodeBlockFence(structure, 'text')}\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`],
			};
		} finally {
			store.dispose();
		}
	}

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		if (turns.length > 0) {
			this._context.memento(firstTurnSeenMemento, context.chat).set(true, undefined);
		}
		return turns;
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

	/** Returns `undefined` when the deadline passes, so one slow root does not drop the others. */
	private async _getFilesWithinDeadline(root: URI, token: CancellationToken): Promise<IAgentHostWorkspaceFilesResult | undefined> {
		try {
			return await this._workspaceFiles.getFiles(root, token);
		} catch (err) {
			if (!isCancellationError(err)) {
				throw err;
			}
			this._logService.trace(`[WorkspaceContext] Sent the first turn without ${root.fsPath}: its file list was not ready within ${SNAPSHOT_TIMEOUT_MS}ms`);
			return undefined;
		}
	}
}

function sortedChildren(node: WorkspaceNode): WorkspaceNode[] {
	return [...node.children].sort((a, b) => Number(a.element === undefined) - Number(b.element === undefined) || compare(a.name, b.name));
}

function renderWorkspaceTree(root: URI, result: IAgentHostWorkspaceFilesResult, maxLength: number): string {
	if (maxLength < 4) {
		return '';
	}
	const tree = new ResourceTree<true, undefined>(undefined, root, extUriBiasedIgnorePathCase);
	for (const file of result.files) {
		const path = extUriBiasedIgnorePathCase.relativePath(root, file);
		if (!path || path.split(/[\\/]/).some(segment => segment.startsWith('.') || segment === 'node_modules')) {
			continue;
		}
		tree.add(file, true);
	}

	const selected = new Map<WorkspaceNode, string>();
	const queue = sortedChildren(tree.root).map(node => ({ node, depth: 0 }));
	let length = 0;
	let truncated = result.isTruncated;
	for (let index = 0; index < queue.length; index++) {
		const { node, depth } = queue[index];
		const name = JSON.stringify(node.name).slice(1, -1);
		const line = `${'\t'.repeat(depth)}${name}${node.childrenCount ? '/' : ''}`;
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
	const render = (node: WorkspaceNode): void => {
		const line = selected.get(node);
		if (line !== undefined) {
			lines.push(line);
			for (const child of sortedChildren(node)) {
				render(child);
			}
		}
	};
	for (const node of sortedChildren(tree.root)) {
		render(node);
	}
	if (truncated) {
		lines.push('...');
	}
	return lines.join('\n');
}
