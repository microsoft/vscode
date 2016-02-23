/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IInplaceReplaceSupportResult, ILink, ISuggestResult} from 'vs/editor/common/modes';

export interface IRawModelData {
	url:string;
	versionId:number;
	value:editorCommon.IRawText;
}

export abstract class EditorSimpleWorker {

	public acceptNewModel(data:IRawModelData): void {
		throw new Error('Not implemented!');
	}

	public acceptModelChanged(modelUrl: string, events: editorCommon.IModelContentChangedEvent2[]): void {
		throw new Error('Not implemented!');
	}

	public acceptRemovedModel(modelUrl: string): void {
		throw new Error('Not implemented!');
	}

	public computeDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean):TPromise<editorCommon.ILineChange[]> {
		throw new Error('Not implemented!');
	}

	public computeDirtyDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean):TPromise<editorCommon.IChange[]> {
		throw new Error('Not implemented!');
	}

	public computeLinks(modelUrl:string):TPromise<ILink[]> {
		throw new Error('Not implemented!');
	}

	public textualSuggest(modelUrl:string, position: editorCommon.IPosition, wordDef:string, wordDefFlags:string): TPromise<ISuggestResult[]> {
		throw new Error('Not implemented!');
	}

	public navigateValueSet(modelUrl:string, range:editorCommon.IRange, up:boolean, wordDef:string, wordDefFlags:string): TPromise<IInplaceReplaceSupportResult> {
		throw new Error('Not implemented!');
	}
}
