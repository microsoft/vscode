/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { DockedEditorInput } from '../../../../common/dockedEditorInput.js';
import { ISinglePaneLayoutContext, SinglePaneDockedTabsCoordinator, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/**
 * When the editor area is hidden (detail-only), closes every non-docked editor
 * so only the docked Changes and Files tabs remain. Editors that can be captured
 * as a reopenable input are remembered and restored when the editor area is shown
 * again; non-restorable ones (e.g. an untitled Search editor) are simply dropped.
 * Serializes on the shared docked-tab sequencer so it never races the managed-tab sync.
 */
export class SinglePaneEditorAreaCollapseStrategy extends SinglePaneLayoutStrategy {

	/** Last observed editor-area visibility, to act only on transitions. */
	private _editorAreaVisible: boolean | undefined;

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _coordinator: SinglePaneDockedTabsCoordinator,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super(ctx);

		const editorAreaVisibleObs = observableFromEvent(this, this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow));

		this._register(autorun(reader => {
			const visible = editorAreaVisibleObs.read(reader);
			if (this._editorAreaVisible === undefined) {
				this._editorAreaVisible = visible;
				return;
			}
			if (visible === this._editorAreaVisible) {
				return;
			}
			this._editorAreaVisible = visible;

			// Session-switch restores toggle editor-area visibility as a side effect;
			// those are layout-driven, not a user hide/show, so skip them.
			if (this._ctx.isRestoringSessionLayout) {
				return;
			}

			void this._coordinator.sequencer.queue(() => visible ? this._restoreCollapsedTabs() : this._collapseNonManagedTabs()).catch(onUnexpectedError);
		}));
	}

	private async _collapseNonManagedTabs(): Promise<void> {
		if (this._coordinator.collapsedEditors) {
			return; // already collapsed
		}

		const group = this._editorGroupsService.mainPart.activeGroup;
		const captured: { editor: IUntypedEditorInput; index: number }[] = [];
		const toClose: EditorInput[] = [];
		group.editors.forEach((editor, index) => {
			if (editor instanceof DockedEditorInput) {
				return;
			}
			// Capture editors that can be reopened so they are restored when the
			// editor area is shown again; the rest are still closed but not restored.
			const untyped = editor.toUntyped();
			if (untyped) {
				captured.push({ editor: untyped, index });
			}
			toClose.push(editor);
		});
		if (toClose.length === 0) {
			return;
		}

		this._coordinator.collapsedEditors = captured;
		toClose.forEach(editor => this._coordinator.internallyClosingEditors.add(editor));
		const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			await this._editorService.closeEditors(toClose.map(editor => ({ groupId: group.id, editor })), { preserveFocus: true });
		} finally {
			toClose.forEach(editor => this._coordinator.internallyClosingEditors.delete(editor));
			suppressEditorPartAutoVisibility.dispose();
		}
	}

	private async _restoreCollapsedTabs(): Promise<void> {
		const captured = this._coordinator.collapsedEditors;
		this._coordinator.collapsedEditors = undefined;
		if (!captured || captured.length === 0) {
			return;
		}

		const group = this._editorGroupsService.mainPart.activeGroup;
		const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			// Reopen in ascending index order, each at its original tab position, so
			// the tabs return to where they were before the editor area was hidden.
			await this._editorService.openEditors(
				[...captured]
					.sort((a, b) => a.index - b.index)
					.map(({ editor, index }) => ({ ...editor, options: { ...editor.options, index, inactive: true, preserveFocus: true, pinned: true } })),
				group);
		} finally {
			suppressEditorPartAutoVisibility.dispose();
		}
	}
}
