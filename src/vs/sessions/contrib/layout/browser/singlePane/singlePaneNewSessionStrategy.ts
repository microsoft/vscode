/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import {
	autorun,
	IObservable,
	IReader,
	observableFromEvent,
	observableSignalFromEvent,
} from '../../../../../base/common/observable.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import {
	IEditorGroup,
	IEditorGroupsService,
} from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import {
	DetailPanelTarget,
	SinglePaneDetailPanelCoordinator,
} from './singlePaneDetailPanelCoordinator.js';
import {
	isChangesEditorInput,
	isFileEditorInput,
	isMainPartEmpty,
} from './singlePaneSharedHelpers.js';
import {
	ISinglePaneLayoutContext,
	SinglePaneLayoutStrategy,
} from './singlePaneLayoutStrategy.js';

/**
 * Owns the independent entry, side-pane-toggle, close-fallback, and detail transitions for New Sessions.
 */
export class SinglePaneNewSessionStrategy extends SinglePaneLayoutStrategy {
	private _pendingEntryHideSessionKey: string | undefined;
	private _pendingSidePaneOpenHideSessionKey: string | undefined;
	private _detailHiddenTransiently = false;

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _detailPanel: SinglePaneDetailPanelCoordinator,
		@IAgentWorkbenchLayoutService
		private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService
		private readonly _editorGroupsService: IEditorGroupsService,
		@ISessionChangesService
		private readonly _sessionChangesService: ISessionChangesService,
		@IInstantiationService
		private readonly _instantiationService: IInstantiationService,
	) {
		super(ctx);

		this._registerEntryEditorHide();
		this._registerSidePaneOpenEditorHide();
		this._registerEmptyFilesCloseFallback();
		this._registerDetailPanel();
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

		this._register(
			this._editorService.onWillOpenEditor((event) => {
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

			const editors = this._getMainPartEditors();
			if (editors.length === 0) {
				return;
			}
			if (!editors.every((editor) => editor instanceof EmptyFileEditorInput)) {
				return;
			}

			this._pendingEntryHideSessionKey = undefined;
			if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				return;
			}

			const suppression =
				this._layoutService.suppressEditorPartAutoVisibility();
			try {
				this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
			} finally {
				suppression.dispose();
			}
		};

		this._register(
			autorun((reader) => {
				editorSetChanged.read(reader);
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
			if (
				editors.length !== 1 ||
				!(editors[0] instanceof EmptyFileEditorInput)
			) {
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

	private _registerEmptyFilesCloseFallback(): void {
		this._register(
			this._editorService.onDidCloseEditor((event) => {
				const sessionKey = this._getActiveNewSessionKey();
				if (
					!sessionKey ||
					this._ctx.multipleSessionsVisibleObs.get() ||
					this._ctx.isRestoringSessionLayout ||
					this._layoutService.isEditorPartAutoVisibilitySuppressed() ||
					!isMainPartEmpty(this._editorGroupsService)
				) {
					return;
				}
				this._pendingEntryHideSessionKey = undefined;
				this._pendingSidePaneOpenHideSessionKey = undefined;
				if (event.editor instanceof EmptyFileEditorInput) {
					this._hideSidePane();
					return;
				}
				const group = this._editorGroupsService.mainPart.getGroup(
					event.groupId,
				);
				if (!group) {
					return;
				}
				const suppression =
					this._layoutService.suppressEditorPartAutoVisibility();
				void this._openEmptyFiles(
					group,
					sessionKey,
					this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
				)
					.finally(() => suppression.dispose())
					.catch(onUnexpectedError);
			}),
		);
	}

	private _hideSidePane(): void {
		this._layoutService.hideSidePane();
	}

	private async _openEmptyFiles(
		group: IEditorGroup,
		sessionKey: string,
		editorVisible: boolean,
	): Promise<void> {
		const session = this._sessionsService.activeSession.get();
		const workspace = session?.workspace.get();
		if (
			!session ||
			this._getActiveNewSessionKey() !== sessionKey ||
			!workspace ||
			!isMainPartEmpty(this._editorGroupsService)
		) {
			return;
		}
		await this._editorService.openEditor(
			this._instantiationService.createInstance(
				EmptyFileEditorInput,
				workspace,
			),
			{
				pinned: true,
				inactive: true,
				preserveFocus: true,
				activation: EditorActivation.PRESERVE,
				isExplicit: false,
			},
			group,
		);
		if (this._getActiveNewSessionKey() !== sessionKey) {
			return;
		}
		if (
			this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) !==
			editorVisible
		) {
			this._layoutService.setPartHidden(!editorVisible, Parts.EDITOR_PART);
		}
		if (!this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}
		this._detailPanel.sync(DetailPanelTarget.FilesForced);
	}

	private _getMainPartEditors(): EditorInput[] {
		return this._editorGroupsService.mainPart.groups.flatMap((group) => [
			...group.editors,
		]);
	}

	private _getActiveNewSessionKey(): string | undefined {
		const session = this._sessionsService.activeSession.get();
		if (
			!session ||
			session.isCreated.get() ||
			session.isQuickChat?.get() ||
			!session.workspace.get() ||
			this._ctx.multipleSessionsVisibleObs.get()
		) {
			return undefined;
		}
		return session.resource.toString();
	}

	private _readActiveNewSessionKey(reader: IReader): string | undefined {
		const session = this._sessionsService.activeSession.read(reader);
		if (
			!session ||
			session.isCreated.read(reader) ||
			(session.isQuickChat?.read(reader) ?? false) ||
			!session.workspace.read(reader) ||
			this._ctx.multipleSessionsVisibleObs.read(reader)
		) {
			return undefined;
		}
		return session.resource.toString();
	}

	// --- Detail panel ----------------------------------------------------------------------

	private _registerDetailPanel(): void {
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

		this._register(
			autorun((reader) => {
				const activeSession = this._sessionsService.activeSession.read(reader);
				if (!activeSession) {
					return;
				}
				const isQuickChat = activeSession.isQuickChat?.read(reader) ?? false;
				const workspace = activeSession.workspace.read(reader);
				if (isQuickChat || !workspace || activeSession.isCreated.read(reader)) {
					return;
				}

				const activeEditor = activeEditorObs.read(reader);
				const target = this._computeTarget(
					reader,
					activeEditor,
					editorMaximizedObs,
					editorPartVisibleObs,
				);
				const revealOnly = this._ctx.multipleSessionsVisibleObs.read(reader);
				this._syncDetailVisibility(target, revealOnly);
				this._detailPanel.sync(target);
			}),
		);
		this._register(
			this._layoutService.onDidChangePartVisibility((event) => {
				if (
					event.partId === Parts.AUXILIARYBAR_PART &&
					event.source !== 'resize'
				) {
					this._detailHiddenTransiently = false;
				}
			}),
		);
	}

	private _syncDetailVisibility(
		target: DetailPanelTarget,
		revealOnly: boolean,
	): void {
		if (
			this._ctx.isRestoringSessionLayout ||
			target === DetailPanelTarget.Preserve
		) {
			return;
		}

		const detailVisible = this._layoutService.isVisible(
			Parts.AUXILIARYBAR_PART,
		);
		if (
			target === DetailPanelTarget.Hidden ||
			target === DetailPanelTarget.BrowserHidden
		) {
			if (!revealOnly && detailVisible) {
				this._detailHiddenTransiently = true;
				this._layoutService.setAuxiliaryBarHiddenForResize(true);
			}
			return;
		}

		if (
			!this._detailHiddenTransiently ||
			revealOnly ||
			!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
		) {
			return;
		}
		this._detailHiddenTransiently = false;
		this._layoutService.setAuxiliaryBarHiddenForResize(false);
	}

	private _computeTarget(
		reader: IReader,
		activeEditor: EditorInput | undefined,
		editorMaximizedObs: IObservable<boolean>,
		editorPartVisibleObs: IObservable<boolean>,
	): DetailPanelTarget {
		// A New Session's empty editor group is normal (the Files detail is owned by the
		// managed-tabs reconcile while its Files tab is (re)ensured), unlike an Existing
		// Session where an empty group means the whole side pane was closed — so, unlike
		// Existing, New never hides on an empty group.

		if (editorMaximizedObs.read(reader)) {
			return DetailPanelTarget.Changes;
		}

		if (!activeEditor) {
			return DetailPanelTarget.Files;
		}

		if (activeEditor instanceof BrowserEditorInput) {
			// Browser has no detail of its own, so it only hides the panel while the editor
			// area is visible; once hidden, fall back to Files instead of leaving it blank.
			if (editorPartVisibleObs.read(reader)) {
				return DetailPanelTarget.BrowserHidden;
			}
			return DetailPanelTarget.Files;
		}

		if (isChangesEditorInput(activeEditor, this._sessionChangesService)) {
			return DetailPanelTarget.ChangesForced;
		}

		if (isFileEditorInput(activeEditor)) {
			return DetailPanelTarget.FilesForced;
		}

		return DetailPanelTarget.Preserve;
	}
}
