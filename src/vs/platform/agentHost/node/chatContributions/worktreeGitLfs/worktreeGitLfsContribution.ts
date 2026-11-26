/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext, type IOutgoingTurn, type ISendContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostSessionStateStore } from '../../../common/agentHostSessionStateStore.js';
import { AgentSystemNotificationKind, readAgentSystemNotificationMeta } from '../../../common/meta/agentSystemNotificationMeta.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ResponsePartKind, type ResponsePart, type Turn } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostChatOwnershipService } from '../../agentHostChatOwnershipService.js';
import { readSessionAdditionalWorktrees } from '../../shared/sessionAdditionalWorktrees.js';
import { buildWorktreeGitLfsNotification, detachedWorktreeRecordUri, IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

export const gitLfsPointerFilesInstruction = `<git_lfs_pointer_files>
Git LFS is not available in this worktree, so files tracked with Git LFS (\`filter=lfs\` in .gitattributes) contain Git LFS pointer text instead of their content.
Do not edit, regenerate, or delete these files, and do not override the Git LFS filter in git commands.
If a task needs their content, tell the user to install Git LFS and run \`git lfs pull\` in the worktree.
</git_lfs_pointer_files>`;

/** Stands for the directory of a restored chat whose history already shows the warning. */
const WARNING_IN_HISTORY = 'history';

const checkedDirectoryKey = createChatMementoKey<string | undefined>('worktreeGitLfs.checkedDirectory', () => undefined);
const pendingTurnKey = createChatMementoKey<{ readonly turnId: string; readonly directory: string } | undefined>('worktreeGitLfs.pendingTurn', () => undefined);
const warnedDirectoryKey = createChatMementoKey<string | undefined>('worktreeGitLfs.warnedDirectory', () => undefined);

function isGitLfsWarning(part: ResponsePart): boolean {
	return part.kind === ResponsePartKind.SystemNotification && readAgentSystemNotificationMeta(part).kind === AgentSystemNotificationKind.WorktreeGitLfsUnavailable;
}

/**
 * Tells a chat's agent that its worktree has Git LFS pointer files instead of
 * their content, until a turn that carries the instruction succeeds, and warns
 * the user in the chats that announce the worktree. A restored chat checks its
 * worktree again on its next turn, because the worktree may have been recreated
 * since, but does not repeat a warning that its restored history already shows.
 */
export class WorktreeGitLfsContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'worktreeGitLfs';
	/** Follows `worktreeAnnouncement` (200), so the live warning follows the announcement, and hydration sees the warning that it restores. */
	readonly order = 250;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
	) {
		super();
	}

	/** Only a successful turn proves that its prompt reached the provider; after any other end, the next turn carries the instruction again. */
	onTurnEnd({ channel, turnId, reason }: ITurnEnd): void {
		const pending = this._context.memento(pendingTurnKey, channel);
		const turn = pending.get();
		if (turn === undefined || turn.turnId !== turnId) {
			return;
		}
		pending.set(undefined, undefined);
		if (reason.kind === 'success') {
			this._context.memento(checkedDirectoryKey, channel).set(turn.directory, undefined);
		}
	}

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		if (turns.some(turn => turn.responseParts.some(isGitLfsWarning))) {
			this._context.memento(warnedDirectoryKey, context.chat).set(WARNING_IN_HISTORY, undefined);
		}
		return turns;
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const directory = turn.workingDirectories?.[0];
		if (!directory) {
			return undefined;
		}
		const checked = this._context.memento(checkedDirectoryKey, turn.chat);
		if (checked.get() === directory.toString()) {
			return undefined;
		}

		const isDefaultChat = this._chatOwnership.isDefaultChat(turn.session, turn.chat);
		const ownWorktree = isDefaultChat ? undefined : (await readSessionAdditionalWorktrees(this._sessionStateStore, URI.parse(turn.session))).find(worktree => worktree.chat === turn.chat);
		const metadata = await this._worktreeIsolation.readWorktreeMetadata(ownWorktree ? detachedWorktreeRecordUri(ownWorktree.handle) : URI.parse(turn.session));
		if (!metadata?.gitLfsPointerFiles || !metadata.worktreePath || !isEqualOrParent(directory, metadata.worktreePath)) {
			checked.set(directory.toString(), undefined);
			return undefined;
		}
		this._context.memento(pendingTurnKey, turn.chat).set({ turnId: turn.turnId, directory: directory.toString() }, undefined);
		const announcesWorktree = isDefaultChat || ownWorktree !== undefined;
		const warned = this._context.memento(warnedDirectoryKey, turn.chat);
		const warnedBefore = warned.get();
		if (announcesWorktree && warnedBefore !== directory.toString()) {
			warned.set(directory.toString(), undefined);
			if (warnedBefore !== WARNING_IN_HISTORY) {
				this._stateManager.dispatchServerAction(turn.chat, {
					type: ActionType.ChatResponsePart,
					turnId: turn.turnId,
					part: buildWorktreeGitLfsNotification(),
				});
			}
		}
		return { instructions: [gitLfsPointerFilesInstruction] };
	}
}
