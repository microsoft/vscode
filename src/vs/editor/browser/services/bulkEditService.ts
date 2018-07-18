/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { WorkspaceEdit } from 'vs/editor/common/modes';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditor } from '../editorBrowser';
import { IProgressRunner } from 'vs/platform/progress/common/progress';

export const IBulkEditService = createDecorator<IBulkEditService>('IWorkspaceEditService');


export interface IBulkEditOptions {
	editor?: ICodeEditor;
	progress?: IProgressRunner;
}

export interface IBulkEditResult {
	ariaSummary: string;
}

export interface IBulkEditService {
	_serviceBrand: any;

	apply(edit: WorkspaceEdit, options: IBulkEditOptions): TPromise<IBulkEditResult>;
}

