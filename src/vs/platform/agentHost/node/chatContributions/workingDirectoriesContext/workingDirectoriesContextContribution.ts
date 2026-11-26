/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IDispatchedAction, type IOutgoingTurn, type ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostGitService } from '../../../common/agentHostGitService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, isSubagentSession, readSessionGitHubState, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { IAgentHostSessionStateStore } from '../../../common/agentHostSessionStateStore.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { SessionServerToolName } from '../../../common/serverToolNames.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../agentHostTurnTracker.js';
import { readSessionAdditionalWorktrees } from '../../shared/sessionAdditionalWorktrees.js';

/** The folder list last sent to the chat's agent, so that it is sent again only when the folders change. */
const sentFoldersMemento = createChatMementoKey<string | undefined>('workingDirectoriesContext.sent', () => undefined);

/** A working directory as the agent is told about it. */
interface IWorkingDirectoryContext {
	readonly path: string;
	/** The root of the folder's Git repository, `undefined` for a folder that is not in one. */
	readonly repositoryRoot: string | undefined;
	/** The folder's GitHub repository, as `owner/repo`, when known. */
	readonly gitHubRepository: string | undefined;
	/**
	 * Whether the folder is the user's own checkout in a session whose worktree isolates only its primary folder: the
	 * agent asks the user before changing it whether to move it into a worktree of its own or to work in place.
	 */
	readonly sharedCheckout?: boolean;
	/** Whether the folder is not in a Git repository in a session that gives every Git folder a worktree, so it is changed in place. */
	readonly inPlace?: boolean;
}

/** At most this many folders' repositories are resolved at once, so a chat of many cold folders does not flood Git. */
const REPOSITORY_LOOKUP_CONCURRENCY = 4;

/**
 * Tells the agent about every folder of a chat that works in several folders, as provider SDKs describe only the
 * process working directory. The list goes with the first turn and again with the next turn after the folders change,
 * including when a chat that had several folders is left with one, and once more after a host restart (the record is
 * in memory). A list counts as told only once its turn reached the provider, so a turn cancelled before that sends it
 * again. Chats that only ever had one folder get nothing.
 */
export class WorkingDirectoriesContextContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'workingDirectoriesContext';
	/** Precedes the workspace snapshot (175), which lists the same folders' files. */
	readonly order = 170;

	/** The chats that were told about several folders: only they need a record of what they were told. Dropped with the chat. */
	private readonly _toldChats = new Set<ProtocolURI>();
	/**
	 * The list each chat's latest turn carries, until that turn reaches the provider, with whether it is still the same
	 * chat: a chat removed meanwhile, whose resource may name a new chat by then, is not recorded as told.
	 */
	private readonly _pending = new Map<ProtocolURI, { readonly turnId: string; readonly key: string; readonly isCurrent: () => boolean }>();
	/** The turn each chat prepares a list for last, so that an earlier turn's list that is ready later is dropped. */
	private readonly _preparing = new Map<ProtocolURI, string>();

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@IAgentHostTurnTracker turnTracker: AgentHostTurnTracker,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(turnTracker.onDidDispatchTurn(({ chat, turnId }) => this._onTurnDispatched(chat, turnId)));
		this._register(_stateManager.onDidUnregisterChat(({ chat }) => this._forgetChat(chat)));
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const isCurrent = this._stateManager.captureChatValidity(turn.chat);
		this._preparing.set(turn.chat, turn.turnId);
		const workingDirectories = turn.workingDirectories ?? [];
		const told = this._toldChats.has(turn.chat);
		// Also sent when a chat that was told about several folders is left with one.
		if (!workingDirectories.length || (workingDirectories.length < 2 && !told)) {
			this._pending.delete(turn.chat);
			return undefined;
		}
		const key = workingDirectories.map(directory => directory.toString()).join('\n');
		if (told && this._context.memento(sentFoldersMemento, turn.chat).get() === key) {
			this._pending.delete(turn.chat);
			return undefined;
		}
		const sessionState = this._stateManager.getSessionState(turn.session);
		const meta = sessionState?._meta;
		const limiter = new Limiter<URI | undefined>(REPOSITORY_LOOKUP_CONCURRENCY);
		const repositoryRoots = await Promise.all(workingDirectories.map(directory => limiter.queue(async () => {
			try {
				return await this._gitService.getRepositoryRoot(directory);
			} catch (error) {
				this._logService.warn(`[WorkingDirectoriesContext] Failed to resolve the repository of ${directory.toString()}`, error);
				return undefined;
			}
		})));
		// With a worktree for the primary folder only, an additional Git folder outside the session's worktrees is shared
		const worktreeSession = sessionState?.config?.values[SessionConfigKey.Isolation] === 'worktree' && !isSubagentSession(turn.session);
		const allFolders = worktreeSession && sessionState?.config?.values[SessionConfigKey.WorktreeFolders] === 'all';
		const isolatedRoots = worktreeSession
			? await this._getIsolatedRoots(turn.session, repositoryRoots[0])
			: undefined;
		const folders = workingDirectories.map((directory, index): IWorkingDirectoryContext => {
			const repositoryRoot = repositoryRoots[index];
			const gitHub = repositoryRoot ? readSessionGitHubState(meta, directory.toString()) : undefined;
			return {
				path: this._toDisplayPath(directory),
				repositoryRoot: repositoryRoot && this._toDisplayPath(repositoryRoot),
				gitHubRepository: gitHub?.owner && gitHub.repo ? `${gitHub.owner}/${gitHub.repo}` : undefined,
				sharedCheckout: index > 0 && !!repositoryRoot && !!isolatedRoots && !isolatedRoots.some(root => extUriBiasedIgnorePathCase.isEqual(root, repositoryRoot)),
				inPlace: index > 0 && !repositoryRoot && allFolders,
			};
		});
		// The chat may have been removed while its folders' repositories were looked up, or a later turn started
		if (!isCurrent() || this._preparing.get(turn.chat) !== turn.turnId) {
			return undefined;
		}
		this._pending.set(turn.chat, { turnId: turn.turnId, key, isCurrent });
		return { instructions: [this._renderWorkingDirectories(folders)] };
	}

	/**
	 * The checkouts the session isolates: the primary folder's, which is the session's worktree, and the worktrees it
	 * created for additional folders.
	 */
	private async _getIsolatedRoots(session: string, primaryRoot: URI | undefined): Promise<readonly URI[]> {
		let additional: readonly URI[] = [];
		try {
			additional = (await readSessionAdditionalWorktrees(this._sessionStateStore, URI.parse(session))).map(record => URI.parse(record.workingDirectory));
		} catch (error) {
			this._logService.warn(`[WorkingDirectoriesContext] Failed to read the additional worktrees of ${session}`, error);
		}
		return primaryRoot ? [primaryRoot, ...additional] : additional;
	}

	private _onTurnDispatched(chat: ProtocolURI, turnId: string): void {
		const pending = this._pending.get(chat);
		if (pending?.turnId !== turnId) {
			return;
		}
		this._pending.delete(chat);
		if (!pending.isCurrent()) {
			return;
		}
		this._toldChats.add(chat);
		this._context.memento(sentFoldersMemento, chat).set(pending.key, undefined);
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		// A truncated chat's agent may no longer have the list in its history, so the next turn sends it again
		if (dispatched.rejectionReason === undefined && dispatched.action.type === ActionType.ChatTruncated && isAhpChatChannel(dispatched.channel)) {
			this._forgetChat(dispatched.channel);
		}
	}

	/**
	 * Drops what is kept for a chat that left the session, or whose history was truncated, so that its next turn starts
	 * afresh.
	 */
	private _forgetChat(chat: ProtocolURI): void {
		this._pending.delete(chat);
		this._preparing.delete(chat);
		if (this._toldChats.delete(chat)) {
			this._context.deleteMemento(sentFoldersMemento, chat);
		}
	}

	/**
	 * Renders the folders of a turn, its primary (process) folder first. Paths are JSON-quoted, with `<` and `>` escaped,
	 * so that a folder name cannot end the block or add lines to it.
	 */
	private _renderWorkingDirectories(folders: readonly IWorkingDirectoryContext[]): string {
		const quote = (path: string) => JSON.stringify(path).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
		const describe = (folder: IWorkingDirectoryContext) => folder.repositoryRoot === undefined
			? 'Not a Git repository.'
			: `Git repository root: ${quote(folder.repositoryRoot)}${folder.gitHubRepository ? ` (GitHub: ${folder.gitHubRepository})` : ''}.`;
		const [primary, ...additional] = folders;
		return [
			'<working_directories>',
			'You have read and write access to all of the following folders. Use absolute paths to work in a folder other than the current working directory.',
			`* Primary folder: ${quote(primary.path)} (the current working directory). ${describe(primary)}`,
			...additional.map(folder => `* Additional folder${folder.sharedCheckout ? ' (shared checkout, not isolated)' : ''}: ${quote(folder.path)}. ${describe(folder)}`),
			...(additional.some(folder => folder.sharedCheckout) ? [
				`A shared checkout is the user's own copy of the folder. Read it in place. Before creating, editing or deleting files in it, or running commands that change files in it, ask the user whether to isolate it in a worktree of its own or to work in place, and wait for the answer. To isolate it, call the \`${SessionServerToolName.IsolateFolder}\` tool with its path, on its own, then end the turn: the host continues the task, and you work only in the path that tool returned. To work in place, change it where it is.`,
			] : []),
			...(additional.some(folder => folder.inPlace) ? [
				'Folders that are not in a Git repository are not isolated in a worktree: changes to them are made in the user\'s own folder.',
			] : []),
			'</working_directories>',
		].join('\n');
	}

	private _toDisplayPath(resource: URI): string {
		return resource.scheme === Schemas.file ? resource.fsPath : resource.toString();
	}
}
