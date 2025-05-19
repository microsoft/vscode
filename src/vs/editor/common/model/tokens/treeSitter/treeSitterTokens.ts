/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as TreeSitter from '@vscode/tree-sitter-wasm';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MutableDisposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Range } from '../../../core/range.js';
import { LanguageId, StandardTokenType } from '../../../encodedTokenAttributes.js';
import { ITreeSitterTokenizationSupport, ILanguageIdCodec, TreeSitterTokenizationRegistry } from '../../../languages.js';
import { IModelContentChangedEvent } from '../../../textModelEvents.js';
import { BackgroundTokenizationState } from '../../../tokenizationTextModelPart.js';
import { LineTokens } from '../../../tokens/lineTokens.js';
import { TextModel } from '../../textModel.js';
import { AbstractTokens } from '../tokens.js';
import { derived, IObservable, ObservablePromise } from '../../../../../base/common/observable.js';
import { TreeSitterModel } from './treeSitterModel.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TreeSitterTokenizationModel } from './treeSitterTokensModel.js';
import { ITreeSitterLibraryService } from '../../../services/treeSitter/treeSitterLibraryService.js';

export class TreeSitterTokens extends AbstractTokens {
	private _tokenizationSupport: ITreeSitterTokenizationSupport | null = null;

	protected _backgroundTokenizationState: BackgroundTokenizationState = BackgroundTokenizationState.InProgress;
	protected readonly _onDidChangeBackgroundTokenizationState: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeBackgroundTokenizationState: Event<void> = this._onDidChangeBackgroundTokenizationState.event;

	private _lastLanguageId: string | undefined;
	private readonly _tokensChangedListener: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private readonly _onDidChangeBackgroundTokenization: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	private readonly _treeModel: IObservable<TreeSitterModel | undefined>;
	private readonly _tokenizationModel: IObservable<TreeSitterTokenizationModel | undefined>;

	constructor(
		private readonly _languageIdObs: IObservable<string>,
		languageIdCodec: ILanguageIdCodec,
		textModel: TextModel,
		@ITreeSitterLibraryService private readonly _treeSitterLibraryService: ITreeSitterLibraryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(languageIdCodec, textModel);


		const parserPromise = new ObservablePromise(this._treeSitterLibraryService.createParser());
		this._store.add(toDisposable(() => {
			parserPromise.promise.then(parser => parser.delete());
		}));

		const parserObs = derived(this, reader => {
			const parser = parserPromise.promiseResult?.read(reader)?.getDataOrThrow();
			return parser;
		});


		this._treeModel = derived(this, reader => {
			const parser = parserObs.read(reader);
			if (!parser) {
				return undefined;
			}

			const currentLanguage = this._languageIdObs.read(reader);
			const treeSitterLang = this._treeSitterLibraryService.getLanguage(currentLanguage, reader);
			if (!treeSitterLang) {
				return undefined;
			}
			// TODO create new parser for each language change
			parser.setLanguage(treeSitterLang);

			const queries = this._treeSitterLibraryService.getInjectionQueries(currentLanguage, reader);
			if (!queries) {
				return undefined;
			}

			return reader.store.add(this._instantiationService.createInstance(TreeSitterModel, currentLanguage, undefined, parser, queries, this._textModel));
		});


		this._tokenizationModel = derived(this, reader => {
			const treeModel = this._treeModel.read(reader);
			if (!treeModel) {
				return undefined;
			}

			const queries = this._treeSitterLibraryService.getHighlightingQueries(treeModel.languageId, reader);
			if (!queries) {
				return undefined;
			}

			return this._instantiationService.createInstance(TreeSitterTokenizationModel, treeModel, queries, this._languageIdCodec);
		});
	}

	private _initialize() {
		const newLanguage = this._languageIdObs.get();
		if (!this._tokenizationSupport || this._lastLanguageId !== newLanguage) {
			this._lastLanguageId = newLanguage;
			this._tokenizationSupport = TreeSitterTokenizationRegistry.get(newLanguage);
			this._tokensChangedListener.value = this._tokenizationSupport?.tokSupport_onDidChangeTokens((e) => {
				if (e.textModel === this._textModel) {
					this._onDidChangeTokens.fire(e.changes);
				}
			});
			this._onDidChangeBackgroundTokenization.value = this._tokenizationSupport?.tokSupport_onDidChangeBackgroundTokenization(e => {
				if (e.textModel === this._textModel) {
					this._backgroundTokenizationState = BackgroundTokenizationState.Completed;
					this._onDidChangeBackgroundTokenizationState.fire();
				}
			});
		}
	}

	public getLineTokens(lineNumber: number): LineTokens {
		const content = this._textModel.getLineContent(lineNumber);
		if (this._tokenizationSupport) {
			const rawTokens = this.getTokens(lineNumber);
			if (rawTokens && rawTokens.length > 0) {
				return new LineTokens(rawTokens, content, this._languageIdCodec);
			}
		}
		return LineTokens.createEmpty(content, this._languageIdCodec);
	}

	public resetTokenization(fireTokenChangeEvent: boolean = true): void {
		if (fireTokenChangeEvent) {
			this._onDidChangeTokens.fire({
				semanticTokensApplied: false,
				ranges: [
					{
						fromLineNumber: 1,
						toLineNumber: this._textModel.getLineCount(),
					},
				],
			});
		}
		this._initialize();
	}

	public override handleDidChangeAttached(): void {
		// TODO @alexr00 implement for background tokenization
	}

	public override handleDidChangeContent(e: IModelContentChangedEvent): void {
		if (e.isFlush) {
			// Don't fire the event, as the view might not have got the text change event yet
			this.resetTokenization(false);
		} else {
			this._handleContentChanged(e);
		}
	}

	public override forceTokenization(lineNumber: number): void {
		if (this._tokenizationSupport && !this.hasAccurateTokensForLine(lineNumber)) {
			this._tokenizationSupport.tokSupport_tokenizeEncoded(lineNumber, this._textModel);
		}
	}

	public override hasAccurateTokensForLine(lineNumber: number): boolean {
		return this._hasTokens(new Range(lineNumber, 1, lineNumber, this._textModel.getLineMaxColumn(lineNumber)));
	}

	public override isCheapToTokenize(lineNumber: number): boolean {
		// TODO @alexr00 determine what makes it cheap to tokenize?
		return true;
	}

	public override getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType {
		// TODO @alexr00 implement once we have custom parsing and don't just feed in the whole text model value
		return StandardTokenType.Other;
	}

	public override tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null {
		if (this._tokenizationSupport) {
			const rawLineTokens = this._tokenizationSupport.tokSupport_guessTokensForLinesContent(lineNumber, this._textModel, lines);
			const lineTokens: LineTokens[] = [];
			if (rawLineTokens) {
				for (let i = 0; i < rawLineTokens.length; i++) {
					lineTokens.push(new LineTokens(rawLineTokens[i], lines[i], this._languageIdCodec));
				}
				return lineTokens;
			}
		}
		return null;
	}

	public override get hasTokens(): boolean {
		return this._hasTokens();
	}

}




























export function rangesEqual(a: TreeSitter.Range, b: TreeSitter.Range) {
	return (a.startPosition.row === b.startPosition.row)
		&& (a.startPosition.column === b.startPosition.column)
		&& (a.endPosition.row === b.endPosition.row)
		&& (a.endPosition.column === b.endPosition.column)
		&& (a.startIndex === b.startIndex)
		&& (a.endIndex === b.endIndex);
}

export function rangesIntersect(a: TreeSitter.Range, b: TreeSitter.Range) {
	return (a.startIndex <= b.startIndex && a.endIndex >= b.startIndex) ||
		(b.startIndex <= a.startIndex && b.endIndex >= a.startIndex);
}



type TreeSitterQueries = string;

interface EndOffsetToken {
	endOffset: number;
	metadata: number;
}

interface EndOffsetAndScopes {
	endOffset: number;
	scopes: string[];
	bracket?: number[];
	encodedLanguageId: LanguageId;
}

interface EndOffsetWithMeta extends EndOffsetAndScopes {
	metadata?: number;
}
export const TREESITTER_BASE_SCOPES: Record<string, string> = {
	'css': 'source.css',
	'typescript': 'source.ts',
	'ini': 'source.ini',
	'regex': 'source.regex',
};

const BRACKETS = /[\{\}\[\]\<\>\(\)]/g;
