/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import {
	autorun,
	IObservable,
	IReader,
	observableFromEvent,
	observableSignalFromEvent,
} from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionChangesService } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../../../../workbench/contrib/sessions/browser/emptyFileEditorInput.js';
import { ISessionWorkspace, isSessionCreated } from '../../../../../workbench/services/sessions/common/session.js';
import {
	DetailPanelTarget,
	DesktopDetailPanelCoordinator,
} from './desktopDetailPanelCoordinator.js';
import {
	FilesDetailsState,
	getFilesDetailsState,
	getLayoutWorkspace,
	isChangesEditorInput,
	isEditorWithoutDockedDetails,
	isMainPartEmpty,
	isQuickChatShown,
} from './desktopSharedHelpers.js';
import {
	IDesktopLayoutContext,
	DesktopLayoutStrategy,
} from './desktopLayoutStrategy.js';
import { SessionVisibilityProfile, DesktopVisibilityProfileStore } from './desktopVisibilityProfileStore.js';
import { IShownChat } from '../../../../../workbench/services/sessions/common/sessionPane.js';

/**
 * Owns workspace-backed and workspace-less draft layout behavior.
 */
export class DesktopDraftSessionStrategy extends DesktopLayoutStrategy {
	private _pendingEntryHideSessionKey: string | undefined;
	private _replacementDraftKey: string | undefined;
	private _pendingSidePaneOpenHideSessionKey: string | undefined;
	private _activeQuickChatKey: string | undefined;
	private _pendingEditorRestoreKey: string | undefined;
	private _changingVisibility = false;
	private _togglingQuickChatSidePane = false;
	private readonly _quickChatSidePaneVisibility = new ResourceMap<boolean>();

	constructor(
		ctx: IDesktopLayoutContext,
		private readonly _detailPanel: DesktopDetailPanelCoordinator,
		private readonly _visibilityStore: DesktopVisibilityProfileStore,
		@IAgentWorkbenchLayoutService
		private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService
		private readonly _editorGroupsService: IEditorGroupsService,
		@ISessionChangesService
		private readonly _sessionChangesService: ISessionChangesService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(ctx);

		this._registerQuickChatVisibility();
		this._registerEntryEditorHide();
		this._registerSidePaneOpenEditorHide();
		this._registerLastEditorClose();
		this._registerDetailPanel();
		this._registerOwnerComposition();
	}

	private _activeOwnerKey(): URI | undefined {
		if (!this._ctx.chatLayoutActive()) {
			return undefined;
		}
		const shown = this._ctx.shownByMainWindow();
		return shown && !isSessionCreated(shown.session) && !isQuickChatShown(shown)
			? this._ctx.ownerKeyFor(shown)
			: undefined;
	}

	private _readOwnerComposition(): { readonly editor: boolean; readonly auxiliaryBar: boolean } | undefined {
		const ownerKey = this._activeOwnerKey();
		return ownerKey ? this._ctx.compositionStore.get(ownerKey) : undefined;
	}

	private _applyOwnerComposition(state: { readonly editor: boolean; readonly auxiliaryBar: boolean }): void {
		this._detailPanel.resetTransientVisibility();
		const sidePaneVisible = this._layoutService.isSidePaneVisible();
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		this._changingVisibility = true;
		try {
			if (state.auxiliaryBar !== this._layoutService.isVisible(Parts.AUXILIARYBAR_PART) && (!state.auxiliaryBar || sidePaneVisible)) {
				this._layoutService.setPartHidden(!state.auxiliaryBar, Parts.AUXILIARYBAR_PART);
			}
			if (state.editor !== this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && (!state.editor || sidePaneVisible)) {
				this._layoutService.setPartHidden(!state.editor, Parts.EDITOR_PART);
			}
		} finally {
			this._changingVisibility = false;
			suppression.dispose();
		}
	}

	private _captureOwnerCompositionIfApplicable(): void {
		if (this._changingVisibility || this._ctx.isRestoringSessionLayout || this._ctx.chatLayoutSuspended()
			|| this._ctx.multipleChatsVisibleObs.get() || this._layoutService.isEditorMaximized()) {
			return;
		}
		const ownerKey = this._activeOwnerKey();
		if (!ownerKey) {
			return;
		}
		this._ctx.compositionStore.set(ownerKey, {
			editor: this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
			auxiliaryBar: this._detailPanel.intendedVisible,
		});
	}

	private _registerOwnerComposition(): void {
		this._register(
			this._layoutService.onDidChangePartVisibility((event) => {
				if ((event.partId !== Parts.EDITOR_PART && event.partId !== Parts.AUXILIARYBAR_PART) || event.source === 'resize') {
					return;
				}
				this._captureOwnerCompositionIfApplicable();
			}),
		);
		this._register(this._layoutService.onDidToggleSidePane(() => this._captureOwnerCompositionIfApplicable()));
	}

	// --- Editor visibility ---------------------------------------------------------------

	private _registerEntryEditorHide(): void {
		const editorSetChanged = observableSignalFromEvent(
			this,
			Event.any(
				this._editorService.onDidActiveEditorChange,
				this._editorService.onDidEditorsChange,
				this._editorService.onDidCloseEditor,
				this._ctx.onDidEndSessionLayoutRestore,
			),
		);
		let activeNewSessionKey: string | undefined;
		let previousDraftKey: string | undefined;

		this._register(
			this._editorService.onWillOpenEditor((event) => {
				if (!this._ctx.isRestoringSessionLayout && !this._layoutService.isEditorPartAutoVisibilitySuppressed()) {
					this._replacementDraftKey = undefined;
				}
				if (!this._getActiveNewSessionKey()) {
					return;
				}
				if (!(event.editor instanceof EmptyFileEditorInput)) {
					this._pendingEntryHideSessionKey = undefined;
				}
			}),
		);

		const applyPendingEntry = () => {
			const pendingSessionKey = this._pendingEntryHideSessionKey;
			if (!pendingSessionKey || this._ctx.isRestoringSessionLayout) {
				return;
			}
			if (this._getActiveNewSessionKey() !== pendingSessionKey) {
				this._pendingEntryHideSessionKey = undefined;
				return;
			}

			const storedComposition = this._readOwnerComposition();
			if (storedComposition) {
				this._pendingEntryHideSessionKey = undefined;
				this._applyOwnerComposition(storedComposition);
				return;
			}

			const editors = this._getMainPartEditors();
			if (editors.length === 0) {
				return;
			}
			if (!editors.every(editor => editor instanceof EmptyFileEditorInput || isChangesEditorInput(editor, this._sessionChangesService))) {
				return;
			}
			const hasEmptyFiles = editors.some(editor => editor instanceof EmptyFileEditorInput);
			this._pendingEntryHideSessionKey = undefined;
			if (this._replacementDraftKey === pendingSessionKey) {
				return;
			}

			if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				return;
			}

			const suppression =
				this._layoutService.suppressEditorPartAutoVisibility();
			try {
				if (hasEmptyFiles && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
					this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				}
				this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
			} finally {
				suppression.dispose();
			}
		};

		this._register(
			autorun((reader) => {
				editorSetChanged.read(reader);
				const session = this._ctx.mainWindowSession.read(reader);
				const draftKey = session && !isSessionCreated(session, reader) ? session.resource.toString() : undefined;
				if (draftKey !== previousDraftKey) {
					this._replacementDraftKey = previousDraftKey ? draftKey : undefined;
					previousDraftKey = draftKey;
					if (this._replacementDraftKey) {
						this._logService.trace(`[DesktopLayout] Preserving draft composition: session=${this._replacementDraftKey} editor=${this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)} details=${this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)}`);
					}
				}
				const sessionKey = this._readActiveNewSessionKey(reader);
				if (!sessionKey) {
					activeNewSessionKey = undefined;
					this._pendingEntryHideSessionKey = undefined;
					return;
				}

				if (activeNewSessionKey !== sessionKey) {
					activeNewSessionKey = sessionKey;
					this._pendingSidePaneOpenHideSessionKey = undefined;
					this._pendingEntryHideSessionKey = sessionKey;
				}
				applyPendingEntry();
			}),
		);
	}

	private _registerQuickChatVisibility(): void {
		let previousOwnerKey: string | undefined;
		let previousDraftKey: string | undefined;
		this._register(autorun(reader => {
			const shown = this._ctx.shownByMainWindow(reader);
			const activeSession = shown?.session;
			const ownerKey = shown && (this._ctx.ownerKeyFor(shown, reader) ?? shown.session.resource).toString();
			const ownerUnchanged = !!ownerKey && ownerKey === previousOwnerKey;
			previousOwnerKey = ownerKey;
			const draftKey = activeSession && !isSessionCreated(activeSession, reader) ? activeSession.resource.toString() : undefined;
			const isDraftWorkspaceSelection = !!draftKey && !!previousDraftKey && draftKey !== previousDraftKey;
			previousDraftKey = draftKey;
			if (!activeSession || !isQuickChatShown(shown, reader)) {
				this._activeQuickChatKey = undefined;
				this._pendingEditorRestoreKey = undefined;
				return;
			}

			const sessionKey = activeSession.resource.toString();
			const multipleSessionsVisible = this._ctx.multipleSessionsVisibleObs.read(reader);
			if (multipleSessionsVisible) {
				this._pendingEditorRestoreKey = undefined;
			}
			if (this._activeQuickChatKey !== sessionKey) {
				this._activeQuickChatKey = sessionKey;
				const hasSavedWorkingSet = this._ctx.hasSavedWorkingSet(activeSession.resource);
				const isRestoringSessionLayout = this._ctx.isRestoringSessionLayout;
				this._pendingEditorRestoreKey = undefined;
				if (!multipleSessionsVisible && !isDraftWorkspaceSelection) {
					this._enterQuickChat(sessionKey, ownerUnchanged, hasSavedWorkingSet, isRestoringSessionLayout);
				}
				this._detailPanel.sync(DetailPanelTarget.Files);
			}
		}));

		this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
			const activeSession = this._ctx.mainWindowSession.get();
			const sessionKey = activeSession?.resource.toString();
			if (!activeSession
				|| !isQuickChatShown(this._ctx.shownByMainWindow())
				|| this._ctx.multipleSessionsVisibleObs.get()) {
				return;
			}
			this._logService.trace(`[DesktopLayout] No workspace layout restore settled: session=${sessionKey} width=${this._layoutService.getSize(Parts.EDITOR_PART).width} editor=${this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)} details=${this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)}`);
			if (this._pendingEditorRestoreKey !== sessionKey) {
				return;
			}

			this._pendingEditorRestoreKey = undefined;
			if (isMainPartEmpty(this._editorGroupsService)) {
				this._hideQuickChatSidePaneTransiently();
				return;
			}

			this._applyQuickChatVisibility();
		}));

		this._register(this._layoutService.onDidChangePartVisibility(event => {
			if (event.partId !== Parts.EDITOR_PART && event.partId !== Parts.AUXILIARYBAR_PART) {
				return;
			}

			this._captureQuickChatSharedVisibility();
		}));
		this._register(this._layoutService.onWillToggleSidePane(() => this._togglingQuickChatSidePane = true));
		this._register(this._layoutService.onDidToggleSidePane(({ before, after }) => {
			try {
				const shown = this._ctx.shownByMainWindow();
				if (!isQuickChatShown(shown)
					|| this._ctx.chatLayoutSuspended()
					|| this._ctx.multipleSessionsVisibleObs.get()
					|| isMainPartEmpty(this._editorGroupsService)) {
					return;
				}
				const wasVisible = before.editor || before.auxiliaryBar;
				const isVisible = after.editor || after.auxiliaryBar;
				const ownerKey = shown && this._quickChatVisibilityOwnerKey(shown);
				if (ownerKey && wasVisible !== isVisible) {
					this._quickChatSidePaneVisibility.set(ownerKey, isVisible);
				}
				if (!wasVisible && isVisible) {
					this._applyQuickChatVisibility();
				}
			} finally {
				this._togglingQuickChatSidePane = false;
			}
		}));
		this._register(this._editorService.onDidEditorsChange(() => this._captureQuickChatSharedVisibility()));
	}

	/**
	 * Applies a Quick Chat's side-pane visibility when the main window starts showing it: at once when it replaces a chat of
	 * its own owner or has a saved working set, or once that restore settles.
	 */
	private _enterQuickChat(sessionKey: string, ownerUnchanged: boolean, hasSavedWorkingSet: boolean, isRestoringSessionLayout: boolean): void {
		if (ownerUnchanged) {
			if (this._getMainPartEditors().every(editor => editor instanceof EmptyFileEditorInput || isChangesEditorInput(editor, this._sessionChangesService))) {
				this._hideQuickChatSidePaneTransiently();
			} else {
				this._applyQuickChatVisibility();
			}
			return;
		}
		if (!isRestoringSessionLayout && !hasSavedWorkingSet && isMainPartEmpty(this._editorGroupsService)) {
			this._hideQuickChatSidePaneTransiently();
			return;
		}
		this._pendingEditorRestoreKey = sessionKey;
		if (hasSavedWorkingSet) {
			this._applyQuickChatVisibility();
		}
	}

	private _captureQuickChatSharedVisibility(): void {
		if (this._changingVisibility
			|| this._ctx.isRestoringSessionLayout
			|| this._togglingQuickChatSidePane
			|| this._ctx.multipleSessionsVisibleObs.get()
			|| this._layoutService.isEditorMaximized()
			|| this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)
			|| isMainPartEmpty(this._editorGroupsService)) {
			return;
		}

		const shown = this._ctx.shownByMainWindow();
		if (!shown || !isQuickChatShown(shown)) {
			return;
		}

		const editorVisible = this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
		const ownerKey = this._quickChatVisibilityOwnerKey(shown);
		if (ownerKey) {
			this._quickChatSidePaneVisibility.set(ownerKey, this._layoutService.isSidePaneVisible());
		}
		this._visibilityStore.set(SessionVisibilityProfile.Existing, {
			editorVisible,
			auxiliaryBarVisible: false,
		});
	}

	private _hideQuickChatSidePaneTransiently(): void {
		this._changingVisibility = true;
		try {
			this._layoutService.hideSidePane();
		} finally {
			this._changingVisibility = false;
		}
	}

	/**
	 * The key for a Quick Chat's own side-pane visibility, which only exists in the
	 * chat-specific layout mode.
	 */
	private _quickChatVisibilityOwnerKey(shown: IShownChat): URI | undefined {
		return isQuickChatShown(shown) && this._ctx.chatLayoutActive() && !this._ctx.sharedChatLayout ? this._ctx.ownerKeyFor(shown) : undefined;
	}

	/**
	 * In the chat-specific layout mode, applies the active Quick Chat's own last side-pane
	 * visibility, revealing a closed side pane for it. Otherwise, or when none has been recorded
	 * in this window, applies the shared Existing profile without revealing a closed side pane.
	 */
	private _applyQuickChatVisibility(): void {
		const shown = this._ctx.shownByMainWindow();
		const ownerKey = shown && this._quickChatVisibilityOwnerKey(shown);
		const ownVisibility = ownerKey ? this._quickChatSidePaneVisibility.get(ownerKey) : undefined;
		const sharedState = this._visibilityStore.get(SessionVisibilityProfile.Existing);
		const sidePaneVisible = ownVisibility ?? (sharedState.editorVisible || sharedState.auxiliaryBarVisible);
		const allowReveal = ownVisibility !== undefined || this._layoutService.isSidePaneVisible();
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		this._changingVisibility = true;
		try {
			if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			}
			if (sidePaneVisible !== this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && (!sidePaneVisible || allowReveal)) {
				this._layoutService.setPartHidden(!sidePaneVisible, Parts.EDITOR_PART);
			}
		} finally {
			this._changingVisibility = false;
			suppression.dispose();
		}
	}

	private _registerSidePaneOpenEditorHide(): void {
		const applyPendingSidePaneOpen = () => {
			const pendingSessionKey = this._pendingSidePaneOpenHideSessionKey;
			if (!pendingSessionKey || this._ctx.isRestoringSessionLayout) {
				return;
			}
			if (this._getActiveNewSessionKey() !== pendingSessionKey) {
				this._pendingSidePaneOpenHideSessionKey = undefined;
				return;
			}

			const editors = this._getMainPartEditors();
			if (editors.length === 0) {
				return;
			}
			this._pendingSidePaneOpenHideSessionKey = undefined;
			if (!editors.every(editor => editor instanceof EmptyFileEditorInput || isChangesEditorInput(editor, this._sessionChangesService))) {
				return;
			}

			const suppression =
				this._layoutService.suppressEditorPartAutoVisibility();
			try {
				if (!this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
					this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				}
				if (this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
					this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
				}
			} finally {
				suppression.dispose();
			}
		};

		this._register(
			this._editorService.onWillOpenEditor((event) => {
				if (!this._getActiveNewSessionKey()) {
					return;
				}
				if (!(event.editor instanceof EmptyFileEditorInput)) {
					this._pendingSidePaneOpenHideSessionKey = undefined;
				}
			}),
		);
		this._register(
			Event.any(
				this._editorService.onDidActiveEditorChange,
				this._editorService.onDidEditorsChange,
				this._editorService.onDidCloseEditor,
				this._ctx.onDidEndSessionLayoutRestore,
			)(applyPendingSidePaneOpen),
		);
		this._register(
			this._layoutService.onDidToggleSidePane(({ before, after }) => {
				const sessionKey = this._getActiveNewSessionKey();
				if (!sessionKey) {
					return;
				}
				const opened =
					!before.editor &&
					!before.auxiliaryBar &&
					(after.editor || after.auxiliaryBar);
				if (!opened) {
					this._pendingSidePaneOpenHideSessionKey = undefined;
					return;
				}

				this._pendingEntryHideSessionKey = undefined;
				this._pendingSidePaneOpenHideSessionKey = sessionKey;
				applyPendingSidePaneOpen();
			}),
		);
		this._register(
			autorun((reader) => {
				const activeSessionKey = this._readActiveNewSessionKey(reader);
				if (
					this._pendingSidePaneOpenHideSessionKey &&
					this._pendingSidePaneOpenHideSessionKey !== activeSessionKey
				) {
					this._pendingSidePaneOpenHideSessionKey = undefined;
				}
			}),
		);
	}

	private _registerLastEditorClose(): void {
		this._register(
			this._editorService.onDidCloseEditor(event => {
				if (!this._editorGroupsService.mainPart.getGroup(event.groupId)) {
					return;
				}
				const isQuickChat = isQuickChatShown(this._ctx.shownByMainWindow());
				if (
					(!this._getActiveNewSessionKey() && !isQuickChat) ||
					this._otherSessionShown() ||
					this._ctx.isRestoringSessionLayout ||
					this._layoutService.isEditorPartAutoVisibilitySuppressed() ||
					!isMainPartEmpty(this._editorGroupsService)
				) {
					return;
				}
				this._pendingEntryHideSessionKey = undefined;
				this._pendingSidePaneOpenHideSessionKey = undefined;
				this._layoutService.hideSidePane();
			}),
		);
	}

	private _getMainPartEditors(): EditorInput[] {
		return this._editorGroupsService.mainPart.groups.flatMap((group) => [
			...group.editors,
		]);
	}

	private _getActiveNewSessionKey(): string | undefined {
		const shown = this._ctx.shownByMainWindow();
		const session = shown?.session;
		if (
			!shown ||
			!session ||
			isSessionCreated(session) ||
			isQuickChatShown(shown) ||
			!getLayoutWorkspace(shown) ||
			this._multipleLayoutOwnersVisible()
		) {
			return undefined;
		}
		return this._ctx.ownerKeyFor(shown)?.toString();
	}

	private _readActiveNewSessionKey(reader: IReader): string | undefined {
		const shown = this._ctx.shownByMainWindow(reader);
		const session = shown?.session;
		if (
			!shown ||
			!session ||
			isSessionCreated(session, reader) ||
			isQuickChatShown(shown, reader) ||
			!getLayoutWorkspace(shown, reader) ||
			this._multipleLayoutOwnersVisible(reader)
		) {
			return undefined;
		}
		return this._ctx.ownerKeyFor(shown, reader)?.toString();
	}

	// --- Detail panel ----------------------------------------------------------------------

	private _registerDetailPanel(): void {
		const layoutRestored = observableSignalFromEvent(this, this._ctx.onDidEndSessionLayoutRestore);
		const activeEditorObs = observableFromEvent(
			this,
			this._editorService.onDidActiveEditorChange,
			() => this._editorService.activeEditor,
		);
		const editorPartVisibleObs = observableFromEvent(
			this,
			this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
		);
		const editorMaximizedObs = observableFromEvent(
			this,
			this._layoutService.onDidChangeEditorMaximized,
			() => this._layoutService.isEditorMaximized(),
		);
		const detailVisibleObs = observableFromEvent(
			this,
			this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.AUXILIARYBAR_PART),
		);
		let previousActiveEditor: EditorInput | undefined;
		let previousEditorPartVisible = false;
		let previousEditorSessionKey: string | undefined;

		this._register(
			autorun((reader) => {
				layoutRestored.read(reader);
				const shown = this._ctx.shownByMainWindow(reader);
				const activeSession = shown?.session;
				if (!shown || !activeSession) {
					previousActiveEditor = undefined;
					previousEditorPartVisible = false;
					previousEditorSessionKey = undefined;
					return;
				}
				const isQuickChat = isQuickChatShown(shown, reader);
				const workspace = isQuickChat ? undefined : getLayoutWorkspace(shown, reader);
				if (!workspace || isSessionCreated(activeSession, reader)) {
					previousActiveEditor = undefined;
					previousEditorPartVisible = false;
					previousEditorSessionKey = undefined;
					return;
				}

				const activeEditor = activeEditorObs.read(reader);
				const editorPartVisible = editorPartVisibleObs.read(reader);
				const sessionKey = this._ctx.ownerKeyFor(shown, reader)?.toString();
				const emptyFilesShown = activeEditor instanceof EmptyFileEditorInput
					&& editorPartVisible
					&& this._replacementDraftKey !== sessionKey
					&& !this._ctx.isRestoringSessionLayout
					&& (activeEditor !== previousActiveEditor || !previousEditorPartVisible || sessionKey !== previousEditorSessionKey);
				previousActiveEditor = activeEditor;
				previousEditorPartVisible = editorPartVisible;
				previousEditorSessionKey = sessionKey;
				const target = this._computeTarget(
					reader,
					activeEditor,
					editorMaximizedObs,
					editorPartVisible,
					workspace,
				);
				if (target === DetailPanelTarget.EditorHidden && activeEditor && isChangesEditorInput(activeEditor, this._sessionChangesService)) {
					detailVisibleObs.read(reader);
				}
				const revealOnly = this._multipleLayoutOwnersVisible(reader);
				this._syncDetailVisibility(target, revealOnly, emptyFilesShown);
				this._detailPanel.sync(target);
			}),
		);
	}

	private _syncDetailVisibility(
		target: DetailPanelTarget,
		revealOnly: boolean,
		emptyFilesShown: boolean,
	): void {
		const detailVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (emptyFilesShown && !detailVisible) {
			this._detailPanel.setHiddenTransiently(false);
			return;
		}
		if (
			this._ctx.isRestoringSessionLayout ||
			target === DetailPanelTarget.Preserve
		) {
			return;
		}

		if (
			target === DetailPanelTarget.Hidden ||
			target === DetailPanelTarget.EditorHidden ||
			target === DetailPanelTarget.FilesHidden
		) {
			const hiddenByEditor = target === DetailPanelTarget.EditorHidden || target === DetailPanelTarget.FilesHidden;
			if (
				(hiddenByEditor || !revealOnly) &&
				detailVisible
			) {
				this._detailPanel.setHiddenTransiently(true, hiddenByEditor);
			}
			return;
		}

		if (
			!this._detailPanel.hiddenTransiently ||
			(revealOnly && !this._detailPanel.hiddenByEditor) ||
			!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
		) {
			return;
		}
		this._detailPanel.setHiddenTransiently(false);
	}

	private _computeTarget(
		reader: IReader,
		activeEditor: EditorInput | undefined,
		editorMaximizedObs: IObservable<boolean>,
		editorPartVisible: boolean,
		workspace: ISessionWorkspace,
	): DetailPanelTarget {
		// A New Session's empty editor group is normal (the Files detail is owned by the
		// managed-tabs reconcile while its Files tab is (re)ensured), unlike an Existing
		// Session where an empty group means the whole side pane was closed — so, unlike
		// Existing, New never hides on an empty group.

		if (activeEditor && isEditorWithoutDockedDetails(activeEditor)) {
			return editorPartVisible ? DetailPanelTarget.EditorHidden : DetailPanelTarget.Files;
		}

		if (editorMaximizedObs.read(reader)) {
			return DetailPanelTarget.Changes;
		}

		if (!activeEditor) {
			return DetailPanelTarget.Files;
		}

		if (isChangesEditorInput(activeEditor, this._sessionChangesService)) {
			return editorPartVisible && !this._detailPanel.hasChangesDetails.read(reader)
				? DetailPanelTarget.EditorHidden
				: DetailPanelTarget.ChangesForced;
		}

		switch (getFilesDetailsState(activeEditor, workspace)) {
			case FilesDetailsState.Active:
				return DetailPanelTarget.FilesForced;
			case FilesDetailsState.Available:
				return editorPartVisible ? DetailPanelTarget.FilesHidden : DetailPanelTarget.Files;
		}

		return editorPartVisible ? DetailPanelTarget.EditorHidden : DetailPanelTarget.Files;
	}
}
