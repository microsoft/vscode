/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { INextEditorGroupsService, GroupDirection } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInput } from 'vs/workbench/common/editor';
import { join } from 'vs/base/common/paths';

export class GridOpenEditorsAction extends Action {

	static readonly ID = 'workbench.action.gridOpenEditors';
	static readonly LABEL = localize('gridOpenEditors', "Grid: Open Some Editors");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private legacyEditorService: IWorkbenchEditorService,
		@INextEditorGroupsService private nextEditorGroupsService: INextEditorGroupsService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		const inputs = [
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor/editor.contribution.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextEditorActions.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextEditorGroupView.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextEditorPart.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextNoTabsTitleControl.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextTabsTitleControl.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextTitleControl.ts')
		].map(input => {
			return this.legacyEditorService.createInput({ resource: URI.file(input) }) as EditorInput;
		});

		const firstGroup = this.nextEditorGroupsService.activeGroup;
		firstGroup.openEditor(inputs[0], { pinned: true });
		firstGroup.openEditor(inputs[1], { inactive: true, pinned: true });
		firstGroup.openEditor(inputs[2], { inactive: true, pinned: true });

		const secondGroup = this.nextEditorGroupsService.addGroup(firstGroup, GroupDirection.DOWN);
		secondGroup.openEditor(inputs[3], { pinned: true, preserveFocus: true });
		secondGroup.openEditor(inputs[4], { inactive: true, pinned: true });

		const thirdGroup = this.nextEditorGroupsService.addGroup(secondGroup, GroupDirection.RIGHT);
		thirdGroup.openEditor(inputs[5], { pinned: true, preserveFocus: true });
		thirdGroup.openEditor(inputs[6], { inactive: true, pinned: true });

		this.nextEditorGroupsService.addGroup(firstGroup, GroupDirection.RIGHT); // play with empty group

		return TPromise.as(void 0);
	}
}

export class GridOpenOneEditorAction extends Action {

	static readonly ID = 'workbench.action.gridOpenOneEditor';
	static readonly LABEL = localize('gridOpenOneEditor', "Grid: Open One Editor");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private legacyEditorService: IWorkbenchEditorService,
		@INextEditorGroupsService private nextEditorGroupsService: INextEditorGroupsService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		const path = join(process.cwd(), 'src/vs/workbench/browser/parts/editor/editor.contribution.ts');
		this.nextEditorGroupsService.activeGroup.openEditor(this.legacyEditorService.createInput({ resource: URI.file(path) }) as EditorInput);

		return TPromise.as(void 0);
	}
}

export class GridCloseActiveEditorAction extends Action {

	static readonly ID = 'workbench.action.gridCloseActiveEditor';
	static readonly LABEL = localize('gridCloseActiveEditor', "Grid: Close Active Editor");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService private nextEditorGroupsService: INextEditorGroupsService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		this.nextEditorGroupsService.activeGroup.closeEditor();

		return TPromise.as(void 0);
	}
}

export class GridRemoveActiveGroupAction extends Action {

	static readonly ID = 'workbench.action.gridRemoveActiveGroup';
	static readonly LABEL = localize('gridRemoveActiveGroup', "Grid: Remove Active Group");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService private nextEditorGroupsService: INextEditorGroupsService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		this.nextEditorGroupsService.removeGroup(this.nextEditorGroupsService.activeGroup);

		return TPromise.as(void 0);
	}
}