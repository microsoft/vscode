/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as Parser from '@vscode/tree-sitter-wasm';
import { Event } from '../../../base/common/event.js';
import { ITextModel } from '../model.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { Range } from '../core/range.js';
import { importAMDNodeModule } from '../../../amdX.js';
import { IModelContentChangedEvent } from '../textModelEvents.js';

export const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = 'editor.experimental.preferTreeSitter';
export const TREESITTER_ALLOWED_SUPPORT = ['css', 'typescript', 'ini', 'regex'];

export const ITreeSitterParserService = createDecorator<ITreeSitterParserService>('treeSitterParserService');

export interface RangeWithOffsets {
	range: Range;
	startOffset: number;
	endOffset: number;
}

export interface RangeChange {
	newRange: Range;
	newRangeStartOffset: number;
	newRangeEndOffset: number;
}

export interface TreeParseUpdateEvent {
	ranges: RangeChange[] | undefined;
	language: string;
	versionId: number;
	tree: Parser.Tree;
	includedModelChanges: IModelContentChangedEvent[];
}

export interface ModelTreeUpdateEvent {
	ranges: RangeChange[];
	versionId: number;
	tree: ITextModelTreeSitter;
	languageId: string;
	hasInjections: boolean;
}

export interface TreeUpdateEvent extends ModelTreeUpdateEvent {
	textModel: ITextModel;
}

export interface ITreeSitterParserService {
	readonly _serviceBrand: undefined;
	onDidAddLanguage: Event<{ id: string; language: Parser.Language }>;
	getOrInitLanguage(languageId: string): Parser.Language | undefined;
	getLanguage(languageId: string): Promise<Parser.Language | undefined>;
	getParseResult(textModel: ITextModel): ITextModelTreeSitter | undefined;
	getTree(content: string, languageId: string): Promise<Parser.Tree | undefined>;
	getTreeSync(content: string, languageId: string): Parser.Tree | undefined;
	onDidUpdateTree: Event<TreeUpdateEvent>;
	/**
	 * For testing purposes so that the time to parse can be measured.
	*/
	getTextModelTreeSitter(model: ITextModel, parseImmediately?: boolean): Promise<ITextModelTreeSitter | undefined>;
}

export interface ITreeSitterParseResult {
	readonly tree: Parser.Tree | undefined;
	readonly language: Parser.Language;
	readonly languageId: string;
	readonly ranges: Parser.Range[] | undefined;
	versionId: number;
}

export interface ITextModelTreeSitter {
	/**
	 * For testing purposes so that the time to parse can be measured.
	 */
	parse(languageId?: string): Promise<ITreeSitterParseResult | undefined>;
	textModel: ITextModel;
	parseResult: ITreeSitterParseResult | undefined;
	getInjection(offset: number, parentLanguage: string): ITreeSitterParseResult | undefined;
	dispose(): void;
}

export const ITreeSitterImporter = createDecorator<ITreeSitterImporter>('treeSitterImporter');

export interface ITreeSitterImporter {
	readonly _serviceBrand: undefined;
	getParserClass(): Promise<typeof Parser.Parser>;
	readonly parserClass: typeof Parser.Parser | undefined;
	getLanguageClass(): Promise<typeof Parser.Language>;
	getQueryClass(): Promise<typeof Parser.Query>;
}

export class TreeSitterImporter implements ITreeSitterImporter {
	readonly _serviceBrand: undefined;
	private _treeSitterImport: typeof import('@vscode/tree-sitter-wasm') | undefined;

	constructor() { }

	private async _getTreeSitterImport() {
		if (!this._treeSitterImport) {
			this._treeSitterImport = await importAMDNodeModule<typeof import('@vscode/tree-sitter-wasm')>('@vscode/tree-sitter-wasm', 'wasm/tree-sitter.js');
		}
		return this._treeSitterImport;
	}

	get parserClass() {
		return this._parserClass;
	}

	private _parserClass: typeof Parser.Parser | undefined;
	public async getParserClass() {
		if (!this._parserClass) {
			this._parserClass = (await this._getTreeSitterImport()).Parser;
		}
		return this._parserClass;
	}

	private _languageClass: typeof Parser.Language | undefined;
	public async getLanguageClass() {
		if (!this._languageClass) {
			this._languageClass = (await this._getTreeSitterImport()).Language;
		}
		return this._languageClass;
	}

	private _queryClass: typeof Parser.Query | undefined;
	public async getQueryClass() {
		if (!this._queryClass) {
			this._queryClass = (await this._getTreeSitterImport()).Query;
		}
		return this._queryClass;
	}
}
