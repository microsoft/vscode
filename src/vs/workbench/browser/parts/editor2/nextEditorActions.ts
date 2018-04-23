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
import { EditorInput } from 'vs/workbench/common/editor';

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
		const input = this.legacyEditorService.createInput({ resource: URI.file('') });

		return this.nextEditorPartService.openEditor(input as EditorInput);
	}
}