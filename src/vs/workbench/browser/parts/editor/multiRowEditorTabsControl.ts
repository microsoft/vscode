/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { IEditorGroupsAccessor, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { EditorTabsControl, IEditorTabsControl } from 'vs/workbench/browser/parts/editor/editorTabsControl';
import { MultiEditorTabsControl } from 'vs/workbench/browser/parts/editor/multiEditorTabsControl';
import { IEditorPartOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { StickyEditorGroupModel, UnstickyEditorGroupModel, FilteredEditorGroup } from 'vs/workbench/browser/parts/editor/stickyEditorGroup';
import { IEditorTitleControlDimensions } from 'vs/workbench/browser/parts/editor/editorTitleControl';

export class MultiRowEditorControl extends Themable implements IEditorTabsControl {

	private stickyEditorTabsControl: IEditorTabsControl;
	private UnstickyEditorTabsControl: IEditorTabsControl;

	private editorTabsControlDisposable = this._register(new DisposableStore());

	constructor(
		private parent: HTMLElement,
		private accessor: IEditorGroupsAccessor,
		private group: IEditorGroupView,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.stickyEditorTabsControl = this.createEditorTabsControl(new StickyEditorGroupModel(this.group));
		this.UnstickyEditorTabsControl = this.createEditorTabsControl(new UnstickyEditorGroupModel(this.group));

		this.handlePinnedTabsSeparateRowToolbars();
	}

	private createEditorTabsControl(FilteredEditorGroup: FilteredEditorGroup): EditorTabsControl {
		const control = this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group, FilteredEditorGroup);
		return this.editorTabsControlDisposable.add(control);
	}

	showEditorActionsToolbar(): void {
		this.stickyEditorTabsControl.showEditorActionsToolbar();
		this.UnstickyEditorTabsControl.showEditorActionsToolbar();
	}
	hideEditorActionsToolbar(): void {
		this.stickyEditorTabsControl.hideEditorActionsToolbar();
		this.UnstickyEditorTabsControl.hideEditorActionsToolbar();
	}

	private handlePinnedTabsSeparateRowToolbars(): void {
		if (this.group.count === 0) {
			// Do nothing as no tab bar is visible
			return;
		}
		if (this.group.count === this.group.stickyCount) {
			this.stickyEditorTabsControl.showEditorActionsToolbar();
			this.UnstickyEditorTabsControl.hideEditorActionsToolbar();
		}
		else {
			this.stickyEditorTabsControl.hideEditorActionsToolbar();
			this.UnstickyEditorTabsControl.showEditorActionsToolbar();
		}
	}

	private getEditorTabsController(editor: EditorInput): IEditorTabsControl {
		return this.group.isSticky(editor) ? this.stickyEditorTabsControl : this.UnstickyEditorTabsControl;
	}

	openEditor(editor: EditorInput): boolean {
		const [editorTabController, otherTabController] = this.group.isSticky(editor) ? [this.stickyEditorTabsControl, this.UnstickyEditorTabsControl] : [this.UnstickyEditorTabsControl, this.stickyEditorTabsControl];
		const didChange = editorTabController.openEditor(editor);
		if (didChange) {
			// HACK: To render all editor tabs on startup, otherwise only one row gets rendered
			otherTabController.openEditors([]);
		}
		return didChange;
	}

	openEditors(editors: EditorInput[]): boolean {
		const stickyEditors = editors.filter(e => this.group.isSticky(e));
		const unstickyEditos = editors.filter(e => !this.group.isSticky(e));

		const didChangeOpenEditorsSticky = this.stickyEditorTabsControl.openEditors(stickyEditors);
		const didChangeOpenEditorsUnSticky = this.UnstickyEditorTabsControl.openEditors(unstickyEditos);

		return didChangeOpenEditorsSticky || didChangeOpenEditorsUnSticky;
	}

	beforeCloseEditor(editor: EditorInput): void {
		this.getEditorTabsController(editor).beforeCloseEditor(editor);
	}

	closeEditor(editor: EditorInput): void {
		this.stickyEditorTabsControl.closeEditor(editor); // TODO CLOSE ONLY ONE
		this.UnstickyEditorTabsControl.closeEditor(editor);

		this.handleClosedEditors();
	}

	closeEditors(editors: EditorInput[]): void {
		const stickyEditors = editors.filter(e => this.group.isSticky(e));
		const unstickyEditors = editors.filter(e => !this.group.isSticky(e));

		this.stickyEditorTabsControl.closeEditors(stickyEditors);
		this.UnstickyEditorTabsControl.closeEditors(unstickyEditors);

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
				this.UnstickyEditorTabsControl.closeEditor(editor);
			} else {
				this.stickyEditorTabsControl.closeEditor(editor);
				this.UnstickyEditorTabsControl.openEditor(editor);
			}
		}
		else {
			if (this.group.isSticky(editor)) {
				this.stickyEditorTabsControl.moveEditor(editor, fromIndex, targetIndex, false);
			} else {
				this.UnstickyEditorTabsControl.moveEditor(editor, fromIndex - this.group.stickyCount, targetIndex - this.group.stickyCount, false);
			}
		}

		this.handlePinnedTabsSeparateRowToolbars();
	}

	pinEditor(editor: EditorInput): void {
		this.getEditorTabsController(editor).pinEditor(editor);
	}

	stickEditor(editor: EditorInput): void {
		this.stickyEditorTabsControl.openEditor(editor);
		this.UnstickyEditorTabsControl.closeEditor(editor);

		this.handlePinnedTabsSeparateRowToolbars();
	}

	unstickEditor(editor: EditorInput): void {
		this.stickyEditorTabsControl.closeEditor(editor);
		this.UnstickyEditorTabsControl.openEditor(editor);

		this.handlePinnedTabsSeparateRowToolbars();
	}

	setActive(isActive: boolean): void {
		this.stickyEditorTabsControl.setActive(isActive);
		this.UnstickyEditorTabsControl.setActive(isActive);
	}

	updateEditorLabel(editor: EditorInput): void {
		this.getEditorTabsController(editor).updateEditorLabel(editor);
	}

	updateEditorDirty(editor: EditorInput): void {
		this.getEditorTabsController(editor).updateEditorDirty(editor);
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {
		this.stickyEditorTabsControl.updateOptions(oldOptions, newOptions);
		this.UnstickyEditorTabsControl.updateOptions(oldOptions, newOptions);
	}

	layout(dimensions: IEditorTitleControlDimensions): Dimension {
		const stickyDimensions = this.stickyEditorTabsControl.layout(dimensions);
		const unstickyDimensions = this.UnstickyEditorTabsControl.layout(dimensions);

		return new Dimension(
			dimensions.container.width,
			stickyDimensions.height + unstickyDimensions.height
		);
	}

	getHeight(): number {
		return this.stickyEditorTabsControl.getHeight() + this.UnstickyEditorTabsControl.getHeight();
	}
}
