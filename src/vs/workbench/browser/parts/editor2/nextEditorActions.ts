/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { INextEditorGroupsService, SplitDirection } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInput } from 'vs/workbench/common/editor';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class NextEditorContribution implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		instantiationService.createInstance(OpenNextEditorAction, OpenNextEditorAction.ID, OpenNextEditorAction.LABEL).run();
	}
}

export class OpenNextEditorAction extends Action {

	static readonly ID = 'workbench.action.openNextEditor';
	static readonly LABEL = localize('openNextEditor', "Next Editor");

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
			'/Users/bpasero/Development/monaco/src/vs/workbench/browser/parts/editor2/nextEditorActions.ts',
			'/Users/bpasero/Development/monaco/src/vs/workbench/browser/parts/editor2/nextEditorPart.ts',
			'/Users/bpasero/Development/monaco/src/vs/workbench/browser/parts/editor2/nextEditorGroupsViewer.ts'
		].map(input => {
			return this.legacyEditorService.createInput({ resource: URI.file(input) }) as EditorInput;
		});

		const firstGroup = this.nextEditorGroupsService.activeGroup;
		firstGroup.openEditor(inputs[0]);

		const secondGroup = this.nextEditorGroupsService.addGroup(firstGroup, SplitDirection.RIGHT);
		secondGroup.openEditor(inputs[1]);

		const thirdGroup = this.nextEditorGroupsService.addGroup(secondGroup, SplitDirection.DOWN);
		thirdGroup.openEditor(inputs[2]);

		return TPromise.as(void 0);
	}
}