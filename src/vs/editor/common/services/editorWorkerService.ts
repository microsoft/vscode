/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChange, ILineChange } from 'vs/editor/common/editorCommon';
import { IInplaceReplaceSupportResult, TextEdit } from 'vs/editor/common/modes';
import { IRange } from 'vs/editor/common/core/range';

export var ID_EDITOR_WORKER_SERVICE = 'editorWorkerService';
export var IEditorWorkerService = createDecorator<IEditorWorkerService>(ID_EDITOR_WORKER_SERVICE);

export interface IEditorWorkerService {
	_serviceBrand: any;

	canComputeDiff(original: URI, modified: URI): boolean;
	computeDiff(original: URI, modified: URI, ignoreTrimWhitespace: boolean): TPromise<ILineChange[]>;

	canComputeDirtyDiff(original: URI, modified: URI): boolean;
	computeDirtyDiff(original: URI, modified: URI, ignoreTrimWhitespace: boolean): TPromise<IChange[]>;

	computeMoreMinimalEdits(resource: URI, edits: TextEdit[], ranges: IRange[]): TPromise<TextEdit[]>;

	canNavigateValueSet(resource: URI): boolean;
	navigateValueSet(resource: URI, range: IRange, up: boolean): TPromise<IInplaceReplaceSupportResult>;
}
