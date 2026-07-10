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
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { SinglePaneDetailChangesOrFilesActiveContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/** Command that toggles the single-pane detail panel (auxiliary bar) from the editor title bar. */
export const TOGGLE_DETAILS_COMMAND_ID = 'workbench.action.agentSessions.toggleDetails';
// Toggle Details is conditional (hidden for tab types with no detail, e.g. browser
// and search). It keeps its trailing position after the always-present
// maximize/restore and hide chevron.
const singlePaneLayoutToggleDetailsOrder = 30;

/**
 * [D7 single-pane] Auto-hide the sessions list when the user needs more room for
 * the side pane: opening the details pane via the Toggle Details action, or
 * opening a real file/diff into the editor area (Scenario 8). The list is
 * restored when details is explicitly closed or the side pane is fully hidden.
 * Unlike the base responsive rule this is not window-size driven and never
 * reacts to automatic details opens (submit, session restore). Also owns the
 * Toggle Details action itself.
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

		// [Scenario 8] Opening a real file/browser editor from the Files or Changes
		// view needs editor-area room, so auto-hide the sessions list — but only in
		// an existing (created) session and only when the editor area is currently
		// closed (this open will reveal it). Managed tabs (the Changes multi-diff
		// and the empty Files placeholder) are not FileEditorInput/BrowserEditorInput
		// so they never trigger this; a session-switch restore is excluded too.
		this._register(this._editorService.onWillOpenEditor(e => {
			if (this._ctx.isRestoringSessionLayout || this._ctx.multipleSessionsVisibleObs.get() || this._layoutService.isEditorMaximized()) {
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (!activeSession?.isCreated.get() || this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				return;
			}
			if (!(e.editor instanceof FileEditorInput || e.editor instanceof BrowserEditorInput)) {
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

		// Restore an auto-collapsed sessions list once the side pane is fully
		// hidden — there is no side pane to make room for anymore. This covers
		// closing the whole side pane and switching to a session with no side pane
		// (a quick chat), so the list is never left collapsed while the side pane
		// is hidden. `observableFromEvent` dedupes on the computed value, so hiding
		// the sidebar itself (a different part) never re-triggers this, and the
		// pre-reveal auto-hide from opening an editor is not undone.
		const sidePaneVisibleObs = observableFromEvent(this,
			this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || this._layoutService.isVisible(Parts.AUXILIARYBAR_PART));
		this._register(autorun(reader => {
			if (sidePaneVisibleObs.read(reader) || !this._sidebarAutoHidden) {
				return;
			}
			this._setSidebarAutoHidden(false);
			this._sidebarAutoHidden = false;
		}));
	}

	/**
	 * Toggle the detail panel (auxiliary bar) and, in the same gesture, auto-hide
	 * the sessions list to free room when opening it (restoring the list when
	 * closing). Returns whether the detail panel is now visible.
	 */
	toggleDetails(): boolean {
		const nowVisible = !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._layoutService.setPartHidden(!nowVisible, Parts.AUXILIARYBAR_PART);

		if (!this._ctx.multipleSessionsVisibleObs.get()) {
			if (nowVisible) {
				if (this._setSidebarAutoHidden(true)) {
					this._sidebarAutoHidden = true;
				}
			} else if (this._sidebarAutoHidden) {
				this._setSidebarAutoHidden(false);
				this._sidebarAutoHidden = false;
			}
		}
		return nowVisible;
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
							SinglePaneDetailChangesOrFilesActiveContext)
					}
				});
			}

			run(): void {
				that.toggleDetails();
			}
		});
	}
}
