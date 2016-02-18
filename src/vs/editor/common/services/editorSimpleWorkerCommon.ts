/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');

export interface IRawModelData {
	url:string;
	versionId:number;
	value:EditorCommon.IRawText;
}

export abstract class EditorSimpleWorker {

	public acceptNewModel(data:IRawModelData): void {
		throw new Error('Not implemented!');
	}

	public acceptModelChanged(modelUrl: string, events: EditorCommon.IModelContentChangedEvent2[]): void {
		throw new Error('Not implemented!');
	}

	public acceptRemovedModel(modelUrl: string): void {
		throw new Error('Not implemented!');
	}

	public computeDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.ILineChange[]> {
		throw new Error('Not implemented!');
	}

	public computeDirtyDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]> {
		throw new Error('Not implemented!');
	}

	public computeLinks(modelUrl:string):TPromise<Modes.ILink[]> {
		throw new Error('Not implemented!');
	}
}
