/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextAreaHandler} from 'vs/editor/common/controller/textAreaHandler';
import * as browser from 'vs/base/browser/browser';
import {TextAreaStrategy, ISimpleModel} from 'vs/editor/common/controller/textAreaState';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {TextAreaWrapper} from 'vs/editor/browser/controller/input/textAreaWrapper';
import {Position} from 'vs/editor/common/core/position';

// To run this test, open imeTester.html

class SingleLineTestModel implements ISimpleModel {

	private _line:string;
	private _eol:string;

	constructor(line:string) {
		this._line = line;
		this._eol = '\n';
	}

	setText(text:string) {
		this._line = text;
	}

	getLineMaxColumn(lineNumber:number): number {
		return this._line.length + 1;
	}

	getEOL(): string {
		return this._eol;
	}

	getValueInRange(range:editorCommon.IRange, eol:editorCommon.EndOfLinePreference): string {
		return this._line.substring(range.startColumn - 1, range.endColumn - 1);
	}

	getModelLineContent(lineNumber:number): string {
		return this._line;
	}

	getLineCount(): number {
		return 1;
	}

	convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): Position {
		return new Position(viewLineNumber, viewColumn);
	}
}

class TestView {

	private _model: SingleLineTestModel;

	constructor(model:SingleLineTestModel) {
		this._model = model;
	}

	public paint(output:HTMLElement) {
		let r = '';
		for (let i = 1; i <= this._model.getLineCount(); i++) {
			let content = this._model.getModelLineContent(i);
			r += content + '<br/>';
		}
		output.innerHTML = r;
	}
}

function doCreateTest(strategy:TextAreaStrategy, inputStr:string, expectedStr:string): HTMLElement {
	let container = document.createElement('div');
	container.className = 'container';

	let title = document.createElement('div');
	title.className = 'title';
	title.innerHTML = 'Type <strong>' + inputStr + '</strong>';
	container.appendChild(title);

	let startBtn = document.createElement('button');
	startBtn.innerHTML = 'Start';
	container.appendChild(startBtn);


	let input = document.createElement('textarea');
	input.setAttribute('rows', '10');
	input.setAttribute('cols', '40');
	container.appendChild(input);

	let textAreaWrapper = new TextAreaWrapper(input);

	let model = new SingleLineTestModel('some  text');

	let handler = new TextAreaHandler(browser, strategy, textAreaWrapper, model, () => {});

	input.onfocus = () => {
		handler.setHasFocus(true);
	};
	input.onblur = () => {
		handler.setHasFocus(false);
	};

	let output = document.createElement('pre');
	output.className = 'output';
	container.appendChild(output);

	let check = document.createElement('pre');
	check.className = 'check';
	container.appendChild(check);

	let view = new TestView(model);


	let cursorOffset: number;
	let cursorLength: number;
	let updatePosition = (off:number, len:number) => {
		cursorOffset = off;
		cursorLength = len;
		handler.setCursorPosition(new Position(1, 1 + cursorOffset + cursorLength));
		handler.setCursorSelections(new Range(1, 1 + cursorOffset, 1, 1 + cursorOffset + cursorLength), []);
		handler.writePlaceholderAndSelectTextAreaSync();
	};

	let updateModelAndPosition = (text:string, off:number, len:number) => {
		model.setText(text);
		updatePosition(off, len);
		view.paint(output);

		let expected = 'some ' + expectedStr + ' text';
		if (text === expected) {
			check.innerHTML = '[GOOD]';
		} else {
			check.innerHTML = '[BAD]';
		}
		check.innerHTML += expected;
	};

	handler.onType((e) => {
		console.log('type text: ' + e.text + ', replaceCharCnt: ' + e.replaceCharCnt);
		let text = model.getModelLineContent(1);
		let preText = text.substring(0, cursorOffset - e.replaceCharCnt);
		let postText = text.substring(cursorOffset + cursorLength);
		let midText = e.text;

		updateModelAndPosition(preText + midText + postText, (preText + midText).length, 0);
	});

	view.paint(output);

	startBtn.onclick = function() {
		updateModelAndPosition('some  text', 5, 0);
		input.focus();
	};

	return container;
}

export function createTest(): void {
	document.body.appendChild(doCreateTest(TextAreaStrategy.NVDA, 'sennsei', 'せんせい'));
}
