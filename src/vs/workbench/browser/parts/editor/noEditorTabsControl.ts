/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/singleeditortabscontrol';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { EditorTabsControl } from 'vs/workbench/browser/parts/editor/editorTabsControl';
import { Dimension } from 'vs/base/browser/dom';
import { IEditorTitleControlDimensions } from 'vs/workbench/browser/parts/editor/editorTitleControl';
import { IToolbarActions } from 'vs/workbench/common/editor';

export class NoEditorTabsControl extends EditorTabsControl {
	private activeEditor: EditorInput | null = null;

	protected prepareEditorActions(editorActions: IToolbarActions): IToolbarActions {
		return {
			primary: [],
			secondary: []
		};
	}

	openEditor(editor: EditorInput): boolean {
		return this.handleOpenedEditors();
	}

	openEditors(editors: EditorInput[]): boolean {
		return this.handleOpenedEditors();
	}

	private handleOpenedEditors(): boolean {
		const didChange = this.activeEditorChanged();
		this.activeEditor = this.tabsModel.activeEditor;
		return didChange;
	}

	private activeEditorChanged(): boolean {
		if (
			!this.activeEditor && this.tabsModel.activeEditor || 				// active editor changed from null => editor
			this.activeEditor && !this.tabsModel.activeEditor || 				// active editor changed from editor => null
			(!this.activeEditor || !this.tabsModel.isActive(this.activeEditor))	// active editor changed from editorA => editorB
		) {
			return true;
		}
		return false;
	}

	beforeCloseEditor(editor: EditorInput): void { }

	closeEditor(editor: EditorInput): void { }

	closeEditors(editors: EditorInput[]): void { }

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number): void { }

	pinEditor(editor: EditorInput): void { }

	stickEditor(editor: EditorInput): void { }

	unstickEditor(editor: EditorInput): void { }

	setActive(isActive: boolean): void { }

	updateEditorSelections(): void { }

	updateEditorLabel(editor: EditorInput): void { }

	updateEditorDirty(editor: EditorInput): void { }

	getHeight(): number {
		return 0;
	}

	layout(dimensions: IEditorTitleControlDimensions): Dimension {
		return new Dimension(dimensions.container.width, this.getHeight());
	}
}
