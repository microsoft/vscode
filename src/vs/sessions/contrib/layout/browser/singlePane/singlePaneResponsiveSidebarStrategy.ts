/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { DiffEditorInput } from '../../../../../workbench/common/editor/diffEditorInput.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { HasDockedDetailsContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/** Command that toggles the single-pane detail panel (auxiliary bar) from the editor title bar. */
export const TOGGLE_DETAILS_COMMAND_ID = 'workbench.action.agentSessions.toggleDetails';
// Toggle Details is conditional (hidden for tab types with no detail, e.g. browser
// and search). It keeps its trailing position after the always-present
// maximize/restore and hide chevron.
const singlePaneLayoutToggleDetailsOrder = 30;

/** Below this main-container width the sessions list is auto-hidden to free room for the side pane; wider windows have room to keep it open. */
const SMALL_WINDOW_MAX_WIDTH = 1800;

/** Whether `editor` is real file/diff content that needs editor-area room (vs. a managed tab like the Changes multi-diff or empty Files placeholder). */
function isRealEditorContent(editor: EditorInput): boolean {
	if (editor instanceof FileEditorInput || editor instanceof BrowserEditorInput) {
		return true;
	}
	if (editor instanceof DiffEditorInput) {
		return editor.original instanceof FileEditorInput || editor.modified instanceof FileEditorInput;
	}
	return false;
}

/**
 * [D7 single-pane] Auto-hide the sessions list when the user needs more room for
 * the side pane: opening the details pane via the Toggle Details action, or
 * opening a real file/diff into the editor area (Scenario 8). The auto-hide only
 * applies on a **small window** (`<= {@link SMALL_WINDOW_MAX_WIDTH}`) — a wider
 * window has room to keep the sessions list open. The list is restored when
 * details is explicitly closed, the side pane is fully hidden, or the window
 * grows past the threshold. It never reacts to automatic details opens (submit,
 * session restore). Also owns the Toggle Details action itself.
 */
export class SinglePaneResponsiveSidebarStrategy extends SinglePaneLayoutStrategy {

	/** `true` while the sessions list is hidden because this strategy auto-hid it; only such hides are auto-reverted. */
	private _sidebarAutoHidden = false;
	/** Guards the manual-toggle listener while this strategy itself toggles the sidebar. */
	private _applyingAutoSidebar = false;

	constructor(
		ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super(ctx);

		// The Toggle Details action toggles the detail panel and, as part of the
		// same gesture, auto-hides / restores the sessions list. It is a dedicated
		// command owned by this strategy rather than a listener on the core aux-bar
		// toggle command.
		this._register(this._registerToggleDetailsAction());

		// [Scenario 8] Opening a real file/browser editor or a single-file diff
		// from the Files or Changes view needs editor-area room, so auto-hide the
		// sessions list — but only on a small window, in an existing (created)
		// session, and only when the editor area is currently closed (this open
		// will reveal it). Managed tabs (the Changes multi-diff and the empty
		// Files placeholder) are not real content so they never trigger this; a
		// session-switch restore is excluded too.
		this._register(this._editorService.onWillOpenEditor(e => {
			if (this._ctx.isRestoringSessionLayout || this._ctx.multipleSessionsVisibleObs.get() || this._layoutService.isEditorMaximized()) {
				return;
			}
			if (!this._isSmallWindow()) {
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (!activeSession?.isCreated.get() || this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				return;
			}
			if (!isRealEditorContent(e.editor)) {
				return;
			}
			if (this._setSidebarAutoHidden(true)) {
				this._sidebarAutoHidden = true;
			}
		}));

		// A manual sessions-sidebar toggle hands control back to the user.
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.SIDEBAR_PART || this._applyingAutoSidebar) {
				return;
			}
			this._sidebarAutoHidden = false;
		}));

		// Restore an auto-collapsed sessions list once the space constraint that
		// justified it is gone — either the side pane is fully hidden (nothing to
		// make room for) or the window grew past the threshold. `observableFromEvent`
		// dedupes on the computed value, so hiding the sidebar itself (a different
		// part) never re-triggers this, and the pre-reveal auto-hide from opening an
		// editor is not undone.
		const sidePaneVisibleObs = observableFromEvent(this,
			this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || this._layoutService.isVisible(Parts.AUXILIARYBAR_PART));
		const smallWindowObs = observableFromEvent(this,
			this._layoutService.onDidLayoutMainContainer,
			() => this._isSmallWindow());
		this._register(autorun(reader => {
			const sidePaneVisible = sidePaneVisibleObs.read(reader);
			const smallWindow = smallWindowObs.read(reader);
			if (!this._sidebarAutoHidden || (sidePaneVisible && smallWindow)) {
				return;
			}
			this._setSidebarAutoHidden(false);
			this._sidebarAutoHidden = false;
		}));
	}

	/**
	 * Toggle the detail panel (auxiliary bar) and, in the same gesture, auto-hide
	 * the sessions list to free room when opening it on a small window (restoring
	 * the list when closing). Returns whether the detail panel is now visible.
	 */
	toggleDetails(): boolean {
		const nowVisible = !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._layoutService.setPartHidden(!nowVisible, Parts.AUXILIARYBAR_PART);

		if (!this._ctx.multipleSessionsVisibleObs.get()) {
			if (nowVisible) {
				if (this._isSmallWindow() && this._setSidebarAutoHidden(true)) {
					this._sidebarAutoHidden = true;
				}
			} else if (this._sidebarAutoHidden) {
				this._setSidebarAutoHidden(false);
				this._sidebarAutoHidden = false;
			}
		}
		return nowVisible;
	}

	/** Whether the window is narrow enough that the side pane needs the sessions list's room. */
	private _isSmallWindow(): boolean {
		return this._layoutService.mainContainerDimension.width <= SMALL_WINDOW_MAX_WIDTH;
	}

	private _setSidebarAutoHidden(hidden: boolean): boolean {
		if (this._layoutService.isVisible(Parts.SIDEBAR_PART) === !hidden) {
			return false;
		}
		this._applyingAutoSidebar = true;
		try {
			this._layoutService.setPartHidden(hidden, Parts.SIDEBAR_PART);
		} finally {
			this._applyingAutoSidebar = false;
		}
		return true;
	}

	private _registerToggleDetailsAction(): IDisposable {
		const that = this;
		return registerAction2(class extends Action2 {
			constructor() {
				super({
					id: TOGGLE_DETAILS_COMMAND_ID,
					title: localize2('toggleDetails', "Toggle Details"),
					icon: Codicon.listSelection,
					f1: false,
					toggled: AuxiliaryBarVisibleContext,
					keybinding: {
						weight: KeybindingWeight.SessionsContrib,
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL,
						when: ContextKeyExpr.and(
							IsSessionsWindowContext,
							IsAuxiliaryWindowContext.toNegated(),
							SinglePaneLayoutEnabledContext)
					},
					menu: {
						id: MenuId.EditorTitleLayout,
						group: 'navigation',
						order: singlePaneLayoutToggleDetailsOrder,
						// Not every tab type has a detail panel to show/hide (e.g. browser
						// and search tabs), so only surface the toggle for tab types that do.
						when: ContextKeyExpr.and(
							IsSessionsWindowContext,
							IsAuxiliaryWindowContext.toNegated(),
							IsTopRightEditorGroupContext,
							SinglePaneLayoutEnabledContext,
							MainEditorAreaVisibleContext,
							HasDockedDetailsContext)
					}
				});
			}

			run(): void {
				that.toggleDetails();
			}
		});
	}
}
