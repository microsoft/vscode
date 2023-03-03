/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineModel, OutlineElement, OutlineGroup } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken, CancellationTokenSource, } from 'vs/base/common/cancellation';
import { EditorOption, IEditorStickyScrollOptions } from 'vs/editor/common/config/editorOptions';
import { CancelablePromise, createCancelablePromise, Delayer, RunOnceScheduler } from 'vs/base/common/async';
import { Range } from 'vs/editor/common/core/range';
import { binarySearch } from 'vs/base/common/arrays';
import { Iterable } from 'vs/base/common/iterator';
import { FoldingController, RangeProvider, RangesLimitReporter } from 'vs/editor/contrib/folding/browser/folding';
import { FoldingModel } from 'vs/editor/contrib/folding/browser/foldingModel';
import { URI } from 'vs/base/common/uri';
import { isEqual } from 'vs/base/common/resources';
import { Event, Emitter } from 'vs/base/common/event';
import { ITextModel } from 'vs/editor/common/model';
import { SyntaxRangeProvider } from 'vs/editor/contrib/folding/browser/syntaxRangeProvider';
import { IndentRangeProvider } from 'vs/editor/contrib/folding/browser/indentRangeProvider';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { FoldingRegions } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { FoldingDecorationProvider } from 'vs/editor/contrib/folding/browser/foldingDecorations';
import { onUnexpectedError } from 'vs/base/common/errors';

enum ModelProvider {
	OUTLINE_MODEL = 'outlineModel',
	FOLDING_PROVIDER_MODEL = 'foldingProviderModel',
	INDENTATION_MODEL = 'indentationModel'
}

export class StickyRange {
	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number
	) { }
}

export class StickyLineCandidate {
	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number,
		public readonly nestingDepth: number,
	) { }
}

export interface IStickyLineCandidateProvider {

	dispose(): void;
	getVersionId(): number | undefined;
	update(): Promise<void>;
	getCandidateStickyLinesIntersectingFromOutline(range: StickyRange, outlineModel: StickyElement, result: StickyLineCandidate[], depth: number, lastStartLineNumber: number): void;
	getCandidateStickyLinesIntersecting(range: StickyRange): StickyLineCandidate[];
	onDidChangeStickyScroll: Event<void>;

}

export class StickyLineCandidateProvider extends Disposable implements IStickyLineCandidateProvider {

	static readonly ID = 'store.contrib.stickyScrollController';

	private readonly _onDidChangeStickyScroll = this._store.add(new Emitter<void>());
	public readonly onDidChangeStickyScroll = this._onDidChangeStickyScroll.event;

	private readonly _editor: ICodeEditor;
	private readonly _updateSoon: RunOnceScheduler;
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	private _model: StickyModel | undefined;
	private _modelProviders: ((textModel: ITextModel, modelVersionId: number, token: CancellationToken) => Promise<boolean | null | undefined>)[] = [];
	private _options: Readonly<Required<IEditorStickyScrollOptions>> | undefined;
	private _cts: CancellationTokenSource | undefined;

	private readonly _foldingStore: DisposableStore = new DisposableStore();
	private readonly _updateDebounceInfo: IFeatureDebounceInformation;
	private _foldingRegionPromise: CancelablePromise<FoldingRegions | null> | null = null;
	private _updateScheduler: Delayer<boolean | undefined> | null = null;
	private _foldingLimitReporter: RangesLimitReporter;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeatureDebounceService _languageFeatureDebounceService: ILanguageFeatureDebounceService
	) {
		super();
		this._editor = editor;
		this._updateSoon = this._register(new RunOnceScheduler(() => this.update(), 50));
		this._foldingLimitReporter = new RangesLimitReporter(editor);
		this._updateDebounceInfo = _languageFeatureDebounceService.for(_languageFeaturesService.foldingRangeProvider, 'Sticky Scroll Folding', { min: 200 });

		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this.readConfiguration();
			}
		}));
		this.readConfiguration();
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}

	private readConfiguration() {

		this._options = this._editor.getOption(EditorOption.stickyScroll);
		if (this._options.enabled === false) {
			this._sessionStore.clear();
			return;
		} else {
			// Specifying the order in which the model providers should be called depending on the setting options
			if (this._options.defaultModel === ModelProvider.INDENTATION_MODEL) {
				this._modelProviders.unshift(this.stickyModelFromIndentationProvider.bind(this));
			}
			else if (this._options.defaultModel === ModelProvider.OUTLINE_MODEL || this._options.defaultModel === ModelProvider.FOLDING_PROVIDER_MODEL) {
				// By construction the folding provider model already falls back on the indentation model, so don't need to include the indentation model as the last element in the priority list
				this._modelProviders.unshift(this.stickyModelFromFoldingProvider.bind(this));

				if (this._options.defaultModel === ModelProvider.OUTLINE_MODEL) {
					this._modelProviders.unshift(this.stickyModelFromOutlineProvider.bind(this));
				}
			}
		}

		this._sessionStore.add(this._editor.onDidChangeModel(() => {
			this.update();
		}));
		this._sessionStore.add(this._editor.onDidChangeHiddenAreas(() => this.update()));
		this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._updateSoon.schedule()));
		this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => {
			this.update();
		}));
		this.update();
	}

	public getVersionId(): number | undefined {
		return this._model?.version;
	}

	public async update(): Promise<void> {
		this._cts?.dispose(true);
		this._cts = new CancellationTokenSource();
		await this.updateStickyModel(this._cts.token);
		this._onDidChangeStickyScroll.fire();
	}

	private async updateStickyModel(token: CancellationToken): Promise<void> {

		// Clear the folding store in all cases
		this._foldingStore.clear();

		if (!this._editor.hasModel()) {
			return;
		}

		const textModel = this._editor.getModel();
		const modelVersionId = textModel.getVersionId();
		const isDifferentModel = this._model ? !isEqual(this._model.uri, textModel.uri) : false;

		// Clear sticky scroll to not show stale data for too long
		const resetHandle = isDifferentModel ? setTimeout(() => {
			if (!token.isCancellationRequested) {
				this._model = new StickyModel(textModel.uri, textModel.getVersionId(), undefined, undefined);
				this._onDidChangeStickyScroll.fire();
			}
		}, 75) : undefined;

		// New update scheduler for the update request
		this._updateScheduler = new Delayer<boolean | undefined>(this._updateDebounceInfo.get(textModel));

		// When the folding store is cleared, the folding region request and the update scheduler are cancelled
		// The current folding model and folding regions promises are set to null
		this._foldingStore.add({
			dispose: () => {
				if (this._foldingRegionPromise) {
					this._foldingRegionPromise.cancel();
					this._foldingRegionPromise = null;
				}
				this._updateScheduler?.cancel();
				this._updateScheduler = null;
				this._foldingRegionPromise = null;
			}
		});

		// Cycle through the array until one of the model providers provides a valid folding model
		for (const modelProvider of this._modelProviders) {
			const status = await modelProvider(textModel, modelVersionId, token);
			// If status is undefined, then the cancellation token has been called, then cancel the update operation
			if (status === undefined) {
				return;
			}
			// Suppose that the status is true, then the sticky model has been found, break the for loop
			else if (status === true) {
				break;
			}
			// If the status is false, then continue to the next model provider
		}

		clearTimeout(resetHandle);
	}

	private async stickyModelFromOutlineProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<boolean | undefined> {
		const outlineModel = await OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, textModel, token);
		if (token.isCancellationRequested) {
			return;
		}
		if (outlineModel.children.size !== 0) {
			const { stickyOutlineElement, providerID } = StickyElement.fromOutlineModel(outlineModel, this._model?.outlineProviderId);
			this._model = new StickyModel(textModel.uri, modelVersionId, stickyOutlineElement, providerID);
			return true;
		} else {
			this._model = undefined;
			return false;
		}
	}

	private async stickyModelFromFoldingProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<boolean | undefined> {
		const indentRangeProvider = new IndentRangeProvider(textModel, this._languageConfigurationService, this._foldingLimitReporter);
		const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, textModel);
		let provider: RangeProvider;
		if (selectedProviders.length > 0) {
			provider = new SyntaxRangeProvider(textModel, selectedProviders, () => this.stickyModelFromFoldingProvider(textModel, modelVersionId, token), this._foldingLimitReporter, indentRangeProvider);
		} else {
			provider = indentRangeProvider;
		}
		return this.stickyModelFromProvider(textModel, modelVersionId, token, provider);
	}

	private async stickyModelFromIndentationProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<boolean | undefined> {
		const provider = new IndentRangeProvider(textModel, this._languageConfigurationService, this._foldingLimitReporter);
		return this.stickyModelFromProvider(textModel, modelVersionId, token, provider);
	}

	private async stickyModelFromProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken, provider: RangeProvider): Promise<boolean | undefined> {

		if (this._updateScheduler) {
			if (this._foldingRegionPromise) {
				this._foldingRegionPromise.cancel();
				this._foldingRegionPromise = null;
			}
			return this._updateScheduler.trigger(() => {
				// It is possible to cancel the promise which calculates the folding
				const foldingRegionPromise = this._foldingRegionPromise = createCancelablePromise(token => provider.compute(token));
				const sw = new StopWatch(true);
				return foldingRegionPromise.then(foldingRegions => {
					if (foldingRegions === null || foldingRegions.length === 0) {
						this._model = undefined;
						return false;
					} else if (foldingRegions && foldingRegionPromise === this._foldingRegionPromise) {
						const newValue = this._updateDebounceInfo.update(textModel, sw.elapsed());
						if (this._updateScheduler) {
							this._updateScheduler.defaultDelay = newValue;
						}
					}
					return this.stickyModelFromFoldingRegions(textModel, modelVersionId, token, foldingRegions);
				});
			}).then((status) => {
				return status;
			}, (err) => {
				onUnexpectedError(err);
				return undefined;
			});
		} else {
			return undefined;
		}
	}

	private async stickyModelFromFoldingRegions(textModel: ITextModel, modelVersionId: number, token: CancellationToken, foldingRegions: FoldingRegions): Promise<boolean | undefined> {
		// Return undefined when the token is cancelled
		if (token.isCancellationRequested) {
			return;
		}
		// Suppose the folding model is null or it has no regions, then return false
		const foldingElement = StickyElement.fromFoldingRegions(foldingRegions);
		this._model = new StickyModel(textModel.uri, modelVersionId, foldingElement, undefined);
		return true;
	}

	private updateIndex(index: number) {
		if (index === -1) {
			index = 0;
		} else if (index < 0) {
			index = -index - 2;
		}
		return index;
	}

	public getCandidateStickyLinesIntersectingFromOutline(range: StickyRange, outlineModel: StickyElement, result: StickyLineCandidate[], depth: number, lastStartLineNumber: number): void {
		if (outlineModel.children.length === 0) {
			return;
		}
		let lastLine = lastStartLineNumber;
		const childrenStartLines: number[] = [];
		for (let i = 0; i < outlineModel.children.length; i++) {
			const child = outlineModel.children[i];
			if (child.range) {
				childrenStartLines.push(child.range.startLineNumber);
			}
		}
		const lowerBound = this.updateIndex(binarySearch(childrenStartLines, range.startLineNumber, (a: number, b: number) => { return a - b; }));
		const upperBound = this.updateIndex(binarySearch(childrenStartLines, range.startLineNumber + depth, (a: number, b: number) => { return a - b; }));
		for (let i = lowerBound; i <= upperBound; i++) {
			const child = outlineModel.children[i];
			if (!child) {
				return;
			}
			if (child.range) {
				const childStartLine = child.range.startLineNumber;
				const childEndLine = child.range.endLineNumber;
				if (range.startLineNumber <= childEndLine + 1 && childStartLine - 1 <= range.endLineNumber && childStartLine !== lastLine) {
					lastLine = childStartLine;
					result.push(new StickyLineCandidate(childStartLine, childEndLine - 1, depth + 1));
					this.getCandidateStickyLinesIntersectingFromOutline(range, child, result, depth + 1, childStartLine);
				}
			} else {
				this.getCandidateStickyLinesIntersectingFromOutline(range, child, result, depth, lastStartLineNumber);
			}
		}
	}

	public getCandidateStickyLinesIntersecting(range: StickyRange): StickyLineCandidate[] {
		if (!this._model?.element) {
			return [];
		}
		let stickyLineCandidates: StickyLineCandidate[] = [];
		this.getCandidateStickyLinesIntersectingFromOutline(range, this._model.element, stickyLineCandidates, 0, -1);
		const hiddenRanges: Range[] | undefined = this._editor._getViewModel()?.getHiddenAreas();
		if (hiddenRanges) {
			for (const hiddenRange of hiddenRanges) {
				stickyLineCandidates = stickyLineCandidates.filter(stickyLine => !(stickyLine.startLineNumber >= hiddenRange.startLineNumber && stickyLine.endLineNumber <= hiddenRange.endLineNumber + 1));
			}
		}
		return stickyLineCandidates;
	}
}

class StickyElement {

	private static comparator(range1: StickyRange, range2: StickyRange): number {
		if (range1.startLineNumber !== range2.startLineNumber) {
			return range1.startLineNumber - range2.startLineNumber;
		} else {
			return range2.endLineNumber - range1.endLineNumber;
		}
	}

	public static fromOutlineElement(outlineElement: OutlineElement, previousStartLine: number): StickyElement {
		const children: StickyElement[] = [];
		for (const child of outlineElement.children.values()) {
			if (child.symbol.selectionRange.startLineNumber !== child.symbol.range.endLineNumber) {
				if (child.symbol.selectionRange.startLineNumber !== previousStartLine) {
					children.push(StickyElement.fromOutlineElement(child, child.symbol.selectionRange.startLineNumber));
				} else {
					for (const subchild of child.children.values()) {
						children.push(StickyElement.fromOutlineElement(subchild, child.symbol.selectionRange.startLineNumber));
					}
				}
			}
		}
		children.sort((child1, child2) => this.comparator(child1.range!, child2.range!));
		const range = new StickyRange(outlineElement.symbol.selectionRange.startLineNumber, outlineElement.symbol.range.endLineNumber);
		return new StickyElement(range, children, undefined);
	}

	public static fromOutlineModel(outlineModel: OutlineModel, preferredProvider: string | undefined): { stickyOutlineElement: StickyElement; providerID: string | undefined } {

		let outlineElements: Map<string, OutlineElement>;
		// When several possible outline providers
		if (Iterable.first(outlineModel.children.values()) instanceof OutlineGroup) {
			const provider = Iterable.find(outlineModel.children.values(), outlineGroupOfModel => outlineGroupOfModel.id === preferredProvider);
			if (provider) {
				outlineElements = provider.children;
			} else {
				let tempID = '';
				let maxTotalSumOfRanges = -1;
				let optimalOutlineGroup = undefined;
				for (const [_key, outlineGroup] of outlineModel.children.entries()) {
					const totalSumRanges = StickyElement.findSumOfRangesOfGroup(outlineGroup);
					if (totalSumRanges > maxTotalSumOfRanges) {
						optimalOutlineGroup = outlineGroup;
						maxTotalSumOfRanges = totalSumRanges;
						tempID = outlineGroup.id;
					}
				}
				preferredProvider = tempID;
				outlineElements = optimalOutlineGroup!.children;
			}
		} else {
			outlineElements = outlineModel.children as Map<string, OutlineElement>;
		}
		const stickyChildren: StickyElement[] = [];
		const outlineElementsArray = Array.from(outlineElements.values()).sort((element1, element2) => {
			const range1: StickyRange = new StickyRange(element1.symbol.range.startLineNumber, element1.symbol.range.endLineNumber);
			const range2: StickyRange = new StickyRange(element2.symbol.range.startLineNumber, element2.symbol.range.endLineNumber);
			return this.comparator(range1, range2);
		});
		for (const outlineElement of outlineElementsArray) {
			stickyChildren.push(StickyElement.fromOutlineElement(outlineElement, outlineElement.symbol.selectionRange.startLineNumber));
		}
		const stickyOutlineElement = new StickyElement(undefined, stickyChildren, undefined);

		return {
			stickyOutlineElement: stickyOutlineElement,
			providerID: preferredProvider
		};
	}

	private static findSumOfRangesOfGroup(outline: OutlineGroup | OutlineElement): number {
		let res = 0;
		for (const child of outline.children.values()) {
			res += this.findSumOfRangesOfGroup(child);
		}
		if (outline instanceof OutlineElement) {
			return res + outline.symbol.range.endLineNumber - outline.symbol.selectionRange.startLineNumber;
		} else {
			return res;
		}
	}

	public static fromFoldingRegions(foldingRegions: FoldingRegions): StickyElement {
		const length = foldingRegions.length;
		let range: StickyRange | undefined;
		const stackOfParents: StickyRange[] = [];

		const stickyOutlineElement = new StickyElement(
			undefined,
			[],
			undefined
		);
		let parentStickyOutlineElement = stickyOutlineElement;

		for (let i = 0; i < length; i++) {
			range = new StickyRange(foldingRegions.getStartLineNumber(i), foldingRegions.getEndLineNumber(i) + 1);
			while (stackOfParents.length !== 0 && (range.startLineNumber < stackOfParents[stackOfParents.length - 1].startLineNumber || range.endLineNumber > stackOfParents[stackOfParents.length - 1].endLineNumber)) {
				stackOfParents.pop();
				if (parentStickyOutlineElement.parent !== undefined) {
					parentStickyOutlineElement = parentStickyOutlineElement.parent;
				}
			}
			const child = new StickyElement(
				range,
				[],
				parentStickyOutlineElement
			);
			parentStickyOutlineElement.children.push(child);
			parentStickyOutlineElement = child;
			stackOfParents.push(range);
		}
		return stickyOutlineElement;
	}

	constructor(
		/**
		 * Range of line numbers spanned by the current scope
		 */
		public readonly range: StickyRange | undefined,
		/**
		 * Must be sorted by start line number
		*/
		public readonly children: StickyElement[],
		/**
		 * Parent sticky outline element
		 */
		public readonly parent: StickyElement | undefined
	) {
	}
}

class StickyModel {
	constructor(
		readonly uri: URI,
		readonly version: number,
		readonly element: StickyElement | undefined,
		readonly outlineProviderId: string | undefined
	) { }
}

