/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {TPromise} from 'vs/base/common/winjs.base';
import {IRequestHandler} from 'vs/base/common/worker/simpleWorker';
import {EditorSimpleWorker, IRawModelData} from 'vs/editor/common/services/editorSimpleWorkerCommon';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import URI from 'vs/base/common/uri';
import {DiffComputer} from 'vs/editor/common/diff/diffComputer';

class MirrorModel extends MirrorModel2 {

	public getLinesContent(): string[] {
		return this._lines.slice(0);
	}

}

export class EditorSimpleWorkerImpl extends EditorSimpleWorker implements IRequestHandler {
	_requestHandlerTrait: any;

	private _models:{[uri:string]:MirrorModel;};

	constructor() {
		super();
		this._models = Object.create(null);
	}

	public acceptNewModel(data:IRawModelData): void {
		this._models[data.url] = new MirrorModel(URI.parse(data.url), data.value.lines, data.value.EOL, data.versionId);
	}

	public acceptModelChanged(strURL: string, events: EditorCommon.IModelContentChangedEvent2[]): void {
		if (!this._models[strURL]) {
			return;
		}
		let model = this._models[strURL];
		model.onEvents(events);
	}

	public acceptRemovedModel(strURL: string): void {
		if (!this._models[strURL]) {
			return;
		}
		delete this._models[strURL];
	}

	// ---- BEGIN diff --------------------------------------------------------------------------

	public computeDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean): TPromise<EditorCommon.ILineChange[]> {
		let original = this._models[originalUrl];
		let modified = this._models[modifiedUrl];
		if (!original || !modified) {
			return null;
		}

		let originalLines = original.getLinesContent();
		let modifiedLines = modified.getLinesContent();
		let diffComputer = new DiffComputer(originalLines, modifiedLines, {
			shouldPostProcessCharChanges: true,
			shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
			shouldConsiderTrimWhitespaceInEmptyCase: true
		});
		return TPromise.as(diffComputer.computeDiff());
	}

	public computeDirtyDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]> {
		let original = this._models[originalUrl];
		let modified = this._models[modifiedUrl];
		if (!original || !modified) {
			return null;
		}

		let originalLines = original.getLinesContent();
		let modifiedLines = modified.getLinesContent();
		let diffComputer = new DiffComputer(originalLines, modifiedLines, {
			shouldPostProcessCharChanges: false,
			shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
			shouldConsiderTrimWhitespaceInEmptyCase: false
		});
		return TPromise.as(diffComputer.computeDiff());
	}

	// ---- END diff --------------------------------------------------------------------------
}

/**
 * Called on the worker side
 */
export function create(): IRequestHandler {
	return new EditorSimpleWorkerImpl();
}
