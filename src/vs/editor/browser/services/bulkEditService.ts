/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { WorkspaceEdit } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';

export const IBulkEditService = createDecorator<IBulkEditService>('IWorkspaceEditService');


export interface IBulkEditOptions {
	editor?: ICodeEditor;
	progress?: IProgress<IProgressStep>;
}

export interface IBulkEditResult {
	ariaSummary: string;
}

export interface IBulkEditService {
	_serviceBrand: any;

	apply(edit: WorkspaceEdit, options?: IBulkEditOptions): Promise<IBulkEditResult>;
}

