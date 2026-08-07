/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { StorageScope, StorageTarget, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

interface ISidePaneVisibilityState {
	readonly editorVisible: boolean;
	readonly auxiliaryBarVisible: boolean;
}

interface ISidePaneVisibilityProfiles {
	readonly newSession: ISidePaneVisibilityState;
	readonly existingSession: ISidePaneVisibilityState;
}

const enum SessionVisibilityProfile {
	New,
	Existing,
}

const enum PendingAuxiliaryBarRestore {
	WaitingForEmptyGroup,
	WaitingForContent,
}

const SINGLE_PANE_VISIBILITY_STATE_KEY = 'sessions.singlePane.sidePaneVisibility';
const DEFAULT_NEW_SESSION_VISIBILITY_STATE: ISidePaneVisibilityState = {
	editorVisible: false,
	auxiliaryBarVisible: true,
};
const DEFAULT_EXISTING_SESSION_VISIBILITY_STATE: ISidePaneVisibilityState = {
	editorVisible: true,
	auxiliaryBarVisible: false,
};

/**
 * Keeps separate shared editor/detail compositions for new and existing sessions.
 * Quick chats temporarily suppress the pane while a single session is visible.
 */
export class SinglePaneSidePaneVisibilityStrategy extends SinglePaneLayoutStrategy {

	private _profiles: ISidePaneVisibilityProfiles = {
		newSession: DEFAULT_NEW_SESSION_VISIBILITY_STATE,
		existingSession: DEFAULT_EXISTING_SESSION_VISIBILITY_STATE,
	};
	private _pendingAuxiliaryBarRestore: PendingAuxiliaryBarRestore | undefined;
	private _applyingProfile = false;

	constructor(
		ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super(ctx);

		this._loadState();

		const mainPartEmptyObs = observableFromEvent(this,
			Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange, this._editorService.onDidCloseEditor),
			() => this._isMainPartEmpty());

		let activeProfile: SessionVisibilityProfile | undefined;
		let quickChatActive = false;
		let initialized = false;
		let multipleSessionsWereVisible = false;
		let previousIsCreated: boolean | undefined;
		let previousSession: IActiveSession | undefined;
		this._register(autorun(reader => {
			const multipleSessionsVisible = this._ctx.multipleSessionsVisibleObs.read(reader);
			if (multipleSessionsVisible) {
				this._pendingAuxiliaryBarRestore = undefined;
				multipleSessionsWereVisible = true;
				const activeSession = this._sessionsService.activeSession.read(reader);
				const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
				const workspace = activeSession?.workspace.read(reader);
				if (activeSession && !isQuickChat && workspace) {
					const profile = activeSession.isCreated.read(reader)
						? SessionVisibilityProfile.Existing
						: SessionVisibilityProfile.New;
					this._ctx.withSessionLayoutRestore(() => this._revealState(this._getProfile(profile)));
				}
				return;
			}

			const restoreAfterMultipleSessions = multipleSessionsWereVisible;
			multipleSessionsWereVisible = false;
			const activeSession = this._sessionsService.activeSession.read(reader);
			if (!activeSession) {
				return;
			}

			const isQuickChat = activeSession.isQuickChat?.read(reader) ?? false;
			const mainPartEmpty = mainPartEmptyObs.read(reader);
			if (isQuickChat) {
				const enteringQuickChat = !quickChatActive;
				const previousProfile = activeProfile;
				const switchingFromWorkspaceSession = enteringQuickChat && previousProfile !== undefined;
				this._pendingAuxiliaryBarRestore = undefined;
				quickChatActive = true;
				initialized = true;
				this._ctx.withSessionLayoutRestore(() => this._hideForQuickChat(switchingFromWorkspaceSession || mainPartEmpty));
				return;
			}

			const isCreated = activeSession.isCreated.read(reader);
			const sessionChanged = previousSession !== undefined && !isEqual(previousSession.resource, activeSession.resource);
			const nextProfile = isCreated
				? SessionVisibilityProfile.Existing
				: SessionVisibilityProfile.New;
			const isSubmit = !quickChatActive && previousIsCreated === false && isCreated
				&& (previousSession === activeSession || previousSession?.isCreated.read(undefined) === true);
			if (isSubmit) {
				this._captureProfile(SessionVisibilityProfile.New);
				this._captureProfile(SessionVisibilityProfile.Existing);
			}
			if (!isSubmit && (!initialized || restoreAfterMultipleSessions || quickChatActive || activeProfile !== nextProfile || sessionChanged)) {
				const profile = this._getProfile(nextProfile);
				this._pendingAuxiliaryBarRestore = profile.auxiliaryBarVisible
					? (mainPartEmpty ? PendingAuxiliaryBarRestore.WaitingForContent : PendingAuxiliaryBarRestore.WaitingForEmptyGroup)
					: undefined;
				this._applyingProfile = true;
				try {
					this._ctx.withSessionLayoutRestore(() => this._applyState(profile));
				} finally {
					this._applyingProfile = false;
				}
			} else if (this._pendingAuxiliaryBarRestore === PendingAuxiliaryBarRestore.WaitingForEmptyGroup && mainPartEmpty) {
				this._pendingAuxiliaryBarRestore = PendingAuxiliaryBarRestore.WaitingForContent;
			} else if (this._pendingAuxiliaryBarRestore === PendingAuxiliaryBarRestore.WaitingForContent && !mainPartEmpty) {
				this._pendingAuxiliaryBarRestore = undefined;
				this._ctx.withSessionLayoutRestore(() => this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART));
			}
			previousIsCreated = isCreated;
			previousSession = activeSession;
			activeProfile = nextProfile;
			quickChatActive = false;
			initialized = true;
		}));

		this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
			if (this._applyingProfile || this._pendingAuxiliaryBarRestore !== PendingAuxiliaryBarRestore.WaitingForEmptyGroup) {
				return;
			}
			if (this._ctx.multipleSessionsVisibleObs.get()) {
				this._pendingAuxiliaryBarRestore = undefined;
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (!activeSession || activeSession.isQuickChat?.get()) {
				this._pendingAuxiliaryBarRestore = undefined;
				return;
			}
			this._pendingAuxiliaryBarRestore = undefined;
			const profile = activeSession.isCreated.get() ? SessionVisibilityProfile.Existing : SessionVisibilityProfile.New;
			if (this._getProfile(profile).auxiliaryBarVisible) {
				this._applyState(this._getProfile(profile));
			}
		}));

		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.EDITOR_PART && e.partId !== Parts.AUXILIARYBAR_PART) {
				return;
			}
			if (this._ctx.isRestoringSessionLayout) {
				return;
			}
			if (this._ctx.multipleSessionsVisibleObs.get()) {
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (!activeSession || activeSession.isQuickChat?.get() || this._layoutService.isEditorMaximized()
				|| this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)) {
				return;
			}
			if (e.partId === Parts.AUXILIARYBAR_PART && !e.visible && this._editorService.activeEditor instanceof BrowserEditorInput) {
				return;
			}
			if (e.partId === Parts.AUXILIARYBAR_PART && !e.visible && this._pendingAuxiliaryBarRestore !== undefined) {
				return;
			}
			const profile = activeSession.isCreated.get()
				? SessionVisibilityProfile.Existing
				: SessionVisibilityProfile.New;
			this._captureProfile(profile);
		}));
	}

	private _captureProfile(profile: SessionVisibilityProfile): void {
		const state = {
			editorVisible: this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
			auxiliaryBarVisible: this._layoutService.isVisible(Parts.AUXILIARYBAR_PART),
		};
		this._setProfile(profile, state);
	}

	private _getProfile(profile: SessionVisibilityProfile): ISidePaneVisibilityState {
		return profile === SessionVisibilityProfile.New
			? this._profiles.newSession
			: this._profiles.existingSession;
	}

	private _setProfile(profile: SessionVisibilityProfile, state: ISidePaneVisibilityState): void {
		this._profiles = profile === SessionVisibilityProfile.New
			? { ...this._profiles, newSession: state }
			: { ...this._profiles, existingSession: state };
		this._storageService.store(SINGLE_PANE_VISIBILITY_STATE_KEY, JSON.stringify(this._profiles), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _hideForQuickChat(hideEditor: boolean): void {
		if (hideEditor && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
		}
		if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}

	private _applyState(state: ISidePaneVisibilityState): void {
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			if (!state.editorVisible && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
			}
			if (!state.auxiliaryBarVisible && this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			}
			if (state.auxiliaryBarVisible && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
			if (state.editorVisible && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
		} finally {
			suppression.dispose();
		}
	}

	private _revealState(state: ISidePaneVisibilityState): void {
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			if (state.auxiliaryBarVisible && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
			if (state.editorVisible && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
		} finally {
			suppression.dispose();
		}
	}

	private _isMainPartEmpty(): boolean {
		return this._editorGroupsService.mainPart.groups.every(group => group.isEmpty);
	}

	private _loadState(): void {
		const raw = this._storageService.get(SINGLE_PANE_VISIBILITY_STATE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			if (this._isVisibilityState(parsed?.newSession) && this._isVisibilityState(parsed?.existingSession)) {
				this._profiles = {
					newSession: parsed.newSession,
					existingSession: parsed.existingSession,
				};
			} else if (this._isVisibilityState(parsed)) {
				this._profiles = { ...this._profiles, existingSession: parsed };
			} else {
				this._storageService.remove(SINGLE_PANE_VISIBILITY_STATE_KEY, StorageScope.WORKSPACE);
			}
		} catch {
			this._storageService.remove(SINGLE_PANE_VISIBILITY_STATE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _isVisibilityState(value: { editorVisible?: unknown; auxiliaryBarVisible?: unknown } | undefined): value is ISidePaneVisibilityState {
		return typeof value?.editorVisible === 'boolean' && typeof value.auxiliaryBarVisible === 'boolean';
	}
}
