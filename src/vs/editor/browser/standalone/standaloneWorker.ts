/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {ErrorCallback, TPromise, ValueCallback} from 'vs/base/common/winjs.base';
import {IRequestHandler} from 'vs/base/common/worker/simpleWorker';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {IRawModelData} from 'vs/editor/common/services/editorSimpleWorkerCommon';
import {createMonacoBaseAPI} from 'vs/editor/common/standalone/standaloneBase';

export class MirrorModel extends MirrorModel2 {

	public get uri(): URI {
		return this._uri;
	}

	public get version(): number {
		return this._versionId;
	}

	public getLinesContent(): string[] {
		return this._lines.slice(0);
	}

	public getLineCount(): number {
		return this._lines.length;
	}

	public getLineContent(lineNumber:number): string {
		return this._lines[lineNumber - 1];
	}

	public getWordAtPosition(position:editorCommon.IPosition, wordDefinition:RegExp): Range {

		let wordAtText = WordHelper._getWordAtText(
			position.column,
			WordHelper.ensureValidWordDefinition(wordDefinition),
			this._lines[position.lineNumber - 1],
			0
		);

		if (wordAtText) {
			return new Range(position.lineNumber, wordAtText.startColumn, position.lineNumber, wordAtText.endColumn);
		}

		return null;
	}

	public getWordUntilPosition(position: editorCommon.IPosition, wordDefinition:RegExp): editorCommon.IWordAtPosition {
		var wordAtPosition = this.getWordAtPosition(position, wordDefinition);
		if (!wordAtPosition) {
			return {
				word: '',
				startColumn: position.column,
				endColumn: position.column
			};
		}
		return {
			word: this._lines[position.lineNumber - 1].substring(wordAtPosition.startColumn - 1, position.column - 1),
			startColumn: wordAtPosition.startColumn,
			endColumn: position.column
		};
	}

	private _getAllWords(wordDefinition:RegExp): string[] {
		var result:string[] = [];
		this._lines.forEach((line) => {
			this._wordenize(line, wordDefinition).forEach((info) => {
				result.push(line.substring(info.start, info.end));
			});
		});
		return result;
	}

	public getAllUniqueWords(wordDefinition:RegExp, skipWordOnce?:string) : string[] {
		var foundSkipWord = false;
		var uniqueWords = {};
		return this._getAllWords(wordDefinition).filter((word) => {
			if (skipWordOnce && !foundSkipWord && skipWordOnce === word) {
				foundSkipWord = true;
				return false;
			} else if (uniqueWords[word]) {
				return false;
			} else {
				uniqueWords[word] = true;
				return true;
			}
		});
	}

//	// TODO@Joh, TODO@Alex - remove these and make sure the super-things work
	private _wordenize(content:string, wordDefinition:RegExp): editorCommon.IWordRange[] {
		var result:editorCommon.IWordRange[] = [];
		var match:RegExpExecArray;
		while (match = wordDefinition.exec(content)) {
			if (match[0].length === 0) {
				// it did match the empty string
				break;
			}
			result.push({ start: match.index, end: match.index + match[0].length });
		}
		return result;
	}

	public getValueInRange(range:editorCommon.IRange): string {
		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].substring(range.startColumn - 1, range.endColumn - 1);
		}

		var lineEnding = this._eol,
			startLineIndex = range.startLineNumber - 1,
			endLineIndex = range.endLineNumber - 1,
			resultLines:string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.startColumn - 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}
}

export class StandaloneWorker /*extends EditorSimpleWorker*/ implements IRequestHandler {
	_requestHandlerTrait: any;

	private _models:{[uri:string]:MirrorModel;};
	private _foreignModule: any;

	constructor() {
		// super();
		this._models = Object.create(null);
		this._foreignModule = null;
	}

	public getModels(): MirrorModel[] {
		let all: MirrorModel[] = [];
		Object.keys(this._models).forEach((key) => all.push(this._models[key]));
		return all;
	}

	public acceptNewModel(data:IRawModelData): void {
		this._models[data.url] = new MirrorModel(URI.parse(data.url), data.value.lines, data.value.EOL, data.versionId);
	}

	public acceptModelChanged(strURL: string, events: editorCommon.IModelContentChangedEvent2[]): void {
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

	public loadModule(moduleId:string): TPromise<string[]> {
		let cc: ValueCallback;
		let ee: ErrorCallback;
		let r = new TPromise<any>((c, e, p) => {
			cc = c;
			ee = e;
		});

		require([moduleId], (foreignModule) => {
			this._foreignModule = foreignModule.create();

			let methods: string[] = [];
			for (let prop in this._foreignModule) {
				if (typeof this._foreignModule[prop] === 'function') {
					methods.push(prop);
				}
			}

			cc(methods);

		}, ee);

		return r;
	}

	// foreign method request
	public fmr(method:string, args:any[]): TPromise<any> {
		if (!this._foreignModule || typeof this._foreignModule[method] !== 'function') {
			return TPromise.wrapError(new Error('Missing requestHandler or method: ' + method));
		}

		try {
			return TPromise.as(this._foreignModule[method].apply(this._foreignModule, args));
		} catch (e) {
			return TPromise.wrapError(e);
		}
	}
}

const standaloneWorker = new StandaloneWorker();

/**
 * Called on the worker side
 */
export function create(): IRequestHandler {
	return standaloneWorker;
}

function createMonacoWorkerAPI(): typeof monaco.worker {
	return {
		get mirrorModels () {
			return standaloneWorker.getModels();
		}
	};
}

var global:any = self;
global.monaco = createMonacoBaseAPI();
global.monaco.worker = createMonacoWorkerAPI();
