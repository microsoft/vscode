/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { INextEditorPartService } from 'vs/workbench/services/editor/common/nextEditorPartService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
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
		@INextEditorPartService private nextEditorPartService: INextEditorPartService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		return this.nextEditorPartService.openEditor(this.legacyEditorService.createInput({ resource: URI.file('/Users/bpasero/Development/monaco/src/vs/workbench/browser/parts/editor2/nextEditorActions.ts') }) as EditorInput, EditorOptions.create({ pinned: true })).then(() => {
			return this.nextEditorPartService.openEditor(this.legacyEditorService.createInput({ resource: URI.file('/Users/bpasero/Development/monaco/src/vs/workbench/browser/parts/editor2/nextEditorPart.ts') }) as EditorInput, EditorOptions.create({ pinned: true })).then(() => {
				return this.nextEditorPartService.openEditor(this.legacyEditorService.createInput({ resource: URI.file('/Users/bpasero/Development/monaco/src/vs/workbench/browser/parts/editor2/nextEditorGroupsViewer.ts') }) as EditorInput, EditorOptions.create({ pinned: true }));
			});
		});
	}
}