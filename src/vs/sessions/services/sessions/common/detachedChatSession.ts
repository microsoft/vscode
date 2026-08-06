/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, IObservable } from '../../../../base/common/observable.js';
import { IChat, ISession } from './session.js';

/**
 * Returns the stable synthetic session id used by a detached chat grid slot.
 */
export function getDetachedChatSessionId(session: ISession, chat: IChat): string {
	return `${session.sessionId}::detached::${chat.resource.toString()}`;
}

/**
 * Presents one chat from another session as an independent, transient session.
 */
export class DetachedChatSession implements ISession {

	readonly sessionId: string;
	readonly chats: IObservable<readonly IChat[]>;
	readonly mainChat: IObservable<IChat>;

	constructor(
		readonly session: ISession,
		readonly chat: IChat,
	) {
		this.sessionId = getDetachedChatSessionId(session, chat);
		this.chats = derived(this, reader => {
			const currentChat = this.session.chats.read(reader).find(candidate => candidate.resource.toString() === this.chat.resource.toString());
			return currentChat ? [currentChat] : [];
		});
		this.mainChat = constObservable(chat);
	}

	get resource() { return this.session.resource; }
	get providerId() { return this.session.providerId; }
	get sessionType() { return this.session.sessionType; }
	get icon() { return this.session.icon; }
	get createdAt() { return this.session.createdAt; }
	get workspace() { return this.session.workspace; }
	get hasGitRepository() { return this.session.hasGitRepository; }
	get worktreePending() { return this.session.worktreePending; }
	get isQuickChat() { return this.session.isQuickChat; }
	get title() { return this.session.title; }
	get updatedAt() { return this.session.updatedAt; }
	get status() { return this.session.status; }
	get changesSummary() { return this.session.changesSummary; }
	get changes() { return this.session.changes; }
	get changesets() { return this.session.changesets; }
	get externalChanges() { return this.session.externalChanges; }
	get modelId() { return this.session.modelId; }
	get mode() { return this.session.mode; }
	get loading() { return this.session.loading; }
	get isArchived() { return this.session.isArchived; }
	get isRead() { return this.session.isRead; }
	get description() { return this.session.description; }
	get lastTurnEnd() { return this.session.lastTurnEnd; }
	get capabilities() { return this.session.capabilities; }
}

/** Returns whether a session is a transient detached chat view. */
export function isDetachedChatSession(session: ISession): session is DetachedChatSession {
	return session instanceof DetachedChatSession;
}
