/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Tree, QueryCapture, Language, Point, SyntaxNode, Edit } from 'web-tree-sitter';
import { readFileSync } from 'fs';

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { ContiguousMultilineTokens } from 'vs/editor/common/tokens/contiguousMultilineTokens';
import { ContiguousMultilineTokensBuilder } from 'vs/editor/common/tokens/contiguousMultilineTokensBuilder';
import Parser = require('web-tree-sitter');

export class TreeSitterParseTree {

	private readonly _parser: Parser;
	private _needsParsing: boolean;
	private _tree: Parser.Tree | undefined;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private _captures: Parser.QueryCapture[];
	private _captureNames: string[];
	private _captureNameToNodeMap: Map<string, Parser.SyntaxNode[]>;
	public readonly id: string;

	// Every single model has it's own tree and its own parser
	constructor(
		private readonly _model: ITextModel,
		private readonly _language: Parser.Language
	) {
		this.id = this._model.id;
		this._needsParsing = true;
		this._parser = new Parser();
		this._parser.setLanguage(this._language);
		this._captures = [];
		this._captureNames = [];
		this._captureNameToNodeMap = new Map<string, Parser.SyntaxNode[]>();
		this._tree = this._parser.parse((startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) => this._retrieveTextAtPosition(startIndex, startPoint, endIndex));

		this._disposableStore.add(this._model.onDidChangeContent((e: IModelContentChangedEvent) => {
			const changes = e.changes;
			this._needsParsing = true;
			if (this._tree) {
				for (const change of changes) {
					const newEndPositionFromModel = this._model.getPositionAt(change.rangeOffset + change.text.length);
					this._tree.edit({
						startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
						oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
						newEndPosition: { row: newEndPositionFromModel.lineNumber - 1, column: newEndPositionFromModel.column - 1 },
						startIndex: change.rangeOffset,
						oldEndIndex: change.rangeOffset + change.rangeLength,
						newEndIndex: change.rangeOffset + change.text.length
					} as Parser.Edit);
				}
				this._tree = this._parser.parse((startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) => this._retrieveTextAtPosition(startIndex, startPoint, endIndex));
			} else {
				this._tree = this._parser.parse((startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) => this._retrieveTextAtPosition(startIndex, startPoint, endIndex));
			}
			console.log('this tree text : ', this._tree?.rootNode.text);
			this.getCaptures();
			// TODO: just to investigate the contents of the tokens
			this.renderTokenColors();
		}));
	}

	public getCaptures() {
		if (!this._tree) {
			return;
		}
		/*
		TODO: to add still but bad syntax thrown?
		(required_parameter pattern: (identifier) @variable)
		(optional_parameter pattern : (identifier) @variable)
		(literal_type (undefined) @type)
		*/

		/*
		TODO: Take into account the delimeters too at some point
		[
		"."
		","
		"="
		"+"
		"?"
		"!"
		"¦"
		";"
		":"
		] @keywords3
		*/

		// TODO: not possible to query to find the new changes only?
		const contents = readFileSync(__dirname + '\\..\\..\\..\\..\\..\\src\\vs\\editor\\browser\\services\\tokens.scm', { encoding: 'utf8' });
		const query = this._language.query(contents);
		this._captures = query.captures(this._tree.rootNode);
		this._captureNames = query.captureNames;
	}

	public renderTokenColors() {
		console.log('render token colors');
		// const builder = new ContiguousMultilineTokensBuilder();
		// const array: Uint8Array = builder.serialize();
		// const tokens = this._model.tokenization.getLineTokens(64).getTokens();
		for (const captureName of this._captureNames) {
			const syntaxNodes: Parser.SyntaxNode[] = this._captures.filter(node => node.name === captureName).map(capture => capture.node);
			this._captureNameToNodeMap.set(captureName, syntaxNodes);
		}
		const contiguousMultilineToken: ContiguousMultilineTokens[] = [];
		for (let i = 1; i < this._model.getLineCount(); i++) {
			const line = this._model.getLineContent(i);
			const array: Uint32Array[] = [];
			/*
			const lineTokens = new LineTokens(
				true,
				line,
				this._tokenTypeMatchers,
				this.balancedBracketSelectors
			);
			*/
			array.push(new Uint32Array([0, 33587265]));
			array.push(new Uint32Array([6, 33587265]));
			array.push(new Uint32Array([10, 33587265]));
			contiguousMultilineToken.push(new ContiguousMultilineTokens(i, array));

		}

		// const result = lineTokens.getBinaryResult(r.ruleStack, r.lineLength);
		console.log('contiguousMultilineToken : ', contiguousMultilineToken);
		this._model.tokenization.setTokens(contiguousMultilineToken);

		for (let i = 1; i <= this._model.getLineCount(); i++) {
			const lineTokens = this._model.tokenization.getLineTokens(i);
			console.log('lineTokens : ', lineTokens);
		}
	}

	private _retrieveTextAtPosition(startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) {

		if (startIndex !== undefined && endIndex !== undefined) {
			const startPosition = this._model.getPositionAt(startIndex);
			const endPosition = this._model.getPositionAt(endIndex);
			const line = this._model.getLineContent(startPosition.lineNumber);

			if (startPosition.lineNumber === endPosition.lineNumber) {
				return line.slice(startPosition.column, endPosition.column - 1) + ' \n';
			} else {
				let result = line.slice(startPosition.column - 1) + '\n';
				for (let i = startPosition.lineNumber + 1; i <= endPosition.lineNumber - 1; i++) {
					result += this._model.getLineContent(i) + ' \n';
				}
				result += this._model.getLineContent(endPosition.lineNumber).slice(0, endPosition.column) + ' \n';
				return result;
			}
		} else if (startPoint) {
			if (startPoint.row >= this._model.getLineCount()) {
				return null;
			}
			const line = this._model.getLineContent(startPoint.row + 1);
			const result = line.slice(startPoint.column) + ' \n';
			return result;
		}
		return null;
	}

	private _parse() {
		this._tree = this._parser.parse((startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) => this._retrieveTextAtPosition(startIndex, startPoint, endIndex));
		this._needsParsing = false;
	}

	public getParseTree(): Parser.Tree | void {
		if (!this._tree) {
			return;
		}
		if (this._needsParsing) {
			this._parse();
		}
		return this._tree;
	}

	public dispose() {
		this._tree?.delete();
		this._parser.delete();
		this._disposableStore.clear();
	}
}
