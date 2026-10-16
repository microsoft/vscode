/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agent.js';
import { IAgentHostSessionStateStore, SessionStateMirrorFlush } from '../common/agentHostSessionStateStore.js';
import type { IOlderBuildCopyParticipant } from './agentHostPeerChatStore.js';
import type { IAgentHostWorktreeRemovalDatabase, IWorktreeCoOwnedFolder } from './agentHostWorktreeRemovalDatabase.js';
import { OLDER_BUILD_WORKTREE_WITHHELD_KEY } from './agentHostSessionStateMirror.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY, ISessionAdditionalWorktree, readSessionAdditionalWorktrees } from './shared/sessionAdditionalWorktrees.js';
import type { ISessionWorktreeFolder } from './shared/sessionWorktreeFolders.js';
import { IAgentHostWorktreeIsolation, IWorktreeHandOver, WORKTREE_META_PATH } from './shared/worktreeIsolation.js';

/** An additional worktree a session records, with the branch its record holds. */
export interface ISessionAdditionalWorktreeRecord extends ISessionAdditionalWorktree {
	readonly branch: string;
}

/** The worktrees a session records or shares, as a move reads them. */
export interface ISessionWorktreeRecords {
	/** Its own worktree (`copilot.worktree.*`). */
	readonly primary: IWorktreeCoOwnedFolder | undefined;
	readonly additional: readonly ISessionAdditionalWorktreeRecord[];
	/** The worktrees it co-owns since chats moved ({@link IWorktreeCoOwnedFolder}), its own included once shared. */
	readonly coOwned: readonly IWorktreeCoOwnedFolder[];
}

/** What a move decides for the worktrees of its source (Block 5). */
export interface IWorktreeMoveInput {
	/** A chat move or promotion, or a session that moves under another one (its default chat is its only chat). */
	readonly kind: 'chat' | 'session';
	readonly chat: string;
	/** The moved chat and its descendants. */
	readonly moved: readonly string[];
	/** The folders the moved chats work in: the chat's, and those its descendants set for themselves. */
	readonly chatFolders: readonly string[];
	/** The folders of each chat staying in the source. */
	readonly remainingFolders: readonly (readonly string[])[];
	readonly source: ISessionWorktreeRecords;
	/** The worktree the target records as its own, if any (a chat moving back to the session whose worktree it uses). */
	readonly targetPrimary: string | undefined;
	/**
	 * Whether older builds read the target's session values (its default chat stores in the session's database).
	 * A promoted session, or one whose default chat stores elsewhere, has no such copy: a worktree record moved
	 * there would name an owner whose older-build copy never lists it, so it is shared instead.
	 */
	readonly targetHasOlderBuildCopy: boolean;
}

/** What a move does with the worktrees of its source (Block 5). */
export interface IWorktreeMoveDecisions {
	/** Additional worktrees whose record moves to the target, as the target lists them. */
	readonly transfers: readonly ISessionAdditionalWorktree[];
	/** Worktrees the source and the target share from now on. */
	readonly coOwned: readonly IWorktreeCoOwnedFolder[];
	/** Whether the source records a now shared worktree as its own: older builds' copy withholds its branch. */
	readonly withholdSource: boolean;
	/** Whether the target records a now shared worktree as its own (a chat moving back to the session whose worktree it uses). */
	readonly withholdTarget: boolean;
	/** A session move hands the source's own, unshared worktree to the target as a detached worktree. */
	readonly handOver: boolean;
	/**
	 * Shared worktrees the moved chats work in that the target records in its central worktree folders
	 * (`agentHost.worktreeFolders`): for a chat move and a promotion the newly shared ones, for a session move the
	 * ones its source shared, whose co-owner rows continue as the target's.
	 */
	readonly presented: readonly IWorktreeCoOwnedFolder[];
}

/** The decisions of a move, or the worktree that refuses it: a chat's own additional worktree a staying chat also uses (D2). */
export type IWorktreeMovePlan = { readonly refused: string } | (IWorktreeMoveDecisions & { readonly refused: undefined });

function uses(folders: readonly string[], worktree: string): boolean {
	const root = URI.parse(worktree);
	return folders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(URI.parse(folder), root));
}

/**
 * Whether a moved chat (or a descendant) works in an additional worktree recorded for it that a chat staying in
 * its session also uses: such a move is refused (D2). Pure, from recorded state only.
 */
export function sharedOwnAdditionalWorktree(additional: readonly ISessionAdditionalWorktree[], moved: readonly string[], chatFolders: readonly string[], remainingFolders: readonly (readonly string[])[]): ISessionAdditionalWorktree | undefined {
	const users = new AdditionalWorktreeUsers(additional);
	const movedChats = new Set(moved);
	// The staying chats need no identity of their own, only one no moved chat has.
	remainingFolders.forEach((folders, index) => users.addChat(`staying:${index}`, folders));
	return users.sharedOwnOf(movedChats, chatFolders);
}

/** A folder's key for finding the worktrees recorded at it, as {@link uses} compares them. */
function folderKey(folder: URI): string {
	return extUriBiasedIgnorePathCase.getComparisonKey(extUriBiasedIgnorePathCase.removeTrailingPathSeparator(folder));
}

/**
 * The additional worktrees a session records for its chats, and the chats of the session working in each: what D2
 * ({@link sharedOwnAdditionalWorktree}) is decided by, for every chat of a session at once. Indexed by the chat each
 * worktree was created for, and by folder, so a chat's folder finds the worktrees containing it in one lookup per
 * ancestor: each chat costs its own folders and worktrees, never every worktree of its session.
 */
export class AdditionalWorktreeUsers {

	private readonly _byChat = new Map<string, ISessionAdditionalWorktree[]>();
	private readonly _byFolder = new Map<string, ISessionAdditionalWorktree[]>();
	private readonly _users = new Map<ISessionAdditionalWorktree, string[]>();

	constructor(additional: readonly ISessionAdditionalWorktree[]) {
		for (const worktree of additional) {
			if (worktree.chat !== undefined) {
				pushTo(this._byChat, worktree.chat, worktree);
				pushTo(this._byFolder, folderKey(URI.parse(worktree.workingDirectory)), worktree);
			}
		}
	}

	/** Whether the session records no additional worktree for a chat: no chat of it is refused by D2. */
	get isEmpty(): boolean {
		return this._byChat.size === 0;
	}

	/** Records that `chat` works in `folders` (a chat that stays when it doesn't move). */
	addChat(chat: string, folders: readonly string[]): void {
		if (this.isEmpty) {
			return;
		}
		for (const folder of folders) {
			for (let candidate = URI.parse(folder); ;) {
				for (const worktree of this._byFolder.get(folderKey(candidate)) ?? []) {
					const users = this._users.get(worktree);
					if (!users) {
						this._users.set(worktree, [chat]);
					} else if (users[users.length - 1] !== chat) {
						users.push(chat);
					}
				}
				const parent = extUriBiasedIgnorePathCase.dirname(candidate);
				if (parent.path === candidate.path) {
					break;
				}
				candidate = parent;
			}
		}
	}

	/** The worktree that refuses moving `moved` working in `chatFolders` (D2), if any. */
	sharedOwnOf(moved: ReadonlySet<string>, chatFolders: readonly string[]): ISessionAdditionalWorktree | undefined {
		for (const chat of moved) {
			for (const worktree of this._byChat.get(chat) ?? []) {
				if (uses(chatFolders, worktree.workingDirectory) && this._users.get(worktree)?.some(user => !moved.has(user))) {
					return worktree;
				}
			}
		}
		return undefined;
	}
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const values = map.get(key);
	if (values) {
		values.push(value);
	} else {
		map.set(key, [value]);
	}
}

/**
 * Decides what a move does with each worktree of its source (Block 5): an additional worktree recorded for a moved
 * chat that no staying chat uses transfers to the target (case a), one a staying chat also uses refuses the move (D2),
 * and every other worktree the moved chat works in becomes shared by the source and the target, its own recorder
 * withholding its branch from older builds. A session that moves under another one ends: its additional worktrees
 * transfer, its own worktree is handed over unless already shared, and its shares continue as the target's.
 */
export function planWorktreeMove(input: IWorktreeMoveInput): IWorktreeMovePlan {
	const { source } = input;
	if (input.kind === 'session' && !input.targetHasOlderBuildCopy) {
		// The source ends: its records stay where they are (older builds no longer list it), the target shares them.
		const shared: IWorktreeCoOwnedFolder[] = [
			...(source.primary && !source.coOwned.some(folder => sameWorktree(folder.worktreePath, source.primary!.worktreePath)) ? [source.primary] : []),
			...source.additional.map(worktree => ({ worktreePath: worktree.workingDirectory, repositoryRoot: worktree.repositoryRoot, branch: worktree.branch })),
		];
		return {
			refused: undefined,
			transfers: [],
			coOwned: shared,
			withholdSource: false,
			withholdTarget: false,
			handOver: false,
			presented: [...shared, ...source.coOwned].filter(folder => uses(input.chatFolders, folder.worktreePath)),
		};
	}
	if (input.kind === 'session') {
		const primary = source.primary;
		return {
			refused: undefined,
			transfers: source.additional.map(worktree => ({ handle: worktree.handle, workingDirectory: worktree.workingDirectory, repositoryRoot: worktree.repositoryRoot, chat: worktree.chat ?? input.chat })),
			coOwned: [],
			withholdSource: false,
			withholdTarget: false,
			handOver: primary !== undefined && !source.coOwned.some(folder => sameWorktree(folder.worktreePath, primary.worktreePath)),
			presented: source.coOwned.filter(folder => uses(input.chatFolders, folder.worktreePath)),
		};
	}
	const refused = sharedOwnAdditionalWorktree(source.additional, input.moved, input.chatFolders, input.remainingFolders);
	if (refused) {
		return { refused: refused.workingDirectory };
	}
	const transfers: ISessionAdditionalWorktree[] = [];
	const coOwned: IWorktreeCoOwnedFolder[] = [];
	const share = (folder: IWorktreeCoOwnedFolder) => {
		if (!coOwned.some(existing => sameWorktree(existing.worktreePath, folder.worktreePath))) {
			coOwned.push(folder);
		}
	};
	if (source.primary && uses(input.chatFolders, source.primary.worktreePath)) {
		share(source.primary);
	}
	for (const worktree of source.additional) {
		if (!uses(input.chatFolders, worktree.workingDirectory)) {
			continue;
		}
		if (worktree.chat !== undefined && input.moved.includes(worktree.chat) && input.targetHasOlderBuildCopy) {
			transfers.push({ handle: worktree.handle, workingDirectory: worktree.workingDirectory, repositoryRoot: worktree.repositoryRoot, chat: worktree.chat });
		} else {
			share({ worktreePath: worktree.workingDirectory, repositoryRoot: worktree.repositoryRoot, branch: worktree.branch });
		}
	}
	for (const folder of source.coOwned) {
		if (uses(input.chatFolders, folder.worktreePath)) {
			share(folder);
		}
	}
	return {
		refused: undefined,
		transfers,
		coOwned,
		withholdSource: source.primary !== undefined && coOwned.some(folder => sameWorktree(folder.worktreePath, source.primary!.worktreePath)),
		withholdTarget: input.targetPrimary !== undefined && coOwned.some(folder => sameWorktree(folder.worktreePath, input.targetPrimary!)),
		handOver: false,
		// A chat's own worktree that moves with it is presented too: it is the primary folder of a promoted chat's session.
		presented: [...coOwned, ...source.additional.filter(worktree => transfers.some(transfer => transfer.handle === worktree.handle))
			.map(worktree => ({ worktreePath: worktree.workingDirectory, repositoryRoot: worktree.repositoryRoot, branch: worktree.branch }))],
	};
}

function sameWorktree(a: string, b: string): boolean {
	return extUriBiasedIgnorePathCase.isEqual(URI.parse(a), URI.parse(b));
}

/**
 * The worktree folders a move records for its target (`agentHost.worktreeFolders`): the shared worktrees it presents,
 * except the target's own worktree (a chat moving back to the session that recorded it), which it presents natively.
 */
export function presentedWorktreeFolders(presented: readonly IWorktreeCoOwnedFolder[], targetPrimary: string | undefined): readonly ISessionWorktreeFolder[] {
	return presented
		.filter(folder => targetPrimary === undefined || !sameWorktree(folder.worktreePath, targetPrimary))
		.map(folder => ({ workingDirectory: folder.worktreePath, repositoryRoot: folder.repositoryRoot, branch: folder.branch }));
}

/** A move's withholding of a session's worktree branch, while the move shares it: it ends with the move. */
export interface IWorktreeWithholding {
	/** The move committed: its co-owner rows keep the branch withheld from now on. */
	done(): void;
	/** The move was refused: withholding stops unless the session shares its worktree or another share is in flight. */
	undo(): Promise<void>;
}

/**
 * The worktree side of moving chats between sessions (Block 5): reads what a move needs, withholds a shared
 * worktree's branch from older builds, hands records over in the order older builds rely on, and stops withholding
 * once a worktree is no longer shared. Queries run only on moves, publishes and clean-up, never on a hot path.
 */
export class AgentHostWorktreeCoOwnership implements IOlderBuildCopyParticipant {

	/** Moves sharing a session's worktree that haven't committed or been refused yet, by session. */
	private readonly _sharesInFlight = new Map<string, number>();

	constructor(
		private readonly _database: IAgentHostWorktreeRemovalDatabase,
		private readonly _sessionStateStore: IAgentHostSessionStateStore,
		private readonly _worktree: IAgentHostWorktreeIsolation,
		private readonly _logService: ILogService,
	) { }

	/**
	 * The worktrees `session` records or shares, read without Git or importing it. Includes a worktree this process
	 * created whose metadata isn't persisted (yet), so a move shares or transfers it like a recorded one.
	 */
	async readSessionWorktrees(session: URI): Promise<ISessionWorktreeRecords> {
		const primary = await this._worktree.readSessionWorktreeForRemoval(session, { includeUnpersisted: true });
		const additional: ISessionAdditionalWorktreeRecord[] = [];
		for (const worktree of await readSessionAdditionalWorktrees(this._sessionStateStore, session)) {
			const record = await this._worktree.readDetachedWorktreeForRemoval(worktree.handle, { includeUnpersisted: true });
			additional.push({ ...worktree, branch: record?.branchName ?? '' });
		}
		return {
			primary: primary && { worktreePath: primary.worktree.toString(), repositoryRoot: primary.repositoryRoot.toString(), branch: primary.branchName },
			additional,
			coOwned: await this._database.listWorktreeCoOwnersOfSession(session.toString()),
		};
	}

	/** The worktree `session` records as its own, as a URI string. */
	async readPrimaryWorktree(session: URI): Promise<string | undefined> {
		return (await this._sessionStateStore.readWithoutImport(session, [WORKTREE_META_PATH])).get(WORKTREE_META_PATH) || undefined;
	}

	/**
	 * Withholds the worktree branch of `session` from older builds before a move shares its worktree, so no older
	 * build can remove it once it is shared. Until the move ends ({@link IWorktreeWithholding}), nothing releases it:
	 * its co-owner rows are written only by its commit, so a publish or a refused move meanwhile would see none.
	 */
	async withhold(session: URI): Promise<IWorktreeWithholding> {
		const key = session.toString();
		this._sharesInFlight.set(key, (this._sharesInFlight.get(key) ?? 0) + 1);
		let ended = false;
		const end = () => {
			if (!ended) {
				ended = true;
				const count = (this._sharesInFlight.get(key) ?? 1) - 1;
				if (count > 0) {
					this._sharesInFlight.set(key, count);
				} else {
					this._sharesInFlight.delete(key);
				}
			}
		};
		try {
			// Acknowledged: no move may share the worktree while an older build could still read its branch.
			await this._sessionStateStore.update(session, OLDER_BUILD_WORKTREE_WITHHELD_KEY, () => 'true', SessionStateMirrorFlush.Acknowledged);
		} catch (error) {
			end();
			throw error;
		}
		return {
			done: end,
			// A refused move releases only by the rule a publish follows: never while the session shares its worktree or another share is in flight.
			undo: async () => {
				end();
				await this.releaseWithholding(session);
			},
		};
	}

	/**
	 * Hands the records a committed move transferred to `target`, in the order 1.142 relies on: the target's
	 * older-build copy lists them first, then each record names the target, then the source's copy drops them, so
	 * the owner's list names a handle at every instant. A session that ended by the move has no copy to drop; its
	 * own worktree, handed over, is the target's from then on.
	 */
	async completeTransfers(source: URI, target: URI, transfers: readonly ISessionAdditionalWorktree[], handOver: IWorktreeHandOver | undefined, sourceEnded: boolean): Promise<void> {
		if (transfers.length === 0 && !handOver) {
			return;
		}
		// The record names the target only once older builds' copy of the target lists it; a failure leaves it naming
		// the source, which startup reconciliation re-owns in the same order.
		await this._republishAdditionalWorktrees(target, SessionStateMirrorFlush.Acknowledged);
		for (const transfer of transfers) {
			await this._worktree.setDetachedWorktreeOwner(transfer.handle, target);
		}
		if (handOver) {
			await this._worktree.completeWorktreeHandOver(AgentSession.id(source), handOver.handle, target);
		}
		if (!sourceEnded) {
			// Not acknowledged: until its copy drops the handle, the source still lists it, the safe side.
			await this._republishAdditionalWorktrees(source, SessionStateMirrorFlush.Immediate);
		}
	}

	/** Rewrites a session's central additional worktree list unchanged, so its older-build copy follows now. */
	private async _republishAdditionalWorktrees(session: URI, flush: SessionStateMirrorFlush): Promise<void> {
		await this._sessionStateStore.update(session, ADDITIONAL_WORKTREES_METADATA_KEY, value => value ?? null, flush);
	}

	/** The sessions co-owning any of `worktreePaths`. */
	async sessionsSharing(worktreePaths: readonly string[]): Promise<readonly URI[]> {
		const sessions = new Map<string, URI>();
		for (const worktreePath of worktreePaths) {
			for (const coOwner of await this._database.readWorktreeCoOwners(worktreePath)) {
				sessions.set(coOwner.session, URI.parse(coOwner.session));
			}
		}
		return [...sessions.values()];
	}

	beforeOlderBuildCopyPublish(session: URI): Promise<void> {
		return this.releaseWithholding(session);
	}

	/**
	 * Stops withholding the worktree branch of `session` from older builds once its worktree is no longer shared:
	 * fewer than two live co-owners are left after the stale ones are pruned. Runs when its older-build copy is
	 * published; the last co-owner row stays, so the folder's removal still commits.
	 */
	async releaseWithholding(session: URI): Promise<void> {
		const values = await this._sessionStateStore.readWithoutImport(session, [OLDER_BUILD_WORKTREE_WITHHELD_KEY, WORKTREE_META_PATH]);
		if (values.get(OLDER_BUILD_WORKTREE_WITHHELD_KEY) !== 'true') {
			return;
		}
		if (this._sharesInFlight.has(session.toString())) {
			return;
		}
		// A session deleted meanwhile (also by an older build) has nothing to publish to, and its state can't be written.
		if (!await this._database.isSessionLive(session.toString())) {
			return;
		}
		const worktree = values.get(WORKTREE_META_PATH);
		const coOwners = worktree ? await this._worktree.runExclusive(worktree, () => this._database.pruneWorktreeCoOwners(worktree)) : [];
		if (coOwners.filter(coOwner => coOwner.live).length < 2) {
			// Decided again inside the store's section for the session: a share that started meanwhile keeps it.
			let released = false;
			await this._sessionStateStore.update(session, OLDER_BUILD_WORKTREE_WITHHELD_KEY, value => {
				released = !this._sharesInFlight.has(session.toString());
				return released ? null : value ?? null;
			}, SessionStateMirrorFlush.Immediate);
			if (released) {
				this._logService.info(`[AgentHostWorktreeCoOwnership] ${session.toString()} no longer shares its worktree; older builds see its branch again`);
			}
		}
	}
}
