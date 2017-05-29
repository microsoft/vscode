/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { JSONScanner, createScanner as createJSONScanner, SyntaxKind as JSONSyntaxKind } from 'vs/base/common/json';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export interface InsertSnippetResult {
	position: Position;
	prepend: string;
	append: string;
}

export class SmartSnippetInserter {

	private static hasOpenBrace(scanner: JSONScanner): boolean {

		while (scanner.scan() !== JSONSyntaxKind.EOF) {
			let kind = scanner.getToken();

			if (kind === JSONSyntaxKind.OpenBraceToken) {
				return true;
			}
		}

		return false;
	}

	private static offsetToPosition(model: editorCommon.ITextModel, offset: number): Position {
		let offsetBeforeLine = 0;
		let eolLength = model.getEOL().length;
		let lineCount = model.getLineCount();
		for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
			let lineTotalLength = model.getLineContent(lineNumber).length + eolLength;
			let offsetAfterLine = offsetBeforeLine + lineTotalLength;

			if (offsetAfterLine > offset) {
				return new Position(
					lineNumber,
					offset - offsetBeforeLine + 1
				);
			}
			offsetBeforeLine = offsetAfterLine;
		}
		return new Position(
			lineCount,
			model.getLineMaxColumn(lineCount)
		);
	}

	public static insertSnippet(model: editorCommon.ITextModel, _position: Position): InsertSnippetResult {

		let desiredPosition = model.getValueLengthInRange(new Range(1, 1, _position.lineNumber, _position.column));

		// <INVALID> [ <BEFORE_OBJECT> { <INVALID> } <AFTER_OBJECT>, <BEFORE_OBJECT> { <INVALID> } <AFTER_OBJECT> ] <INVALID>
		enum State {
			INVALID = 0,
			AFTER_OBJECT = 1,
			BEFORE_OBJECT = 2,
		}
		let currentState = State.INVALID;
		let lastValidPos = -1;
		let lastValidState = State.INVALID;

		let scanner = createJSONScanner(model.getValue());
		let arrayLevel = 0;
		let objLevel = 0;

		let checkRangeStatus = (pos: number, state: State) => {
			if (state !== State.INVALID && arrayLevel === 1 && objLevel === 0) {
				currentState = state;
				lastValidPos = pos;
				lastValidState = state;
			} else {
				if (currentState !== State.INVALID) {
					currentState = State.INVALID;
					lastValidPos = scanner.getTokenOffset();
				}
			}
		};

		while (scanner.scan() !== JSONSyntaxKind.EOF) {
			let currentPos = scanner.getPosition();
			let kind = scanner.getToken();

			let goodKind = false;
			switch (kind) {
				case JSONSyntaxKind.OpenBracketToken:
					goodKind = true;
					arrayLevel++;
					checkRangeStatus(currentPos, State.BEFORE_OBJECT);
					break;
				case JSONSyntaxKind.CloseBracketToken:
					goodKind = true;
					arrayLevel--;
					checkRangeStatus(currentPos, State.INVALID);
					break;
				case JSONSyntaxKind.CommaToken:
					goodKind = true;
					checkRangeStatus(currentPos, State.BEFORE_OBJECT);
					break;
				case JSONSyntaxKind.OpenBraceToken:
					goodKind = true;
					objLevel++;
					checkRangeStatus(currentPos, State.INVALID);
					break;
				case JSONSyntaxKind.CloseBraceToken:
					goodKind = true;
					objLevel--;
					checkRangeStatus(currentPos, State.AFTER_OBJECT);
					break;
				case JSONSyntaxKind.Trivia:
				case JSONSyntaxKind.LineBreakTrivia:
					goodKind = true;
			}

			if (currentPos >= desiredPosition && (currentState !== State.INVALID || lastValidPos !== -1)) {
				let acceptPosition: number;
				let acceptState: State;

				if (currentState !== State.INVALID) {
					acceptPosition = (goodKind ? currentPos : scanner.getTokenOffset());
					acceptState = currentState;
				} else {
					acceptPosition = lastValidPos;
					acceptState = lastValidState;
				}

				if (acceptState as State === State.AFTER_OBJECT) {
					return {
						position: this.offsetToPosition(model, acceptPosition),
						prepend: ',',
						append: ''
					};
				} else {
					scanner.setPosition(acceptPosition);
					return {
						position: this.offsetToPosition(model, acceptPosition),
						prepend: '',
						append: this.hasOpenBrace(scanner) ? ',' : ''
					};
				}
			}
		}

		// no valid position found!
		let modelLineCount = model.getLineCount();
		return {
			position: new Position(modelLineCount, model.getLineMaxColumn(modelLineCount)),
			prepend: '\n[',
			append: ']'
		};
	}
}
