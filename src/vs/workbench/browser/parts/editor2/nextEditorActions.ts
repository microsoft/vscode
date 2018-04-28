/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { INextEditorGroupsService, Direction } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInput } from 'vs/workbench/common/editor';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { join } from 'vs/base/common/paths';

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
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/editor2.contribution.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextEditorActions.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextEditorGroupView.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextEditorPart.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextNoTabsTitleControl.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextTabsTitleControl.ts'),
			join(process.cwd(), 'src/vs/workbench/browser/parts/editor2/nextTitleControl.ts')
		].map(input => {
			return this.legacyEditorService.createInput({ resource: URI.file(input) }) as EditorInput;
		});

		setTimeout(() => {
			const firstGroup = this.nextEditorGroupsService.activeGroup;
			firstGroup.openEditor(inputs[0], { pinned: true });
			firstGroup.openEditor(inputs[1], { pinned: true });
			firstGroup.openEditor(inputs[2], { pinned: true });

			const secondGroup = this.nextEditorGroupsService.addGroup(firstGroup, Direction.DOWN);
			secondGroup.openEditor(inputs[3], { pinned: true });
			secondGroup.openEditor(inputs[4], { pinned: true });

			const thirdGroup = this.nextEditorGroupsService.addGroup(secondGroup, Direction.RIGHT);
			thirdGroup.openEditor(inputs[5], { pinned: true });
			thirdGroup.openEditor(inputs[6], { pinned: true });
		}, 0);

		return TPromise.as(void 0);
	}
}