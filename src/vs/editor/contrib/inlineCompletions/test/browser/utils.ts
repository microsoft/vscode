/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { CoreEditingCommands, CoreNavigationCommands } from 'vs/editor/browser/coreCommands';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { InlineCompletion, InlineCompletionContext, InlineCompletionsProvider } from 'vs/editor/common/languages';
import { ITestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsModel';
import { autorun } from 'vs/base/common/observable';
import { SingleTextEdit } from 'vs/editor/contrib/inlineCompletions/browser/singleTextEdit';
import { Range } from 'vs/editor/common/core/range';
import { TextModel } from 'vs/editor/common/model/textModel';

export class MockInlineCompletionsProvider implements InlineCompletionsProvider {
	private returnValue: InlineCompletion[] = [];
	private delayMs: number = 0;

	private callHistory = new Array<unknown>();
	private calledTwiceIn50Ms = false;

	public setReturnValue(value: InlineCompletion | undefined, delayMs: number = 0): void {
		this.returnValue = value ? [value] : [];
		this.delayMs = delayMs;
	}

	public setReturnValues(values: InlineCompletion[], delayMs: number = 0): void {
		this.returnValue = values;
		this.delayMs = delayMs;
	}

	public getAndClearCallHistory() {
		const history = [...this.callHistory];
		this.callHistory = [];
		return history;
	}

	public assertNotCalledTwiceWithin50ms() {
		if (this.calledTwiceIn50Ms) {
			throw new Error('provideInlineCompletions has been called at least twice within 50ms. This should not happen.');
		}
	}

	private lastTimeMs: number | undefined = undefined;

	async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken) {
		const currentTimeMs = new Date().getTime();
		if (this.lastTimeMs && currentTimeMs - this.lastTimeMs < 50) {
			this.calledTwiceIn50Ms = true;
		}
		this.lastTimeMs = currentTimeMs;

		this.callHistory.push({
			position: position.toString(),
			triggerKind: context.triggerKind,
			text: model.getValue()
		});
		const result = new Array<InlineCompletion>();
		result.push(...this.returnValue);

		if (this.delayMs > 0) {
			await timeout(this.delayMs);
		}

		return { items: result };
	}
	freeInlineCompletions() { }
	handleItemDidShow() { }
}

export class GhostTextContext extends Disposable {
	public readonly prettyViewStates = new Array<string | undefined>();
	private _currentPrettyViewState: string | undefined;
	public get currentPrettyViewState() {
		return this._currentPrettyViewState;
	}

	constructor(model: InlineCompletionsModel, private readonly editor: ITestCodeEditor) {
		super();

		this._register(autorun(reader => {
			/** @description update */
			const ghostText = model.ghostText.read(reader);
			let view: string | undefined;
			if (ghostText) {
				view = ghostText.render(this.editor.getValue(), true);
			} else {
				view = this.editor.getValue();
			}

			if (this._currentPrettyViewState !== view) {
				this.prettyViewStates.push(view);
			}
			this._currentPrettyViewState = view;
		}));
	}

	public getAndClearViewStates(): (string | undefined)[] {
		const arr = [...this.prettyViewStates];
		this.prettyViewStates.length = 0;
		return arr;
	}

	public keyboardType(text: string): void {
		this.editor.trigger('keyboard', 'type', { text });
	}

	public cursorUp(): void {
		CoreNavigationCommands.CursorUp.runEditorCommand(null, this.editor, null);
	}

	public cursorRight(): void {
		CoreNavigationCommands.CursorRight.runEditorCommand(null, this.editor, null);
	}

	public cursorLeft(): void {
		CoreNavigationCommands.CursorLeft.runEditorCommand(null, this.editor, null);
	}

	public cursorDown(): void {
		CoreNavigationCommands.CursorDown.runEditorCommand(null, this.editor, null);
	}

	public cursorLineEnd(): void {
		CoreNavigationCommands.CursorLineEnd.runEditorCommand(null, this.editor, null);
	}

	public leftDelete(): void {
		CoreEditingCommands.DeleteLeft.runEditorCommand(null, this.editor, null);
	}
}

function randomSimpleStringGenerator(stringLength: number): string {
	let randomText: string = '';
	const possibleCharacters: string = ' abcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < stringLength; i++) {
		randomText += possibleCharacters.charAt(Math.floor(Math.random() * possibleCharacters.length));

	}
	return randomText;
}

function generateUniqueRandomIntegers(numberOfIntegers: number, minimum: number, maximum: number): number[] {
	if (maximum - minimum + 1 < numberOfIntegers) {
		throw new Error('Too many integers to sample, specified');
	}
	const integers = [];
	while (integers.length < numberOfIntegers) {
		const integer = Math.floor(Math.random() * maximum) + 1;
		if (integers.indexOf(integer) === -1) {
			integers.push(integer);
		}
	}
	return integers;
}

export function randomMultilineStringGenerator(numberOfLines: number, maximumLengthOfLines: number = 20): string {
	let randomText: string = '';
	for (let i = 0; i < numberOfLines; i++) {
		const lengthOfLine = Math.floor(Math.random() * maximumLengthOfLines);
		randomText += randomSimpleStringGenerator(Math.floor(Math.random() * lengthOfLine)) + '\n';
	}
	return randomText;
}

export function generateRandomDisjointEdits(numberOfEdits: number, model: TextModel) {
	const numberOfLines = model.getLineCount();
	if (2 * numberOfEdits > numberOfLines) {
		throw new Error('Too many edits specified');
	}
	const edits = [];
	const boundsOfEdits = generateUniqueRandomIntegers(2 * numberOfEdits, 0, numberOfLines - 1).sort((a, b) => a - b);
	for (let i = 0; i < numberOfEdits; i++) {
		const startLine = boundsOfEdits[2 * i];
		const endLine = boundsOfEdits[2 * i + 1];
		const startColumn = model.getLineLength(startLine) ? generateUniqueRandomIntegers(1, 1, model.getLineLength(startLine))[0] : 1;
		const endColumn = model.getLineLength(endLine) ? generateUniqueRandomIntegers(1, 1, model.getLineLength(endLine))[0] : 1;
		const numberOfLinesEditText = generateUniqueRandomIntegers(1, 0, 3)[0];
		edits.push(new SingleTextEdit(new Range(startLine, startColumn, endLine, endColumn), randomMultilineStringGenerator(numberOfLinesEditText, 10)));
	}
	return edits;
}
