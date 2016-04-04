/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import json = require('vs/base/common/json');
import Modes = require('vs/editor/common/modes');
import jsonTokenTypes = require('vs/languages/json/common/features/jsonTokenTypes');

export function createTokenizationSupport(mode:Modes.IMode, supportComments:boolean):Modes.ITokenizationSupport {
	return {
		shouldGenerateEmbeddedModels: false,
		getInitialState: () => new JSONState(mode, null, null, false),
		tokenize: (line, state, offsetDelta?, stopAtOffset?) => tokenize(mode, supportComments, line, <JSONState> state, offsetDelta, stopAtOffset)
	};
}

class JSONState implements Modes.IState {

	private _mode: Modes.IMode;
	private _state: Modes.IState;

	public scanError: json.ScanError;
	public lastWasColon: boolean;

	constructor(mode: Modes.IMode, state: Modes.IState, scanError: json.ScanError, lastWasColon:boolean) {
		this._mode = mode;
		this._state = state;
		this.scanError = scanError;
		this.lastWasColon = lastWasColon;
	}

	public clone():JSONState {
		return new JSONState(this._mode, this._state, this.scanError, this.lastWasColon);
	}

	public equals(other:Modes.IState):boolean {
		if(other === this) {
			return true;
		}
		if(!other || !(other instanceof JSONState)) {
			return false;
		}
		return this.scanError === (<JSONState> other).scanError &&
			this.lastWasColon === (<JSONState> other).lastWasColon;
	}

	public getMode():Modes.IMode {
		return this._mode;
	}

	public tokenize(stream:any):Modes.ITokenizationResult {
		throw new Error();
	}

	public getStateData():Modes.IState {
		return this._state;
	}

	public setStateData(state:Modes.IState):void {
		this._state = state;
	}
}

function tokenize(mode:Modes.IMode, comments:boolean, line:string, state:JSONState, offsetDelta:number = 0, stopAtOffset?:number):Modes.ILineTokens {

	// handle multiline strings and block comments
	var numberOfInsertedCharacters = 0,
		adjustOffset = false;

	switch(state.scanError) {
		case json.ScanError.UnexpectedEndOfString:
			line = '"' + line;
			numberOfInsertedCharacters = 1;
			break;
		case json.ScanError.UnexpectedEndOfComment:
			line = '/*' + line;
			numberOfInsertedCharacters = 2;
			break;
	}

	var scanner = json.createScanner(line),
		kind: json.SyntaxKind,
		ret:Modes.ILineTokens,
		lastWasColon = state.lastWasColon;

	ret = {
		tokens: <Modes.IToken[]>[],
		actualStopOffset: line.length,
		endState: state.clone(),
		modeTransitions: [{ startIndex: 0, mode: mode }],
	};

	while(true) {

		var offset = offsetDelta + scanner.getPosition(),
			type = '';

		kind = scanner.scan();
		if(kind === json.SyntaxKind.EOF) {
			break;
		}

		// Check that the scanner has advanced
		if (offset === offsetDelta + scanner.getPosition()) {
			throw new Error('Scanner did not advance, next 3 characters are: ' + line.substr(scanner.getPosition(), 3));
		}

		// In case we inserted /* or " character, we need to
		// adjust the offset of all tokens (except the first)
		if(adjustOffset) {
			offset -= numberOfInsertedCharacters;
		}
		adjustOffset = numberOfInsertedCharacters > 0;


		// brackets and type
		switch(kind) {
			case json.SyntaxKind.OpenBraceToken:
				type = jsonTokenTypes.TOKEN_DELIM_OBJECT;
				lastWasColon = false;
				break;
			case json.SyntaxKind.CloseBraceToken:
				type = jsonTokenTypes.TOKEN_DELIM_OBJECT;
				lastWasColon = false;
				break;
			case json.SyntaxKind.OpenBracketToken:
				type = jsonTokenTypes.TOKEN_DELIM_ARRAY;
				lastWasColon = false;
				break;
			case json.SyntaxKind.CloseBracketToken:
				type = jsonTokenTypes.TOKEN_DELIM_ARRAY;
				lastWasColon = false;
				break;
			case json.SyntaxKind.ColonToken:
				type = jsonTokenTypes.TOKEN_DELIM_COLON;
				lastWasColon = true;
				break;
			case json.SyntaxKind.CommaToken:
				type = jsonTokenTypes.TOKEN_DELIM_COMMA;
				lastWasColon = false;
				break;
			case json.SyntaxKind.TrueKeyword:
			case json.SyntaxKind.FalseKeyword:
				type = jsonTokenTypes.TOKEN_VALUE_BOOLEAN;
				lastWasColon = false;
				break;
			case json.SyntaxKind.NullKeyword:
				type = jsonTokenTypes.TOKEN_VALUE_NULL;
				lastWasColon = false;
				break;
			case json.SyntaxKind.StringLiteral:
				type = lastWasColon ? jsonTokenTypes.TOKEN_VALUE_STRING : jsonTokenTypes.TOKEN_PROPERTY_NAME;
				lastWasColon = false;
				break;
			case json.SyntaxKind.NumericLiteral:
				type = jsonTokenTypes.TOKEN_VALUE_NUMBER;
				lastWasColon = false;
				break;
		}

		// comments, iff enabled
		if(comments) {
			switch (kind) {
				case json.SyntaxKind.LineCommentTrivia:
					type = jsonTokenTypes.TOKEN_COMMENT_LINE;
					break;
				case json.SyntaxKind.BlockCommentTrivia:
					type = jsonTokenTypes.TOKEN_COMMENT_BLOCK;
					break;
			}
		}

		ret.endState = new JSONState(state.getMode(), state.getStateData(), scanner.getTokenError(), lastWasColon);
		ret.tokens.push({
			startIndex: offset,
			type: type
		});
	}

	return ret;
}