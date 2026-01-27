/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { StandardTokenType } from '../../../encodedTokenAttributes.js';
import { ILanguageIdCodec } from '../../../languages.js';
import { IModelContentChangedEvent } from '../../../textModelEvents.js';
import { BackgroundTokenizationState } from '../../../tokenizationTextModelPart.js';
import { LineTokens } from '../../../tokens/lineTokens.js';
import { TextModel } from '../../textModel.js';
import { AbstractSyntaxTokenBackend } from '../abstractSyntaxTokenBackend.js';
import { autorun, derived, IObservable, ObservablePromise } from '../../../../../base/common/observable.js';
import { TreeSitterTree } from './treeSitterTree.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TreeSitterTokenizationImpl } from './treeSitterTokenizationImpl.js';
import { ITreeSitterLibraryService } from '../../../services/treeSitter/treeSitterLibraryService.js';
import { LineRange } from '../../../core/ranges/lineRange.js';

export class TreeSitterSyntaxTokenBackend extends AbstractSyntaxTokenBackend {
	protected _backgroundTokenizationState: BackgroundTokenizationState = BackgroundTokenizationState.InProgress;
	protected readonly _onDidChangeBackgroundTokenizationState: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeBackgroundTokenizationState: Event<void> = this._onDidChangeBackgroundTokenizationState.event;

	private readonly _tree: IObservable<TreeSitterTree | undefined>;
	private readonly _tokenizationImpl: IObservable<TreeSitterTokenizationImpl | undefined>;

	constructor(
		private readonly _languageIdObs: IObservable<string>,
		languageIdCodec: ILanguageIdCodec,
		textModel: TextModel,
		visibleLineRanges: IObservable<readonly LineRange[]>,
		@ITreeSitterLibraryService private readonly _treeSitterLibraryService: ITreeSitterLibraryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(languageIdCodec, textModel);


		const parserClassPromise = new ObservablePromise(this._treeSitterLibraryService.getParserClass());


		const parserClassObs = derived(this, reader => {
			const parser = parserClassPromise.promiseResult?.read(reader)?.getDataOrThrow();
			return parser;
		});


		this._tree = derived(this, reader => {
			const parserClass = parserClassObs.read(reader);
			if (!parserClass) {
				return undefined;
			}

			const currentLanguage = this._languageIdObs.read(reader);
			const treeSitterLang = this._treeSitterLibraryService.getLanguage(currentLanguage, false, reader);
			if (!treeSitterLang) {
				return undefined;
			}

			const parser = new parserClass();
			reader.store.add(toDisposable(() => {
				parser.delete();
			}));
			parser.setLanguage(treeSitterLang);

			const queries = this._treeSitterLibraryService.getInjectionQueries(currentLanguage, reader);
			if (queries === undefined) {
				return undefined;
			}

			return reader.store.add(this._instantiationService.createInstance(TreeSitterTree, currentLanguage, undefined, parser, parserClass, /*queries, */this._textModel));
		});


		this._tokenizationImpl = derived(this, reader => {
			const treeModel = this._tree.read(reader);
			if (!treeModel) {
				return undefined;
			}

			const queries = this._treeSitterLibraryService.getHighlightingQueries(treeModel.languageId, reader);
			if (!queries) {
				return undefined;
			}

			return reader.store.add(this._instantiationService.createInstance(TreeSitterTokenizationImpl, treeModel, queries, this._languageIdCodec, visibleLineRanges));
		});

		this._register(autorun(reader => {
			const tokModel = this._tokenizationImpl.read(reader);
			if (!tokModel) {
				return;
			}
			reader.store.add(tokModel.onDidChangeTokens((e) => {
				this._onDidChangeTokens.fire(e.changes);
			}));
			reader.store.add(tokModel.onDidChangeBackgroundTokenization(e => {
				this._backgroundTokenizationState = BackgroundTokenizationState.Completed;
				this._onDidChangeBackgroundTokenizationState.fire();
			}));
		}));
	}

	get tree(): IObservable<TreeSitterTree | undefined> {
		return this._tree;
	}

	get tokenizationImpl(): IObservable<TreeSitterTokenizationImpl | undefined> {
		return this._tokenizationImpl;
	}

	public getLineTokens(lineNumber: number): LineTokens {
		const model = this._tokenizationImpl.get();
		if (!model) {
			const content = this._textModel.getLineContent(lineNumber);
			return LineTokens.createEmpty(content, this._languageIdCodec);
		}
		return model.getLineTokens(lineNumber);
	}

	public todo_resetTokenization(fireTokenChangeEvent: boolean = true): void {
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
	}

	public override handleDidChangeAttached(): void {
		// TODO @alexr00 implement for background tokenization
	}

	public override handleDidChangeContent(e: IModelContentChangedEvent): void {
		if (e.isFlush) {
			// Don't fire the event, as the view might not have got the text change event yet
			this.todo_resetTokenization(false);
		} else {
			const model = this._tokenizationImpl.get();
			model?.handleContentChanged(e);
		}

		const treeModel = this._tree.get();
		treeModel?.handleContentChange(e);
	}

	public override forceTokenization(lineNumber: number): void {
		const model = this._tokenizationImpl.get();
		if (!model) {
			return;
		}
		if (!model.hasAccurateTokensForLine(lineNumber)) {
			model.tokenizeEncoded(lineNumber);
		}
	}

	public override hasAccurateTokensForLine(lineNumber: number): boolean {
		const model = this._tokenizationImpl.get();
		if (!model) {
			return false;
		}
		return model.hasAccurateTokensForLine(lineNumber);
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
		const model = this._tokenizationImpl.get();
		if (!model) {
			return null;
		}
		return model.tokenizeLinesAt(lineNumber, lines);
	}

	public override get hasTokens(): boolean {
		const model = this._tokenizationImpl.get();
		if (!model) {
			return false;
		}
		return model.hasTokens();
	}
}
