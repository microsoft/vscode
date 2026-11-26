/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IOutgoingTurn, type ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostGitService } from '../../../common/agentHostGitService.js';
import { readSessionGitHubState, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../agentHostTurnTracker.js';

/** The folder list last sent to the chat's agent, so that it is sent again only when the folders change. */
const sentFoldersMemento = createChatMementoKey<string | undefined>('workingDirectoriesContext.sent', () => undefined);

/** A working directory as the agent is told about it. */
export interface IWorkingDirectoryContext {
	readonly path: string;
	/** The root of the folder's Git repository, `undefined` for a folder that is not in one. */
	readonly repositoryRoot: string | undefined;
	/** The folder's GitHub repository, as `owner/repo`, when known. */
	readonly gitHubRepository: string | undefined;
}

/**
 * Renders the folders of a turn, its primary (process) folder first. Paths are JSON-quoted, with `<` and `>` escaped,
 * so that a folder name cannot end the block or add lines to it.
 */
export function renderWorkingDirectoriesContext(folders: readonly IWorkingDirectoryContext[]): string {
	const quote = (path: string) => JSON.stringify(path).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
	const describe = (folder: IWorkingDirectoryContext) => folder.repositoryRoot === undefined
		? 'Not a Git repository.'
		: `Git repository root: ${quote(folder.repositoryRoot)}${folder.gitHubRepository ? ` (GitHub: ${folder.gitHubRepository})` : ''}.`;
	const [primary, ...additional] = folders;
	return [
		'<working_directories>',
		'You have read and write access to all of the following folders. Use absolute paths to work in a folder other than the current working directory.',
		`* Primary folder: ${quote(primary.path)} (the current working directory). ${describe(primary)}`,
		...additional.map(folder => `* Additional folder: ${quote(folder.path)}. ${describe(folder)}`),
		'</working_directories>',
	].join('\n');
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

	/**
	 * The chats, by session, that were told about several folders: only they need a record of what they were told. Each
	 * is kept with whether it is still the same chat, as a removed chat's resource can name a new chat later.
	 */
	private readonly _toldChats = new Map<ProtocolURI, Map<ProtocolURI, () => boolean>>();
	/** The list each chat's latest turn carries, until that turn reaches the provider, with whether it is still the same chat. */
	private readonly _pending = new Map<ProtocolURI, { readonly session: ProtocolURI; readonly turnId: string; readonly key: string; readonly isCurrent: () => boolean }>();

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostTurnTracker turnTracker: AgentHostTurnTracker,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(turnTracker.onDidDispatchTurn(({ chat, turnId }) => this._onTurnDispatched(chat, turnId)));
		this._register(_stateManager.onDidRemoveSession(session => this._releaseSession(session)));
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		this._forgetRemovedChats(turn.session);
		const isCurrent = this._stateManager.captureChatValidity(turn.chat);
		const workingDirectories = turn.workingDirectories ?? [];
		const told = this._toldChats.get(turn.session)?.has(turn.chat) ?? false;
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
		const meta = this._stateManager.getSessionState(turn.session)?._meta;
		const limiter = new Limiter<URI | undefined>(REPOSITORY_LOOKUP_CONCURRENCY);
		const repositoryRoots = await Promise.all(workingDirectories.map(directory => limiter.queue(async () => {
			try {
				return await this._gitService.getRepositoryRoot(directory);
			} catch (error) {
				this._logService.warn(`[WorkingDirectoriesContext] Failed to resolve the repository of ${directory.toString()}`, error);
				return undefined;
			}
		})));
		const folders = workingDirectories.map((directory, index): IWorkingDirectoryContext => {
			const repositoryRoot = repositoryRoots[index];
			const gitHub = repositoryRoot ? readSessionGitHubState(meta, directory.toString()) : undefined;
			return {
				path: toDisplayPath(directory),
				repositoryRoot: repositoryRoot && toDisplayPath(repositoryRoot),
				gitHubRepository: gitHub?.owner && gitHub.repo ? `${gitHub.owner}/${gitHub.repo}` : undefined,
			};
		});
		// The chat may have been removed while its folders' repositories were looked up
		if (!isCurrent()) {
			return undefined;
		}
		this._pending.set(turn.chat, { session: turn.session, turnId: turn.turnId, key, isCurrent });
		return { instructions: [renderWorkingDirectoriesContext(folders)] };
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
		let chats = this._toldChats.get(pending.session);
		if (!chats) {
			chats = new Map();
			this._toldChats.set(pending.session, chats);
		}
		chats.set(chat, pending.isCurrent);
		this._context.memento(sentFoldersMemento, chat).set(pending.key, undefined);
	}

	/** Drops what is kept for the chats of `session` that were removed or replaced since, as no event tells about them. */
	private _forgetRemovedChats(session: ProtocolURI): void {
		const told = this._toldChats.get(session);
		for (const [chat, isCurrent] of told ?? []) {
			if (!isCurrent()) {
				told!.delete(chat);
				// The record goes with the chat it was kept for, not to a new chat of the same resource
				this._context.deleteMemento(sentFoldersMemento, chat);
			}
		}
		for (const [chat, pending] of this._pending) {
			if (pending.session === session && !pending.isCurrent()) {
				this._pending.delete(chat);
			}
		}
	}

	private _releaseSession(session: ProtocolURI): void {
		this._toldChats.delete(session);
		for (const [chat, pending] of this._pending) {
			if (pending.session === session) {
				this._pending.delete(chat);
			}
		}
	}
}

function toDisplayPath(resource: URI): string {
	return resource.scheme === Schemas.file ? resource.fsPath : resource.toString();
}
