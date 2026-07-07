/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/**
 * A quick chat has no side pane (no workspace, Changes/Files gated off). The
 * detail panel target is `Hidden` (aux bar hidden), but the docked editor part
 * can still be left visible when switching in from a session that had it open.
 * Hide the editor part while a quick chat's editor group is empty so the whole
 * side pane collapses and the chat is full-width. Gated on emptiness so a real
 * editor (e.g. the integrated browser) opened in a quick chat is never hidden.
 */
export class SinglePaneQuickChatEditorHideStrategy extends SinglePaneLayoutStrategy {

	constructor(
		ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super(ctx);

		const mainPartEmptyObs = observableFromEvent(this,
			Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange, this._editorService.onDidCloseEditor),
			() => this._isMainPartEmpty());

		this._register(autorun(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
			if (!isQuickChat || !mainPartEmptyObs.read(reader)) {
				return;
			}
			if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				return;
			}
			const suppression = this._layoutService.suppressEditorPartAutoVisibility();
			try {
				this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
			} finally {
				suppression.dispose();
			}
		}));
	}

	private _isMainPartEmpty(): boolean {
		for (const group of this._editorGroupsService.mainPart.groups) {
			if (!group.isEmpty) {
				return false;
			}
		}
		return true;
	}
}
