/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agent.js';
import { IAgentHostSessionStateStore, SessionStateMirrorFlush } from '../common/agentHostSessionStateStore.js';
import type { IAgentHostWorktreeRemovalDatabase, IWorktreeCoOwnedFolder } from './agentHostWorktreeRemovalDatabase.js';
import { OLDER_BUILD_WORKTREE_WITHHELD_KEY } from './agentHostSessionStateMirror.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY, ISessionAdditionalWorktree, readSessionAdditionalWorktrees } from './shared/sessionAdditionalWorktrees.js';
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
	readonly chatFolders: readonly string[];
	/** The folders of each chat staying in the source. */
	readonly remainingFolders: readonly (readonly string[])[];
	readonly source: ISessionWorktreeRecords;
	/** The worktree the target records as its own, if any (a chat moving back to the session whose worktree it uses). */
	readonly targetPrimary: string | undefined;
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
	return additional.find(worktree => worktree.chat !== undefined && moved.includes(worktree.chat)
		&& uses(chatFolders, worktree.workingDirectory)
		&& remainingFolders.some(folders => uses(folders, worktree.workingDirectory)));
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
	if (input.kind === 'session') {
		const primary = source.primary;
		return {
			refused: undefined,
			transfers: source.additional.map(worktree => ({ handle: worktree.handle, workingDirectory: worktree.workingDirectory, repositoryRoot: worktree.repositoryRoot, chat: worktree.chat ?? input.chat })),
			coOwned: [],
			withholdSource: false,
			withholdTarget: false,
			handOver: primary !== undefined && !source.coOwned.some(folder => sameWorktree(folder.worktreePath, primary.worktreePath)),
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
		if (worktree.chat !== undefined && input.moved.includes(worktree.chat)) {
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
	};
}

function sameWorktree(a: string, b: string): boolean {
	return extUriBiasedIgnorePathCase.isEqual(URI.parse(a), URI.parse(b));
}

/** The additional worktree list after a move removes `transfers` from it, as a session value (`null` when empty). */
export function withoutTransferred(worktrees: readonly ISessionAdditionalWorktree[], transfers: readonly ISessionAdditionalWorktree[]): string | null {
	const remaining = worktrees.filter(worktree => !transfers.some(transfer => transfer.handle === worktree.handle));
	return remaining.length > 0 ? JSON.stringify(remaining) : null;
}

/** The additional worktree list after a move adds `transfers` to it, as a session value. */
export function withTransferred(worktrees: readonly ISessionAdditionalWorktree[], transfers: readonly ISessionAdditionalWorktree[]): string | null {
	const added = [...worktrees.filter(worktree => !transfers.some(transfer => transfer.handle === worktree.handle)), ...transfers];
	return added.length > 0 ? JSON.stringify(added) : null;
}

/**
 * The worktree side of moving chats between sessions (Block 5): reads what a move needs, withholds a shared
 * worktree's branch from older builds, hands records over in the order older builds rely on, and stops withholding
 * once a worktree is no longer shared. Queries run only on moves, publishes and clean-up, never on a hot path.
 */
export class AgentHostWorktreeCoOwnership {

	constructor(
		private readonly _database: IAgentHostWorktreeRemovalDatabase,
		private readonly _sessionStateStore: IAgentHostSessionStateStore,
		private readonly _worktree: IAgentHostWorktreeIsolation,
		private readonly _logService: ILogService,
	) { }

	/** The worktrees `session` records or shares, read without Git or importing it. */
	async readSessionWorktrees(session: URI): Promise<ISessionWorktreeRecords> {
		const primary = await this._worktree.readSessionWorktreeForRemoval(session);
		const additional: ISessionAdditionalWorktreeRecord[] = [];
		for (const worktree of await readSessionAdditionalWorktrees(this._sessionStateStore, session)) {
			const record = await this._worktree.readDetachedWorktreeForRemoval(worktree.handle);
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
	 * build can remove it once it is shared. Returns the undo for a refused move: withholding stops unless it was on.
	 */
	async withhold(session: URI): Promise<() => Promise<void>> {
		let previous: string | undefined;
		await this._sessionStateStore.update(session, OLDER_BUILD_WORKTREE_WITHHELD_KEY, value => {
			previous = value;
			return 'true';
		}, SessionStateMirrorFlush.Immediate);
		return async () => {
			if (previous !== 'true') {
				await this._sessionStateStore.update(session, OLDER_BUILD_WORKTREE_WITHHELD_KEY, () => null, SessionStateMirrorFlush.Immediate);
			}
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
		await this._republishAdditionalWorktrees(target);
		for (const transfer of transfers) {
			await this._worktree.setDetachedWorktreeOwner(transfer.handle, target);
		}
		if (handOver) {
			await this._worktree.completeWorktreeHandOver(AgentSession.id(source), handOver.handle, target);
		}
		if (!sourceEnded) {
			await this._republishAdditionalWorktrees(source);
		}
	}

	/** Rewrites a session's central additional worktree list unchanged, so its older-build copy follows now. */
	private async _republishAdditionalWorktrees(session: URI): Promise<void> {
		await this._sessionStateStore.update(session, ADDITIONAL_WORKTREES_METADATA_KEY, value => value ?? null, SessionStateMirrorFlush.Immediate);
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
		const worktree = values.get(WORKTREE_META_PATH);
		const coOwners = worktree ? await this._worktree.runExclusive(worktree, () => this._database.pruneWorktreeCoOwners(worktree)) : [];
		if (coOwners.filter(coOwner => coOwner.live).length < 2) {
			this._logService.info(`[AgentHostWorktreeCoOwnership] ${session.toString()} no longer shares its worktree; older builds see its branch again`);
			await this._sessionStateStore.update(session, OLDER_BUILD_WORKTREE_WITHHELD_KEY, () => null, SessionStateMirrorFlush.Immediate);
		}
	}
}
