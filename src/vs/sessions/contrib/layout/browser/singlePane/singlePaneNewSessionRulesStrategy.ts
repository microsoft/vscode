/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/**
 * [R1] Keep the editor content closed by default in the new-session view. Hides
 * the editor when it is revealed (or when the view is entered with the editor
 * visible) from a non-explicit source with no real content. Explicit reveals
 * (opening a file, toggling details off) are recorded by the workbench and
 * stick; automatic reveals (working-set restore, layout races, an
 * inherited-visible editor from a previous session) are re-hidden. Switching to
 * a managed tab (e.g. the Files placeholder) while the editor is *already*
 * visible does not hide it — only a visibility transition or entering the view
 * does.
 */
export class SinglePaneNewSessionRulesStrategy extends SinglePaneLayoutStrategy {

	constructor(
		ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super(ctx);

		const editorMaximizedObs = observableFromEvent(this,
			this._layoutService.onDidChangeEditorMaximized,
			() => this._layoutService.isEditorMaximized());
		const editorVisibleObs = observableFromEvent(this,
			this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow));
		const activeEditorObs = observableFromEvent(this,
			this._editorService.onDidActiveEditorChange,
			() => this._editorService.activeEditor);

		let previousEditorVisible = false;
		let previousInNewSessionView = false;
		this._register(autorun(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			const inNewSessionView = !!activeSession
				&& !this._ctx.multipleSessionsVisibleObs.read(reader)
				&& !editorMaximizedObs.read(reader)
				&& !activeSession.isCreated.read(reader)
				&& activeSession.isQuickChat?.read(reader) !== true
				&& activeSession.workspace.read(reader)?.folders?.[0]?.root !== undefined;

			// A real user-opened editor: an actual file or the integrated browser.
			// The managed empty landing tab (EmptyFileEditorInput) and "no active
			// editor" are not real content, so the editor content stays hidden.
			const activeEditor = activeEditorObs.read(reader);
			const hasRealContent = activeEditor instanceof FileEditorInput || activeEditor instanceof BrowserEditorInput;

			const editorVisible = editorVisibleObs.read(reader);
			// Hide only when the editor just *became* visible, or when the
			// new-session view was just entered with the editor already visible
			// (an inherited-visible editor from the previous session). Switching to
			// a managed tab while the editor is already visible must not hide it.
			const editorJustRevealed = editorVisible && !previousEditorVisible;
			const justEnteredNewSessionView = inNewSessionView && !previousInNewSessionView;
			previousEditorVisible = editorVisible;
			previousInNewSessionView = inNewSessionView;

			if (!inNewSessionView || hasRealContent || !editorVisible) {
				return;
			}

			// Re-hide the editor from a non-explicit reveal. Entering the new-session
			// view always resets to editor-closed (a stale explicit reveal from a
			// previous session must not carry over). An in-session reveal is re-hidden
			// only when it was automatic — an explicit reveal (opening a file,
			// toggling details off, which reveals the empty editor so the side pane
			// does not vanish) is respected.
			const shouldHide = justEnteredNewSessionView || (editorJustRevealed && !this._layoutService.isEditorRevealedExplicitly());
			if (shouldHide) {
				const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
				try {
					this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
				} finally {
					suppressEditorPartAutoVisibility.dispose();
				}
			}
		}));
	}
}
