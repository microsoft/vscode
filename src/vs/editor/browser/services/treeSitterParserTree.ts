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

const mapWordToColor = new Map(Object.entries({
	'comment': 33686849,
	'other': 33588289,
	'keywords1': 33719361,
	'keywords2': 34112577,
	'function': 34047041,
	'string': 33916481,
	'type': 34079809,
	'variable': 33850433,
	'number': 33752129,
}));

const exceptions = {
	FUNCTION_DECLARATION: 'function_declaration',
	METHOD_DEFINITION: 'method_definition'
}

export class TreeSitterParseTree {

	private readonly _parser: Parser;
	private _needsParsing: boolean;
	private _tree: Parser.Tree | undefined;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private _captures: Parser.QueryCapture[];
	private _matches: Parser.QueryMatch[];
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
		this._matches = [];
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
			this.getCaptures();
			// this.getMatches();
			// TODO: just to investigate the contents of the tokens
			this.renderTokenColors();
		}));
	}

	public getMatches() {
		if (!this._tree) {
			return;
		}
		const contents = readFileSync(__dirname + '\\..\\..\\..\\..\\..\\src\\vs\\editor\\browser\\services\\tokens.scm', { encoding: 'utf8' });
		const query = this._language.query(contents);
		this._matches = query.matches(this._tree.rootNode);
	}

	public getCaptures() {
		if (!this._tree) {
			return;
		}
		/*
		TODO: to add still but bad syntax thrown
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
		console.log('this._captures : ', this._captures);
		this._captureNames = query.captureNames;
	}

	public renderTokenColors() {
		for (const captureName of this._captureNames) {
			const syntaxNodes: Parser.SyntaxNode[] = this._captures.filter(node => node.name === captureName).map(capture => capture.node);
			this._captureNameToNodeMap.set(captureName, syntaxNodes);
		}
		const contiguousMultilineToken: ContiguousMultilineTokens[] = [];
		let j = 0;
		let numberCaptures = this._captures.length;

		let beginningIndex = 0;
		let newBeginningIndexFound = true;

		for (let i = 0; i < this._model.getLineCount(); i++) {
			const array: Uint32Array[] = [];
			const arrayOfTokens: number[] = [];

			let j = beginningIndex;
			while (j < numberCaptures && this._captures[j].node.startPosition.row <= i) {
				// array.push(new Uint32Array([4, 33719361, 5, 33588289, 11, 34079809, 16, 33588289]));
				if (this._captures[j].node.startPosition.row <= i && i <= this._captures[j].node.endPosition.row) {
					if (!newBeginningIndexFound) {
						newBeginningIndexFound = true;
						beginningIndex = this._captures[j].node.startPosition.row;
					}
					let color;
					if (mapWordToColor.has(this._captures[j].name)) {
						color = mapWordToColor.get(this._captures[j].name);
					} else {
						color = mapWordToColor.get('other');
					}
					arrayOfTokens.push(this._captures[j].node.startPosition.column, mapWordToColor.get('other') as number);

					let endColumn;
					const line = this._model.getLineContent(this._captures[j].node.startPosition.row + 1);
					console.log('this._captures[j].name : ', this._captures[j].name);
					switch (this._captures[j].name) {
						/*
						case exceptions.FUNCTION_DECLARATION:
							console.log('inside function declaration');
							endColumn = line.indexOf('function') + ('function').length + 1;
							arrayOfTokens.push(endColumn, mapWordToColor.get('keywords1') as number);
							break;
						*/
						/*
						case exceptions.METHOD_DEFINITION:
							console.log('inside method definition');
							endColumn = line.indexOf('async');
							console.log('endColumn : ', endColumn, ' for line number : ', i + 1);
							if (endColumn > 0) {
								console.log('inside of if loop');
								endColumn += ('async').length + 1;
								arrayOfTokens.push(endColumn, mapWordToColor.get('keywords1') as number);
							}
							break;
						*/
						default:
							endColumn = this._captures[j].node.endPosition.column;
							arrayOfTokens.push(endColumn, color as number);
							break;
					}
				}

				/*
				(function_declaration) @function_declaration
				(method_definition) @method_definition
				*/

				// need to add one last token for the end
				// Find later why the the following does not work, after transformation of contiguousMultilineTokens later when set as tokens
				// arrayOfTokens.push(this._model.getLineLength(i + 1), mapWordToColor.get('other') as number);
				j++;
			}

			newBeginningIndexFound = false;
			array.push(new Uint32Array(arrayOfTokens));
			contiguousMultilineToken.push(new ContiguousMultilineTokens(i + 1, array));
		}

		this._model.tokenization.setTokens(contiguousMultilineToken);
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
