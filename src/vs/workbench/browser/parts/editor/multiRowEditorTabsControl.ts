/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupsAccessor, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { IEditorTabsControl } from 'vs/workbench/browser/parts/editor/editorTabsControl';
import { MultiEditorTabsControl } from 'vs/workbench/browser/parts/editor/multiEditorTabsControl';
import { IEditorPartOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { Disposable } from 'vs/base/common/lifecycle';
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from 'vs/workbench/services/editor/common/filteredEditorGroup';
import { IEditorTitleControlDimensions } from 'vs/workbench/browser/parts/editor/editorTitleControl';

export class MultiRowEditorControl extends Disposable implements IEditorTabsControl {

	private readonly stickyEditorTabsControl: IEditorTabsControl;
	private readonly unstickyEditorTabsControl: IEditorTabsControl;

	constructor(
		private parent: HTMLElement,
		private accessor: IEditorGroupsAccessor,
		private group: IEditorGroupView,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();

		this.stickyEditorTabsControl = this._register(this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group, new StickyEditorGroupModel(this.group)));
		this.unstickyEditorTabsControl = this._register(this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group, new UnstickyEditorGroupModel(this.group)));

		this.handlePinnedTabsSeparateRowToolbars();
	}

	showEditorActionsToolbar(): void {
		this.stickyEditorTabsControl.showEditorActionsToolbar();
		this.unstickyEditorTabsControl.showEditorActionsToolbar();
	}

	hideEditorActionsToolbar(): void {
		this.stickyEditorTabsControl.hideEditorActionsToolbar();
		this.unstickyEditorTabsControl.hideEditorActionsToolbar();
	}

	private handlePinnedTabsSeparateRowToolbars(): void {
		if (this.group.count === 0) {
			// Do nothing as no tab bar is visible
			return;
		}
		// Ensure action toolbar is only visible once
		if (this.group.count === this.group.stickyCount) {
			this.stickyEditorTabsControl.showEditorActionsToolbar();
			this.unstickyEditorTabsControl.hideEditorActionsToolbar();
		} else {
			this.stickyEditorTabsControl.hideEditorActionsToolbar();
			this.unstickyEditorTabsControl.showEditorActionsToolbar();
		}
	}

	private getEditorTabsController(editor: EditorInput): IEditorTabsControl {
		return this.group.isSticky(editor) ? this.stickyEditorTabsControl : this.unstickyEditorTabsControl;
	}

	openEditor(editor: EditorInput): boolean {
		const [editorTabController, otherTabController] = this.group.isSticky(editor) ? [this.stickyEditorTabsControl, this.unstickyEditorTabsControl] : [this.unstickyEditorTabsControl, this.stickyEditorTabsControl];
		const didChange = editorTabController.openEditor(editor);
		if (didChange) {
			// HACK: To render all editor tabs on startup, otherwise only one row gets rendered
			otherTabController.openEditors([]);
		}
		return didChange;
	}

	openEditors(editors: EditorInput[]): boolean {
		const stickyEditors = editors.filter(e => this.group.isSticky(e));
		const unstickyEditors = editors.filter(e => !this.group.isSticky(e));

		const didChangeOpenEditorsSticky = this.stickyEditorTabsControl.openEditors(stickyEditors);
		const didChangeOpenEditorsUnSticky = this.unstickyEditorTabsControl.openEditors(unstickyEditors);

		return didChangeOpenEditorsSticky || didChangeOpenEditorsUnSticky;
	}

	beforeCloseEditor(editor: EditorInput): void {
		this.getEditorTabsController(editor).beforeCloseEditor(editor);
	}

	closeEditor(editor: EditorInput): void {
		// Has to be called on both tab bars
		this.stickyEditorTabsControl.closeEditor(editor);
		this.unstickyEditorTabsControl.closeEditor(editor);

		this.handleClosedEditors();
	}

	closeEditors(editors: EditorInput[]): void {
		const stickyEditors = editors.filter(e => this.group.isSticky(e));
		const unstickyEditors = editors.filter(e => !this.group.isSticky(e));

		this.stickyEditorTabsControl.closeEditors(stickyEditors);
		this.unstickyEditorTabsControl.closeEditors(unstickyEditors);

		this.handleClosedEditors();
	}

	private handleClosedEditors(): void {
		this.handlePinnedTabsSeparateRowToolbars();
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number, stickyStateChange?: boolean): void {
		if (stickyStateChange) {
			// If sticky state changes, move editor between tab bars
			if (this.group.isSticky(editor)) {
				this.stickyEditorTabsControl.openEditor(editor);
				this.unstickyEditorTabsControl.closeEditor(editor);
			} else {
				this.stickyEditorTabsControl.closeEditor(editor);
				this.unstickyEditorTabsControl.openEditor(editor);
			}
		} else {
			if (this.group.isSticky(editor)) {
				this.stickyEditorTabsControl.moveEditor(editor, fromIndex, targetIndex, false);
			} else {
				this.unstickyEditorTabsControl.moveEditor(editor, fromIndex - this.group.stickyCount, targetIndex - this.group.stickyCount, false);
			}
		}

		this.handlePinnedTabsSeparateRowToolbars();
	}

	pinEditor(editor: EditorInput): void {
		this.getEditorTabsController(editor).pinEditor(editor);
	}

	stickEditor(editor: EditorInput): void {
		this.unstickyEditorTabsControl.closeEditor(editor);
		this.stickyEditorTabsControl.openEditor(editor);

		this.handlePinnedTabsSeparateRowToolbars();
	}

	unstickEditor(editor: EditorInput): void {
		this.stickyEditorTabsControl.closeEditor(editor);
		this.unstickyEditorTabsControl.openEditor(editor);

		this.handlePinnedTabsSeparateRowToolbars();
	}

	setActive(isActive: boolean): void {
		this.stickyEditorTabsControl.setActive(isActive);
		this.unstickyEditorTabsControl.setActive(isActive);
	}

	updateEditorLabel(editor: EditorInput): void {
		this.getEditorTabsController(editor).updateEditorLabel(editor);
	}

	updateEditorDirty(editor: EditorInput): void {
		this.getEditorTabsController(editor).updateEditorDirty(editor);
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {
		this.stickyEditorTabsControl.updateOptions(oldOptions, newOptions);
		this.unstickyEditorTabsControl.updateOptions(oldOptions, newOptions);
	}

	layout(dimensions: IEditorTitleControlDimensions): Dimension {
		const stickyDimensions = this.stickyEditorTabsControl.layout(dimensions);
		const unstickyDimensions = this.unstickyEditorTabsControl.layout(dimensions);

		return new Dimension(
			dimensions.container.width,
			stickyDimensions.height + unstickyDimensions.height
		);
	}

	getHeight(): number {
		return this.stickyEditorTabsControl.getHeight() + this.unstickyEditorTabsControl.getHeight();
	}
}
