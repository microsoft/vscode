/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');

export var ID_EDITOR_WORKER_SERVICE = 'workerService';
export var IEditorWorkerService = createDecorator<IEditorWorkerService>(ID_EDITOR_WORKER_SERVICE);

export interface IEditorWorkerService {
	serviceId: ServiceIdentifier<any>;

	computeDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.ILineChange[]>;
	computeDirtyDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]>;
	computeLinks(resource:URI):TPromise<Modes.ILink[]>;
}
