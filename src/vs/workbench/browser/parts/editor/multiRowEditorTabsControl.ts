/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupsView, IEditorGroupView, IInternalEditorOpenOptions } from 'vs/workbench/browser/parts/editor/editor';
import { IEditorTabsControl } from 'vs/workbench/browser/parts/editor/editorTabsControl';
import { MultiEditorTabsControl } from 'vs/workbench/browser/parts/editor/multiEditorTabsControl';
import { IEditorPartOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { Disposable } from 'vs/base/common/lifecycle';
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from 'vs/workbench/common/editor/filteredEditorGroupModel';
import { IEditorTitleControlDimensions } from 'vs/workbench/browser/parts/editor/editorTitleControl';
import { IReadonlyEditorGroupModel } from 'vs/workbench/common/editor/editorGroupModel';

export class MultiRowEditorControl extends Disposable implements IEditorTabsControl {

	private readonly stickyEditorTabsControl: IEditorTabsControl;
	private readonly unstickyEditorTabsControl: IEditorTabsControl;

	constructor(
		private parent: HTMLElement,
		private groupsView: IEditorGroupsView,
		private groupView: IEditorGroupView,
		private model: IReadonlyEditorGroupModel,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();

		const stickyModel = this._register(new StickyEditorGroupModel(this.model));
		const unstickyModel = this._register(new UnstickyEditorGroupModel(this.model));

		this.stickyEditorTabsControl = this._register(this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.groupsView, this.groupView, stickyModel));
		this.unstickyEditorTabsControl = this._register(this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.groupsView, this.groupView, unstickyModel));

		this.handlePinnedTabsSeparateRowToolbars();
	}

	private handlePinnedTabsSeparateRowToolbars(): void {
		if (this.groupView.count === 0) {
			// Do nothing as no tab bar is visible
			return;
		}
		// Ensure action toolbar is only visible once
		if (this.groupView.count === this.groupView.stickyCount) {
			this.parent.classList.toggle('two-tab-bars', false);
		} else {
			this.parent.classList.toggle('two-tab-bars', true);
		}
	}

	private getEditorTabsController(editor: EditorInput): IEditorTabsControl {
		return this.model.isSticky(editor) ? this.stickyEditorTabsControl : this.unstickyEditorTabsControl;
	}

	openEditor(editor: EditorInput, options: IInternalEditorOpenOptions): boolean {
		const [editorTabController, otherTabController] = this.model.isSticky(editor) ? [this.stickyEditorTabsControl, this.unstickyEditorTabsControl] : [this.unstickyEditorTabsControl, this.stickyEditorTabsControl];
		const didChange = editorTabController.openEditor(editor, options);
		if (didChange) {
			// HACK: To render all editor tabs on startup, otherwise only one row gets rendered
			otherTabController.openEditors([]);

			this.handleOpenedEditors();
		}
		return didChange;
	}

	openEditors(editors: EditorInput[]): boolean {
		const stickyEditors = editors.filter(e => this.model.isSticky(e));
		const unstickyEditors = editors.filter(e => !this.model.isSticky(e));

		const didChangeOpenEditorsSticky = this.stickyEditorTabsControl.openEditors(stickyEditors);
		const didChangeOpenEditorsUnSticky = this.unstickyEditorTabsControl.openEditors(unstickyEditors);

		const didChange = didChangeOpenEditorsSticky || didChangeOpenEditorsUnSticky;

		if (didChange) {
			this.handleOpenedEditors();
		}

		return didChange;
	}

	private handleOpenedEditors(): void {
		this.handlePinnedTabsSeparateRowToolbars();
	}

	beforeCloseEditor(editor: EditorInput): void {
		this.getEditorTabsController(editor).beforeCloseEditor(editor);
	}

	closeEditor(editor: EditorInput): void {
		// Has to be called on both tab bars as the editor could be either sticky or not
		this.stickyEditorTabsControl.closeEditor(editor);
		this.unstickyEditorTabsControl.closeEditor(editor);

		this.handleClosedEditors();
	}

	closeEditors(editors: EditorInput[]): void {
		const stickyEditors = editors.filter(e => this.model.isSticky(e));
		const unstickyEditors = editors.filter(e => !this.model.isSticky(e));

		this.stickyEditorTabsControl.closeEditors(stickyEditors);
		this.unstickyEditorTabsControl.closeEditors(unstickyEditors);

		this.handleClosedEditors();
	}

	private handleClosedEditors(): void {
		this.handlePinnedTabsSeparateRowToolbars();
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number, stickyStateChange: boolean): void {
		if (stickyStateChange) {
			// If sticky state changes, move editor between tab bars
			if (this.model.isSticky(editor)) {
				this.stickyEditorTabsControl.openEditor(editor);
				this.unstickyEditorTabsControl.closeEditor(editor);
			} else {
				this.stickyEditorTabsControl.closeEditor(editor);
				this.unstickyEditorTabsControl.openEditor(editor);
			}

			this.handlePinnedTabsSeparateRowToolbars();

		} else {
			if (this.model.isSticky(editor)) {
				this.stickyEditorTabsControl.moveEditor(editor, fromIndex, targetIndex, stickyStateChange);
			} else {
				this.unstickyEditorTabsControl.moveEditor(editor, fromIndex - this.model.stickyCount, targetIndex - this.model.stickyCount, stickyStateChange);
			}
		}
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
		const unstickyAvailableDimensions = {
			container: dimensions.container,
			available: new Dimension(dimensions.available.width, dimensions.available.height - stickyDimensions.height)
		};
		const unstickyDimensions = this.unstickyEditorTabsControl.layout(unstickyAvailableDimensions);

		return new Dimension(
			dimensions.container.width,
			stickyDimensions.height + unstickyDimensions.height
		);
	}

	getHeight(): number {
		return this.stickyEditorTabsControl.getHeight() + this.unstickyEditorTabsControl.getHeight();
	}

	public override dispose(): void {
		this.parent.classList.toggle('two-tab-bars', false);

		super.dispose();
	}
}
