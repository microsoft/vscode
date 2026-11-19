/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';

export const EDITOR_AGENT_HOST_SESSIONS_STORAGE_KEY = 'chat.editorUsage.agentHostSessions';
export const AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY = 'agentSessions.telemetry.totalSessions';
export const AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY = 'agentSessions.telemetry.lastSessionCreated';
export const AGENTS_WINDOW_INVITATION_IMPRESSION_STORAGE_KEY = 'chat.agentsWindowBanner.lastShown';
const COPILOT_HARNESS_INTRODUCTION_LAST_SHOWN_SESSION_COUNT_STORAGE_KEY = 'chat.copilotHarnessIntroduction.lastShownSessionCount';

/** Suppresses invitations for recent creators, conservatively retaining suppression for legacy users with no creation date. */
export function isActiveAgentsWindowUser(storageService: IStorageService, now = Date.now()): boolean {
	if (storageService.getNumber(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, StorageScope.APPLICATION, 0) < 3) {
		return false;
	}
	const lastCreated = storageService.getNumber(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, StorageScope.APPLICATION);
	return lastCreated === undefined || now - lastCreated < 30 * 24 * 60 * 60 * 1000;
}

export interface IAgentHostEditorSession {
	readonly resource: UriComponents;
	readonly windowId: number;
	readonly inProgress: boolean;
	readonly needsInput: boolean;
}

export interface IAgentsWindowInvitationImpression {
	readonly timestamp: number;
	readonly editorSessionCount: number;
}

export interface IAgentsWindowInvitation {
	readonly id: string;
	readonly revision: number;
	readonly windowId: number;
	readonly resource: UriComponents;
	readonly developerMode: boolean;
	readonly shown: boolean;
}

export interface IAgentHostEditorState {
	readonly revision: number;
	readonly sessions: readonly IAgentHostEditorSession[];
	readonly editorSessionCount: number;
	readonly lastShown: IAgentsWindowInvitationImpression | undefined;
	/** Editor-created session ordinal at the most recent visible Copilot harness introduction. */
	readonly lastCopilotHarnessIntroductionSessionCount: number | undefined;
	readonly invitation: IAgentsWindowInvitation | undefined;
}

/** The harness introduction participates in session spacing, but not the invitation's time-based cooldown. */
export function hasAgentsWindowInvitationSessionCooldownElapsed(state: IAgentHostEditorState): boolean {
	return (state.lastShown === undefined || state.editorSessionCount - state.lastShown.editorSessionCount >= 5)
		&& (state.lastCopilotHarnessIntroductionSessionCount === undefined || state.editorSessionCount - state.lastCopilotHarnessIntroductionSessionCount >= 5);
}

export type AgentHostEditorUpdate =
	| { readonly kind: 'request'; readonly resource: UriComponents; readonly isNewSession: boolean }
	| { readonly kind: 'sessions'; readonly sessions: readonly Omit<IAgentHostEditorSession, 'windowId'>[] }
	| { readonly kind: 'commit'; readonly original: UriComponents; readonly committed: UriComponents }
	| { readonly kind: 'delete'; readonly resources: readonly UriComponents[] }
	| { readonly kind: 'copilotHarnessIntroductionShown' };

/** Main-process ownership makes claims and usage increments atomic across editor windows. */
export class AgentsWindowInvitationState extends Disposable {
	private readonly sessions = new ResourceMap<IAgentHostEditorSession>();
	private readonly developerPreviews = new Set<number>();
	private invitation: IAgentsWindowInvitation | undefined;
	private revision = 0;
	private readonly _onDidChange = this._register(new Emitter<IAgentHostEditorState>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly now: () => number,
		private readonly storageService: IStorageService,
	) {
		super();
	}

	initialize(legacyEditorSessionCount: number): IAgentHostEditorState {
		if (this.storageService.getNumber(EDITOR_AGENT_HOST_SESSIONS_STORAGE_KEY, StorageScope.APPLICATION) === undefined) {
			this.storageService.store(EDITOR_AGENT_HOST_SESSIONS_STORAGE_KEY, legacyEditorSessionCount, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		return this.getState();
	}

	getState(): IAgentHostEditorState {
		return {
			revision: this.revision,
			sessions: [...this.sessions.values()],
			editorSessionCount: this.storageService.getNumber(EDITOR_AGENT_HOST_SESSIONS_STORAGE_KEY, StorageScope.APPLICATION, 0),
			lastShown: this.storageService.getObject<IAgentsWindowInvitationImpression>(AGENTS_WINDOW_INVITATION_IMPRESSION_STORAGE_KEY, StorageScope.APPLICATION),
			lastCopilotHarnessIntroductionSessionCount: this.storageService.getNumber(COPILOT_HARNESS_INTRODUCTION_LAST_SHOWN_SESSION_COUNT_STORAGE_KEY, StorageScope.APPLICATION),
			invitation: this.invitation,
		};
	}

	update(windowId: number, update: AgentHostEditorUpdate): void;
	/** An Agents Window request revokes editor ownership without contributing editor usage. */
	update(windowId: undefined, update: Extract<AgentHostEditorUpdate, { kind: 'request' }>): void;
	update(windowId: number | undefined, update: AgentHostEditorUpdate): void {
		switch (update.kind) {
			case 'request': {
				const resource = URI.revive(update.resource);
				if (windowId === undefined) {
					if (this.sessions.delete(resource)) {
						this.fireChange();
					}
					break;
				}
				if (update.isNewSession && !this.sessions.has(resource)) {
					this.storageService.store(EDITOR_AGENT_HOST_SESSIONS_STORAGE_KEY, this.getState().editorSessionCount + 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
				}
				this.sessions.set(resource, { resource: update.resource, windowId, inProgress: false, needsInput: false });
				this.fireChange();
				break;
			}
			case 'sessions': {
				let changed = false;
				for (const session of update.sessions) {
					const resource = URI.revive(session.resource);
					const previous = this.sessions.get(resource);
					if (previous && windowId !== undefined && previous.windowId === windowId && (previous.inProgress !== session.inProgress || previous.needsInput !== session.needsInput)) {
						this.sessions.set(resource, { ...session, windowId });
						changed = true;
					}
				}
				if (changed) {
					this.fireChange();
				}
				break;
			}
			case 'commit': {
				const original = URI.revive(update.original);
				const committed = URI.revive(update.committed);
				const session = this.sessions.get(original);
				if (session && windowId !== undefined && session.windowId === windowId && !isEqual(original, committed)) {
					this.sessions.delete(original);
					if (!this.sessions.has(committed)) {
						this.sessions.set(committed, { ...session, resource: update.committed });
					}
					if (this.invitation && isEqual(URI.revive(this.invitation.resource), original)) {
						this.invitation = undefined;
					}
					this.fireChange();
				}
				break;
			}
			case 'delete': {
				for (const resource of update.resources) {
					this.sessions.delete(URI.revive(resource));
					if (this.invitation && isEqual(URI.revive(this.invitation.resource), URI.revive(resource))) {
						this.invitation = undefined;
					}
				}
				this.fireChange();
				break;
			}
			case 'copilotHarnessIntroductionShown': {
				this.storageService.store(COPILOT_HARNESS_INTRODUCTION_LAST_SHOWN_SESSION_COUNT_STORAGE_KEY, this.getState().editorSessionCount, StorageScope.APPLICATION, StorageTarget.MACHINE);
				if (this.invitation && !this.invitation.developerMode) {
					this.invitation = undefined;
				}
				this.fireChange();
				break;
			}
		}
	}

	claim(windowId: number, resource: URI, developerMode: boolean): IAgentsWindowInvitation | undefined {
		const session = this.sessions.get(resource);
		if (this.invitation || session?.windowId !== windowId || !session.inProgress || session.needsInput) {
			return undefined;
		}
		if (developerMode) {
			if (this.developerPreviews.has(windowId)) {
				return undefined;
			}
		} else {
			const state = this.getState();
			if (isActiveAgentsWindowUser(this.storageService, this.now())
				|| !hasAgentsWindowInvitationSessionCooldownElapsed(state)
				|| state.lastShown && this.now() - state.lastShown.timestamp < 24 * 60 * 60 * 1000) {
				return undefined;
			}
		}
		this.invitation = { id: generateUuid(), revision: this.revision + 1, windowId, resource: resource.toJSON(), developerMode, shown: false };
		this.fireChange();
		return this.invitation;
	}

	markShown(windowId: number, id: string): void {
		if (this.invitation?.windowId !== windowId || this.invitation.id !== id || this.invitation.shown) {
			return;
		}
		this.invitation = { ...this.invitation, shown: true };
		if (this.invitation.developerMode) {
			this.developerPreviews.add(windowId);
		} else {
			const impression: IAgentsWindowInvitationImpression = { timestamp: this.now(), editorSessionCount: this.getState().editorSessionCount };
			this.storageService.store(AGENTS_WINDOW_INVITATION_IMPRESSION_STORAGE_KEY, impression, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		this.fireChange();
	}

	release(windowId: number, id: string): void {
		if (this.invitation?.windowId === windowId && this.invitation.id === id) {
			this.invitation = undefined;
			this.fireChange();
		}
	}

	resetWindow(windowId: number, retainActivity: boolean): void {
		if (!retainActivity) {
			for (const [resource, session] of this.sessions) {
				if (session.windowId === windowId) {
					this.sessions.delete(resource);
				}
			}
		}
		this.developerPreviews.delete(windowId);
		if (this.invitation?.windowId === windowId) {
			this.invitation = undefined;
		}
		this.fireChange();
	}

	private fireChange(): void {
		this.revision++;
		this._onDidChange.fire(this.getState());
	}
}

export function getAgentHostEditorActivity(state: IAgentHostEditorState, windowId: number, resource: URI): { readonly sameWindow: number; readonly acrossWindows: boolean } | undefined {
	const running = state.sessions.filter(session => session.inProgress && !session.needsInput);
	if (!running.some(session => session.windowId === windowId && isEqual(URI.revive(session.resource), resource))) {
		return undefined;
	}
	return {
		sameWindow: running.filter(session => session.windowId === windowId).length,
		acrossWindows: running.some(session => session.windowId !== windowId),
	};
}
