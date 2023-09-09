/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, clearNode } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { IEditorGroupsAccessor, IEditorGroupTitleHeight, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { EditorTabsControl, IEditorTabsControlDimensions } from 'vs/workbench/browser/parts/editor/editorTabsControl';
import { MultiEditorTabsControl } from 'vs/workbench/browser/parts/editor/multiEditorTabsControl';
import { SingleEditorTabsControl } from 'vs/workbench/browser/parts/editor/singleEditorTabsControl';
import { IEditorPartOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

export class EditorTitleControl extends Themable {

	private editorTabsControl: EditorTabsControl;

	constructor(
		private parent: HTMLElement,
		private accessor: IEditorGroupsAccessor,
		private group: IEditorGroupView,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.editorTabsControl = this.createEditorTabsControl();
	}

	private createEditorTabsControl(): EditorTabsControl {
		if (this.accessor.partOptions.showTabs) {
			return this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group);
		}

		return this.instantiationService.createInstance(SingleEditorTabsControl, this.parent, this.accessor, this.group);
	}

	openEditor(editor: EditorInput): void {
		return this.editorTabsControl.openEditor(editor);
	}

	openEditors(editors: EditorInput[]): void {
		return this.editorTabsControl.openEditors(editors);
	}

	beforeCloseEditor(editor: EditorInput): void {
		return this.editorTabsControl.beforeCloseEditor(editor);
	}

	closeEditor(editor: EditorInput): void {
		return this.editorTabsControl.closeEditor(editor);
	}

	closeEditors(editors: EditorInput[]): void {
		return this.editorTabsControl.closeEditors(editors);
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number): void {
		return this.editorTabsControl.moveEditor(editor, fromIndex, targetIndex);
	}

	pinEditor(editor: EditorInput): void {
		return this.editorTabsControl.pinEditor(editor);
	}

	stickEditor(editor: EditorInput): void {
		return this.editorTabsControl.stickEditor(editor);
	}

	unstickEditor(editor: EditorInput): void {
		return this.editorTabsControl.unstickEditor(editor);
	}

	setActive(isActive: boolean): void {
		return this.editorTabsControl.setActive(isActive);
	}

	updateEditorLabel(editor: EditorInput): void {
		return this.editorTabsControl.updateEditorLabel(editor);
	}

	updateEditorDirty(editor: EditorInput): void {
		return this.editorTabsControl.updateEditorDirty(editor);
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {

		// Update editor tabs control if options changed
		if (oldOptions.showTabs !== newOptions.showTabs) {

			// Clear old
			this.editorTabsControl.dispose();
			clearNode(this.parent);

			// Create new
			this.editorTabsControl = this.createEditorTabsControl();
		}

		// Forward into editor tabs control
		this.editorTabsControl.updateOptions(oldOptions, newOptions);
	}

	layout(dimensions: IEditorTabsControlDimensions): Dimension {
		return this.editorTabsControl.layout(dimensions);
	}

	getHeight(): IEditorGroupTitleHeight {
		return this.editorTabsControl.getHeight();
	}

	override dispose(): void {
		this.editorTabsControl.dispose();

		super.dispose();
	}
}
