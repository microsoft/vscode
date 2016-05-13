/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import uri from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import {EditorInput, UntitledEditorInput} from 'vs/workbench/common/editor';
import {IEditorGroup} from 'vs/workbench/common/editor/editorStacksModel';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {ITextFileService, FileEditorInput} from 'vs/workbench/parts/files/common/files';

export class OpenEditor {

	constructor(private editor: EditorInput, private group: IEditorGroup) {
		// noop
	}

	public get editorInput() {
		return this.editor;
	}

	public get editorGroup() {
		return this.group;
	}

	public getId(): string {
		return `openeditor:${this.group.id}:${this.editor.getName()}:${this.editor.getDescription()}`;
	}

	public isPreview(): boolean {
		return this.group.isPreview(this.editor);
	}

	public isUntitled(): boolean {
		return this.editor instanceof UntitledEditorInput;
	}

	public isDirty(textFileService: ITextFileService, untitledEditorService: IUntitledEditorService): boolean {
		if (this.editor instanceof FileEditorInput) {
			return textFileService.isDirty((<FileEditorInput>this.editor).getResource());
		} else if (this.editor instanceof UntitledEditorInput) {
			return untitledEditorService.isDirty((<UntitledEditorInput>this.editor).getResource());
		}

		return false;
	}

	public getResource(): uri {
		if (this.editor instanceof FileEditorInput) {
			return (<FileEditorInput>this.editor).getResource();
		} else if (this.editor instanceof UntitledEditorInput) {
			return (<UntitledEditorInput>this.editor).getResource();
		}

		return null;
	}
}

export class CloseOpenEditorAction extends Action {

	public static ID = 'workbench.files.action.closeOpenEditor';

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(CloseOpenEditorAction.ID, nls.localize('closeEditor', "Close Editor"), 'action-close-file');
	}

	public run(openEditor: OpenEditor): TPromise<any> {
		const position = this.editorService.getStacksModel().positionOfGroup(openEditor.editorGroup);
		return this.editorService.closeEditor(position, openEditor.editorInput);
	}
}

export class CloseOtherEditorsInGroupAction extends Action {

	public static ID = 'workbench.files.action.closeOtherEditorsInGroup';

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(CloseOtherEditorsInGroupAction.ID, nls.localize('closeOtherEditorsInGroup', "Close Other Editors in Group"));
	}

	public run(openEditor: OpenEditor): TPromise<any> {
		const position = this.editorService.getStacksModel().positionOfGroup(openEditor.editorGroup);
		return this.editorService.closeEditors(position, openEditor.editorInput);
	}
}

export class CloseAllEditorsInGroupAction extends Action {

	public static ID = 'workbench.files.action.closeAllEditorsInGroup';

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(CloseAllEditorsInGroupAction.ID, nls.localize('closeAllEditorsInGroup', "Close All Editors in Group"));
	}

	public run(openEditor: OpenEditor): TPromise<any> {
		const position = this.editorService.getStacksModel().positionOfGroup(openEditor.editorGroup);
		return this.editorService.closeEditors(position);
	}
}

export class CloseEditorsInOtherGroupsAction extends Action {

	public static ID = 'workbench.files.action.closeEditorsInOtherGroups';

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(CloseEditorsInOtherGroupsAction.ID, nls.localize('closeEditorsInOtherGroups', "Close Editors in Other Groups"));
	}

	public run(openEditor: OpenEditor): TPromise<any> {
		const position = this.editorService.getStacksModel().positionOfGroup(openEditor.editorGroup);
		return this.editorService.closeAllEditors(position);
	}
}

export class CloseAllEditorsAction extends Action {

	public static ID = 'workbench.files.action.closeAllEditors';

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(CloseAllEditorsAction.ID, nls.localize('closeAllEditors', "Close All Editors"), 'action-close-all-files');
	}

	public run(): TPromise<any> {
		return this.editorService.closeAllEditors();
	}
}

export class SaveAllInGroupAction extends Action {

	public static ID = 'workbench.files.action.saveAllInGroup';

	constructor(@ITextFileService private textFileService: ITextFileService) {
		super(CloseAllEditorsAction.ID, nls.localize('saveAllInGroup', "Save All in Group"), 'action-save-all-in-group');
	}

	public run(editorGroup: IEditorGroup): TPromise<any> {
		const resourcesToSave = [];
		editorGroup.getEditors().forEach(editor => {
			if (editor instanceof FileEditorInput || editor instanceof UntitledEditorInput) {
				resourcesToSave.push(editor.getResource());
			}
		});

		return this.textFileService.saveAll(resourcesToSave);
	}
}
