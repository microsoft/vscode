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
	'comments': 0,
	'other': 33588289,
	'keywords1': 33719361,
	'keywords2': 34112577,
	'function': 34047041,
	'string': 33916481,
	'type': 34079809,
	'variable': 33850433,
	'number': 33752129,
}));

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
			console.log('this tree text : ', this._tree?.rootNode.text);
			this.getCaptures();
			this.getMatches();
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
		console.log('matches : ', this._matches);
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
		console.log('captures : ', this._captures);
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
		let j = 0;
		let numberCaptures = this._captures.length;

		console.log('this._captures : ', this._captures);

		for (let i = 0; i < this._model.getLineCount(); i++) {
			const array: Uint32Array[] = [];
			const arrayOfTokens: number[] = [];

			while (j < numberCaptures && this._captures[j].node.endPosition.row <= i) {
				// array.push(new Uint32Array([4, 33719361, 5, 33588289, 11, 34079809, 16, 33588289]));
				if (this._captures[j].node.endPosition.row === i) {
					let color;
					if (mapWordToColor.has(this._captures[j].name)) {
						color = mapWordToColor.get(this._captures[j].name);
					} else {
						color = mapWordToColor.get('other');
					}
					arrayOfTokens.push(this._captures[j].node.endPosition.column, color as number);
				}
				j++;
			}

			array.push(new Uint32Array(arrayOfTokens));
			console.log('value of j : ', j);
			console.log('inside of renderTokenColors for line ', i, ' array : ', array);
			contiguousMultilineToken.push(new ContiguousMultilineTokens(i + 1, array));
		}

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
