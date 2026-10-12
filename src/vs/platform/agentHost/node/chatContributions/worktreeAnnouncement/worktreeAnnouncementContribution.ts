/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext, type IOutgoingTurn } from '../../../common/agentHostChatContributionsService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isDefaultChatUri, ResponsePartKind, type Turn } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { readSessionAdditionalWorktrees, type ISessionAdditionalWorktree } from '../../shared/sessionAdditionalWorktrees.js';
import { buildWorktreeAnnouncementText, detachedWorktreeRecordUri, IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

const announcementEmittedKey = createChatMementoKey('worktreeAnnouncement.emitted', () => false);

/** Restores the worktree notice on the default chat when isolation is configured. */
export class WorktreeAnnouncementContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'worktreeAnnouncement';
	readonly order = 200;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		if (isDefaultChatUri(context.chat)) {
			return this._worktreeIsolation.applyRestoreAnnouncement(URI.parse(context.session), turns);
		}
		const worktree = await this._findOwnedWorktree(context.session, context.chat);
		if (!worktree) {
			return turns;
		}
		const hydrated = await this._worktreeIsolation.applyRestoreAnnouncement(detachedWorktreeRecordUri(worktree.handle), turns);
		if (hydrated !== turns) {
			this._context.memento(announcementEmittedKey, context.chat).set(true, undefined);
		}
		return hydrated;
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<undefined> {
		if (isDefaultChatUri(turn.chat)) {
			return undefined;
		}
		const emitted = this._context.memento(announcementEmittedKey, turn.chat);
		if (emitted.get()) {
			return undefined;
		}
		const worktree = await this._findOwnedWorktree(turn.session, turn.chat);
		if (!worktree) {
			return undefined;
		}
		const metadata = await this._worktreeIsolation.readWorktreeMetadata(detachedWorktreeRecordUri(worktree.handle));
		if (!metadata) {
			return undefined;
		}
		this._stateManager.dispatchServerAction(turn.chat, {
			type: ActionType.ChatResponsePart,
			turnId: turn.turnId,
			part: {
				kind: ResponsePartKind.Markdown,
				id: generateUuid(),
				content: buildWorktreeAnnouncementText(metadata.branchName),
			},
		});
		emitted.set(true, undefined);
		return undefined;
	}

	private async _findOwnedWorktree(session: string, chat: string): Promise<ISessionAdditionalWorktree | undefined> {
		const worktrees = await readSessionAdditionalWorktrees(this._sessionDataService, URI.parse(session));
		return worktrees.find(worktree => worktree.chat === chat);
	}
}
