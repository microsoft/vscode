/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { GroupIdentifier } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { WindowCanvasInput, IWindowCanvasService } from '../../../../../workbench/contrib/sessions/browser/windowCanvas.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { DesktopDetailPanelCoordinator } from './desktopDetailPanelCoordinator.js';
import { IDesktopLayoutContext } from './desktopLayoutStrategy.js';

/** The side pane of the chat a window canvas covered, as it was when the canvas opened. */
interface ICoveredSidePane {
	readonly sessionResource: URI | undefined;
	readonly chatResource: URI | undefined;
	readonly editorVisible: boolean;
	readonly detailsVisible: boolean;
	readonly groupId: GroupIdentifier;
	readonly activeEditor: EditorInput | undefined;
}

/**
 * A window canvas, such as Inbox, is a destination the Editor shows in place of the chats: opening it reveals the
 * Editor, and leaving it does not close its tab. This coordinator keeps such a visit out of the chat's layout. While a
 * canvas is the destination, {@link windowCanvasShown} tells the strategies not to record side-pane changes as the
 * chat's composition; when navigation returns to the chat the canvas covered, the chat's side pane is restored.
 */
export class DesktopWindowCanvasCoordinator extends Disposable {

	constructor(
		private readonly _ctx: IDesktopLayoutContext,
		private readonly _detailPanel: DesktopDetailPanelCoordinator,
		@IWindowCanvasService private readonly _windowCanvasService: IWindowCanvasService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		const customViewVisible = observableFromEvent(this, this._layoutService.onDidChangePartVisibility, () => this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART));
		let covered: ICoveredSidePane | undefined;
		this._register(autorun(reader => {
			const shown = !!this._windowCanvasService.navigationRequest.read(reader) || !!this._windowCanvasService.activeCanvasOpen.read(reader);
			if (shown) {
				// A pending open publishes its request before it reveals the Editor, and hides a custom view that reports
				// the side pane it covers as hidden, so the chat's own side pane is captured in between.
				if (!covered && !customViewVisible.read(reader)) {
					covered = this._captureCoveredSidePane();
				}
				return;
			}
			const previous = covered;
			covered = undefined;
			if (previous) {
				this._restoreCoveredSidePane(previous);
			}
		}));
	}

	/** Whether a window canvas is the navigation destination, opened or still opening, instead of a chat. */
	get windowCanvasShown(): boolean {
		return !!this._windowCanvasService.navigationRequest.get() || !!this._windowCanvasService.activeCanvasOpen.get();
	}

	private _captureCoveredSidePane(): ICoveredSidePane {
		const shown = this._ctx.shownByMainWindow();
		const group = this._editorGroupsService.mainPart.activeGroup;
		return {
			sessionResource: shown?.session.resource,
			chatResource: shown?.chat.resource,
			editorVisible: this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
			detailsVisible: this._detailPanel.intendedVisible,
			groupId: group.id,
			activeEditor: group.activeEditor ?? undefined,
		};
	}

	private _restoreCoveredSidePane(covered: ICoveredSidePane): void {
		const shown = this._ctx.shownByMainWindow();
		const group = this._editorGroupsService.mainPart.getGroup(covered.groupId);
		// Another chat applies its own composition, and choosing another editor over the canvas keeps the Editor.
		if (!shown || !isEqual(shown.session.resource, covered.sessionResource) || !isEqual(shown.chat.resource, covered.chatResource)
			|| !(group?.activeEditor instanceof WindowCanvasInput)) {
			return;
		}
		const hideEditor = !covered.editorVisible && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
		// The canvas hides Details beside it; beside a shown Editor, the reactivated editor decides whether they return.
		const showDetails = !covered.editorVisible && covered.detailsVisible && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		const previousEditor = covered.activeEditor;
		const reactivate = previousEditor && !(previousEditor instanceof WindowCanvasInput) && group.contains(previousEditor) ? previousEditor : undefined;
		if (!hideEditor && !showDetails && !reactivate) {
			return;
		}
		this._ctx.withSessionLayoutRestore(async () => {
			if (hideEditor) {
				this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
			}
			if (showDetails) {
				this._detailPanel.setHiddenTransiently(false);
			}
			if (reactivate) {
				await this._editorService.openEditor(reactivate, { preserveFocus: true, activation: EditorActivation.PRESERVE }, group);
			}
		});
	}
}
