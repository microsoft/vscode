/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { ignoreBracketsInToken } from 'vs/editor/common/modes/supports';
import { BracketsUtils, RichEditBrackets } from 'vs/editor/common/modes/supports/richEditBrackets';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { LanguageId, StandardTokenType } from 'vs/editor/common/modes';

export const enum TokenTreeBracket {
	None = 0,
	Open = 1,
	Close = -1
}

export class Node {

	start: Position;

	end: Position;

	get range(): Range {
		return new Range(
			this.start.lineNumber,
			this.start.column,
			this.end.lineNumber,
			this.end.column
		);
	}

	parent: Node;
}

export class NodeList extends Node {

	children: Node[];

	get start(): Position {
		return this.hasChildren
			? this.children[0].start
			: this.parent.start;
	}

	get end(): Position {
		return this.hasChildren
			? this.children[this.children.length - 1].end
			: this.parent.end;
	}

	get hasChildren() {
		return this.children && this.children.length > 0;
	}

	get isEmpty() {
		return !this.hasChildren && !this.parent;
	}

	public append(node: Node | null): boolean {
		if (!node) {
			return false;
		}
		node.parent = this;
		if (!this.children) {
			this.children = [];
		}
		if (node instanceof NodeList) {
			if (node.children) {
				this.children.push.apply(this.children, node.children);
			}
		} else {
			this.children.push(node);
		}
		return true;
	}
}

export class Block extends Node {

	open: Node;
	close: Node;
	elements: NodeList;

	get start(): Position {
		return this.open.start;
	}

	get end(): Position {
		return this.close.end;
	}

	constructor() {
		super();
		this.elements = new NodeList();
		this.elements.parent = this;
	}
}

class Token {
	_tokenBrand: void;

	readonly range: Range;
	readonly bracket: TokenTreeBracket;
	readonly bracketType: string | null;

	constructor(range: Range, bracket: TokenTreeBracket, bracketType: string | null) {
		this.range = range;
		this.bracket = bracket;
		this.bracketType = bracketType;
	}
}

function newNode(token: Token): Node {
	let node = new Node();
	node.start = token.range.getStartPosition();
	node.end = token.range.getEndPosition();
	return node;
}

class RawToken {
	_basicTokenBrand: void;

	public lineNumber: number;
	public lineText: string;
	public startOffset: number;
	public endOffset: number;
	public type: StandardTokenType;
	public languageId: LanguageId;

	constructor(source: LineTokens, tokenIndex: number, lineNumber: number) {
		this.lineNumber = lineNumber;
		this.lineText = source.getLineContent();
		this.startOffset = source.getStartOffset(tokenIndex);
		this.endOffset = source.getEndOffset(tokenIndex);
		this.type = source.getStandardTokenType(tokenIndex);
		this.languageId = source.getLanguageId(tokenIndex);
	}
}

class ModelRawTokenScanner {

	private _model: ITextModel;
	private _lineCount: number;
	private _versionId: number;
	private _lineNumber: number;
	private _tokenIndex: number;
	private _lineTokens: LineTokens | null;

	constructor(model: ITextModel) {
		this._model = model;
		this._lineCount = this._model.getLineCount();
		this._versionId = this._model.getVersionId();
		this._lineNumber = 0;
		this._tokenIndex = 0;
		this._lineTokens = null;
		this._advance();
	}

	private _advance(): void {
		if (this._lineTokens) {
			this._tokenIndex++;
			if (this._tokenIndex >= this._lineTokens.getCount()) {
				this._lineTokens = null;
			}
		}

		while (this._lineNumber < this._lineCount && !this._lineTokens) {
			this._lineNumber++;
			this._model.forceTokenization(this._lineNumber);
			this._lineTokens = this._model.getLineTokens(this._lineNumber);
			this._tokenIndex = 0;
			if (this._lineTokens.getLineContent().length === 0) {
				// Skip empty lines
				this._lineTokens = null;
			}
		}
	}

	public next(): RawToken | null {
		if (!this._lineTokens) {
			return null;
		}
		if (this._model.getVersionId() !== this._versionId) {
			return null;
		}

		let result = new RawToken(this._lineTokens, this._tokenIndex, this._lineNumber);
		this._advance();
		return result;
	}
}

class TokenScanner {

	private _rawTokenScanner: ModelRawTokenScanner;
	private _nextBuff: Token[];

	private _cachedLanguageBrackets: RichEditBrackets | null;
	private _cachedLanguageId: LanguageId;

	constructor(model: ITextModel) {
		this._rawTokenScanner = new ModelRawTokenScanner(model);
		this._nextBuff = [];
		this._cachedLanguageBrackets = null;
		this._cachedLanguageId = -1;
	}

	next(): Token | null {
		if (this._nextBuff.length > 0) {
			return this._nextBuff.shift()!;
		}

		const token = this._rawTokenScanner.next();
		if (!token) {
			return null;
		}
		const lineNumber = token.lineNumber;
		const lineText = token.lineText;
		const tokenType = token.type;
		let startOffset = token.startOffset;
		const endOffset = token.endOffset;

		if (this._cachedLanguageId !== token.languageId) {
			this._cachedLanguageId = token.languageId;
			this._cachedLanguageBrackets = LanguageConfigurationRegistry.getBracketsSupport(this._cachedLanguageId);
		}
		const modeBrackets = this._cachedLanguageBrackets;

		if (!modeBrackets || ignoreBracketsInToken(tokenType)) {
			return new Token(
				new Range(lineNumber, startOffset + 1, lineNumber, endOffset + 1),
				TokenTreeBracket.None,
				null
			);
		}

		let foundBracket: Range | null;
		do {
			foundBracket = BracketsUtils.findNextBracketInToken(modeBrackets.forwardRegex, lineNumber, lineText, startOffset, endOffset);
			if (foundBracket) {
				const foundBracketStartOffset = foundBracket.startColumn - 1;
				const foundBracketEndOffset = foundBracket.endColumn - 1;

				if (startOffset < foundBracketStartOffset) {
					// there is some text before this bracket in this token
					this._nextBuff.push(new Token(
						new Range(lineNumber, startOffset + 1, lineNumber, foundBracketStartOffset + 1),
						TokenTreeBracket.None,
						null
					));
				}

				let bracketText = lineText.substring(foundBracketStartOffset, foundBracketEndOffset);
				bracketText = bracketText.toLowerCase();

				const bracketData = modeBrackets.textIsBracket[bracketText];
				const bracketIsOpen = modeBrackets.textIsOpenBracket[bracketText];

				this._nextBuff.push(new Token(
					new Range(lineNumber, foundBracketStartOffset + 1, lineNumber, foundBracketEndOffset + 1),
					bracketIsOpen ? TokenTreeBracket.Open : TokenTreeBracket.Close,
					`${bracketData.languageIdentifier.language};${bracketData.open};${bracketData.close}`
				));

				startOffset = foundBracketEndOffset;
			}
		} while (foundBracket);

		if (startOffset < endOffset) {
			// there is some remaining none-bracket text in this token
			this._nextBuff.push(new Token(
				new Range(lineNumber, startOffset + 1, lineNumber, endOffset + 1),
				TokenTreeBracket.None,
				null
			));
		}

		return this._nextBuff.shift() || null;
	}
}

class TokenTreeBuilder {

	private _scanner: TokenScanner;
	private _stack: Token[] = [];
	private _currentToken: Token;

	constructor(model: ITextModel) {
		this._scanner = new TokenScanner(model);
	}

	public build(): Node {
		let node = new NodeList();
		while (node.append(this._line() || this._any())) {
			// accept all
		}
		return node;
	}

	private _accept(condt: (info: Token) => boolean): boolean {
		let token = this._stack.pop() || this._scanner.next();
		if (!token) {
			return false;
		}
		let accepted = condt(token);
		if (!accepted) {
			this._stack.push(token);
			// this._currentToken = null;
		} else {
			this._currentToken = token;
			//			console.log('accepted: ' + token.__debugContent);
		}
		return accepted;
	}

	private _peek(condt: (info: Token) => boolean): boolean {
		let ret = false;
		this._accept(info => {
			ret = condt(info);
			return false;
		});
		return ret;
	}

	private _line(): Node | null {
		let node = new NodeList();
		let lineNumber: number;

		// capture current linenumber
		this._peek(info => {
			lineNumber = info.range.startLineNumber;
			return false;
		});

		while (this._peek(info => info.range.startLineNumber === lineNumber)
			&& node.append(this._token() || this._block())) {

			// all children that started on this line
		}

		if (!node.children || node.children.length === 0) {
			return null;
		} else if (node.children.length === 1) {
			return node.children[0];
		} else {
			return node;
		}
	}

	private _token(): Node | null {
		if (!this._accept(token => token.bracket === TokenTreeBracket.None)) {
			return null;
		}
		return newNode(this._currentToken);
	}

	private _block(): Node | null {

		let bracketType: string | null;
		let accepted: boolean;

		accepted = this._accept(token => {
			bracketType = token.bracketType;
			return token.bracket === TokenTreeBracket.Open;
		});
		if (!accepted) {
			return null;
		}

		let bracket = new Block();
		bracket.open = newNode(this._currentToken);
		while (bracket.elements.append(this._line())) {
			// inside brackets
		}

		if (!this._accept(token => token.bracket === TokenTreeBracket.Close && token.bracketType === bracketType)) {
			// missing closing bracket -> return just a node list
			let nodelist = new NodeList();
			nodelist.append(bracket.open);
			nodelist.append(bracket.elements);
			return nodelist;
		}

		bracket.close = newNode(this._currentToken);
		return bracket;
	}

	private _any(): Node | null {
		if (!this._accept(_ => true)) {
			return null;
		}
		return newNode(this._currentToken);
	}
}

/**
 * Parses this grammar:
 *	grammer = { line }
 *	line = { block | "token" }
 *	block = "open_bracket" { line } "close_bracket"
 */
export function build(model: ITextModel): Node {
	let node = new TokenTreeBuilder(model).build();
	return node;
}

export function find(node: Node, position: Position): Node | null {
	if (node instanceof NodeList && node.isEmpty) {
		return null;
	}

	if (!Range.containsPosition(node.range, position)) {
		return null;
	}

	let result: Node | null = null;

	if (node instanceof NodeList) {
		if (node.hasChildren) {
			for (let i = 0, len = node.children.length; i < len && !result; i++) {
				result = find(node.children[i], position);
			}
		}

	} else if (node instanceof Block) {
		result = find(node.elements, position) || find(node.open, position) || find(node.close, position);
	}

	return result || node;
}
