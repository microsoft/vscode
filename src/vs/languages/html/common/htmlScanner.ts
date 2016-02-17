/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {isTag, DELIM_END, DELIM_START, DELIM_ASSIGN, ATTRIB_NAME, ATTRIB_VALUE} from 'vs/languages/html/common/htmlTokenTypes';

import EditorCommon = require('vs/editor/common/editorCommon');

export interface IHTMLScanner {
	getTokenType(): string;
	isOpenBrace(): boolean;
	isAtTokenStart(): boolean;
	isAtTokenEnd(): boolean;
	getTokenContent(): string;
	scanBack() : boolean;
	scanForward() : boolean;
	getTokenPosition(): EditorCommon.IPosition;
	getTokenRange(): EditorCommon.IRange;
	getModel(): EditorCommon.ITokenizedModel;
}

function isDelimiter(tokenType: string) {
	switch (tokenType) {
		case DELIM_START:
		case DELIM_END:
		case DELIM_ASSIGN:
			return true;
	}
	return false;
}

function isInterestingToken(tokenType: string) {
	switch (tokenType) {
		case DELIM_START:
		case DELIM_END:
		case DELIM_ASSIGN:
		case ATTRIB_NAME:
		case ATTRIB_VALUE:
			return true;
	}
	return isTag(tokenType);
}

export function getScanner(model: EditorCommon.ITokenizedModel, position:EditorCommon.IPosition) : IHTMLScanner {

	var lineOffset = position.column - 1;
	var currentLine = position.lineNumber;

	var tokens = model.getLineTokens(currentLine);
	var lineContent = model.getLineContent(currentLine);
	var tokenIndex = tokens.findIndexOfOffset(lineOffset);
	var tokensOnLine = tokens.getTokenCount();

	var tokenType = tokens.getTokenType(tokenIndex);
	var tokenStart = tokens.getTokenStartIndex(tokenIndex);
	var tokenEnd = tokens.getTokenEndIndex(tokenIndex, lineContent.length);

	if ((tokenType === '' || isDelimiter(tokenType)) && tokenStart === lineOffset) {
		tokenIndex--;
		if (tokenIndex >= 0) {
			// we are at the end of a different token
			tokenType = tokens.getTokenType(tokenIndex);
			tokenStart = tokens.getTokenStartIndex(tokenIndex);
			tokenEnd = tokens.getTokenEndIndex(tokenIndex, lineContent.length);
		} else {
			tokenType = '';
			tokenStart = tokenEnd = 0;
		}
	}

	return {
		getTokenType: () => tokenType,
		isAtTokenEnd: () => lineOffset === tokenEnd,
		isAtTokenStart: () => lineOffset === tokenStart,
		getTokenContent: () => lineContent.substring(tokenStart, tokenEnd),
		isOpenBrace: () => tokenStart < tokenEnd && lineContent.charAt(tokenStart) === '<',
		getTokenPosition: () => <EditorCommon.IPosition> { lineNumber: currentLine, column: tokenStart + 1 },
		getTokenRange: () => <EditorCommon.IRange> { startLineNumber: currentLine, startColumn: tokenStart + 1, endLineNumber: currentLine, endColumn: tokenEnd + 1 },
		getModel: () => model,
		scanBack: () => {
			if (currentLine <= 0) {
				return false;
			}

			tokenIndex--;
			do {
				while (tokenIndex >= 0) {
					tokenType = tokens.getTokenType(tokenIndex);
					tokenStart = tokens.getTokenStartIndex(tokenIndex);
					tokenEnd = tokens.getTokenEndIndex(tokenIndex, lineContent.length);

					if (isInterestingToken(tokenType)) {
						return true;
					}
					tokenIndex--;
				}
				currentLine--;
				if (currentLine > 0) {
					tokens = model.getLineTokens(currentLine);
					lineContent = model.getLineContent(currentLine);
					tokensOnLine = tokens.getTokenCount();
					tokenIndex = tokensOnLine - 1;
				}
			} while (currentLine > 0);
			tokens = null;
			tokenType = lineContent = '';
			tokenStart = tokenEnd = tokensOnLine = 0;
			return false;
		},
		scanForward: () => {
			if (currentLine > model.getLineCount()) {
				return false;
			}

			tokenIndex++;
			do {
				while (tokenIndex < tokensOnLine) {
					tokenType = tokens.getTokenType(tokenIndex);
					tokenStart = tokens.getTokenStartIndex(tokenIndex);
					tokenEnd = tokens.getTokenEndIndex(tokenIndex, lineContent.length);

					if (isInterestingToken(tokenType)) {
						return true;
					}
					tokenIndex++;
				}
				currentLine++;
				tokenIndex = 0;
				if (currentLine <= model.getLineCount()) {
					tokens = model.getLineTokens(currentLine);
					lineContent = model.getLineContent(currentLine);
					tokensOnLine = tokens.getTokenCount();
				}
			} while (currentLine <= model.getLineCount());
			tokenType = lineContent = '';
			tokenStart = tokenEnd = tokensOnLine = 0;
			return false;
		}
	};
}