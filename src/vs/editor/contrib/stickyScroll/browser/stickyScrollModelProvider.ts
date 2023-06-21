/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineElement, OutlineGroup, OutlineModel } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancelablePromise, createCancelablePromise, Delayer } from 'vs/base/common/async';
import { FoldingController, RangesLimitReporter } from 'vs/editor/contrib/folding/browser/folding';
import { ITextModel } from 'vs/editor/common/model';
import { SyntaxRangeProvider } from 'vs/editor/contrib/folding/browser/syntaxRangeProvider';
import { IndentRangeProvider } from 'vs/editor/contrib/folding/browser/indentRangeProvider';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { FoldingRegions } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TextModel } from 'vs/editor/common/model/textModel';
import { StickyElement, StickyModel, StickyRange } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollElement';
import { Iterable } from 'vs/base/common/iterator';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';

enum ModelProvider {
	OUTLINE_MODEL = 'outlineModel',
	FOLDING_PROVIDER_MODEL = 'foldingProviderModel',
	INDENTATION_MODEL = 'indentationModel'
}

enum Status {
	VALID,
	INVALID,
	CANCELED
}

export interface IStickyModelProvider {

	/**
	 * Method which updates the sticky model
	 * @param textModel text-model of the editor
	 * @param textModelVersionId text-model version ID
	 * @param token cancellation token
	 * @returns the sticky model
	 */
	update(textModel: ITextModel, textModelVersionId: number, token: CancellationToken): Promise<StickyModel | null>;
}

export class StickyModelProvider implements IStickyModelProvider {

	private _modelProviders: IStickyModelCandidateProvider<any>[] = [];
	private _modelPromise: CancelablePromise<any | null> | null = null;
	private _updateScheduler: Delayer<StickyModel | null> = new Delayer<StickyModel | null>(300);
	private readonly _store: DisposableStore;

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageConfigurationService readonly _languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService readonly _languageFeaturesService: ILanguageFeaturesService,
		defaultModel: string) {

		const stickyModelFromCandidateOutlineProvider = new StickyModelFromCandidateOutlineProvider(_languageFeaturesService);
		const stickyModelFromSyntaxFoldingProvider = new StickyModelFromCandidateSyntaxFoldingProvider(this._editor, _languageFeaturesService);
		const stickyModelFromIndentationFoldingProvider = new StickyModelFromCandidateIndentationFoldingProvider(this._editor, _languageConfigurationService);

		switch (defaultModel) {
			case ModelProvider.OUTLINE_MODEL:
				this._modelProviders.push(stickyModelFromCandidateOutlineProvider);
				this._modelProviders.push(stickyModelFromSyntaxFoldingProvider);
				this._modelProviders.push(stickyModelFromIndentationFoldingProvider);
				break;
			case ModelProvider.FOLDING_PROVIDER_MODEL:
				this._modelProviders.push(stickyModelFromSyntaxFoldingProvider);
				this._modelProviders.push(stickyModelFromIndentationFoldingProvider);
				break;
			case ModelProvider.INDENTATION_MODEL:
				this._modelProviders.push(stickyModelFromIndentationFoldingProvider);
				break;
		}

		this._store = new DisposableStore();
	}

	private _cancelModelPromise(): void {
		if (this._modelPromise) {
			this._modelPromise.cancel();
			this._modelPromise = null;
		}
	}

	public async update(textModel: ITextModel, textModelVersionId: number, token: CancellationToken): Promise<StickyModel | null> {

		this._store.clear();
		this._store.add({
			dispose: () => {
				this._cancelModelPromise();
				this._updateScheduler?.cancel();
			}
		});
		this._cancelModelPromise();

		return await this._updateScheduler.trigger(async () => {

			for (const modelProvider of this._modelProviders) {
				const { statusPromise, modelPromise } = modelProvider.computeStickyModel(
					textModel,
					textModelVersionId,
					token
				);
				this._modelPromise = modelPromise;
				const status = await statusPromise;
				if (this._modelPromise !== modelPromise) {
					return null;
				}
				switch (status) {
					case Status.CANCELED:
						this._store.clear();
						return null;
					case Status.VALID:
						return modelProvider.stickyModel;
				}
			}
			return null;
		});
	}
}

interface IStickyModelCandidateProvider<T> {
	get stickyModel(): StickyModel | null;

	get provider(): LanguageFeatureRegistry<object> | null;

	/**
	 * Method which computes the sticky model and returns a status to signal whether the sticky model has been successfully found
	 * @param textmodel text-model of the editor
	 * @param modelVersionId version ID of the text-model
	 * @param token cancellation token
	 * @returns a promise of a status indicating whether the sticky model has been successfully found as well as the model promise
	 */
	computeStickyModel(textmodel: ITextModel, modelVersionId: number, token: CancellationToken): { statusPromise: Promise<Status> | Status; modelPromise: CancelablePromise<T | null> | null };
}

abstract class StickyModelCandidateProvider<T> implements IStickyModelCandidateProvider<T> {

	protected _stickyModel: StickyModel | null = null;

	constructor() { }

	get stickyModel(): StickyModel | null {
		return this._stickyModel;
	}

	private _invalid(): Status {
		this._stickyModel = null;
		return Status.INVALID;
	}

	public abstract get provider(): LanguageFeatureRegistry<object> | null;

	public computeStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken): { statusPromise: Promise<Status> | Status; modelPromise: CancelablePromise<T | null> | null } {
		if (token.isCancellationRequested || !this.isProviderValid(textModel)) {
			return { statusPromise: this._invalid(), modelPromise: null };
		}
		const providerModelPromise = createCancelablePromise(token => this.createModelFromProvider(textModel, modelVersionId, token));

		return {
			statusPromise: providerModelPromise.then(providerModel => {
				if (!this.isModelValid(providerModel)) {
					return this._invalid();

				}
				if (token.isCancellationRequested) {
					return Status.CANCELED;
				}
				this._stickyModel = this.createStickyModel(textModel, modelVersionId, token, providerModel);
				return Status.VALID;
			}).then(undefined, (err) => {
				onUnexpectedError(err);
				return Status.CANCELED;
			}),
			modelPromise: providerModelPromise
		};
	}

	/**
	 * Method which checks whether the model returned by the provider is valid and can be used to compute a sticky model.
	 * This method by default returns true.
	 * @param model model returned by the provider
	 * @returns boolean indicating whether the model is valid
	 */
	protected isModelValid(model: any): boolean {
		return true;
	}

	/**
	 * Method which checks whether the provider is valid before applying it to find the provider model.
	 * This method by default returns true.
	 * @param textModel text-model of the editor
	 * @returns boolean indicating whether the provider is valid
	 */
	protected isProviderValid(textModel: ITextModel): boolean {
		return true;
	}

	/**
	 * Abstract method which creates the model from the provider and returns the provider model
	 * @param textModel	text-model of the editor
	 * @param textModelVersionId text-model version ID
	 * @param token cancellation token
	 * @returns the model returned by the provider
	 */
	protected abstract createModelFromProvider(textModel: ITextModel, textModelVersionId: number, token: CancellationToken): Promise<T>;

	/**
	 * Abstract method which computes the sticky model from the model returned by the provider and returns the sticky model
	 * @param textModel text-model of the editor
	 * @param textModelVersionId text-model version ID
	 * @param token cancellation token
	 * @param model model returned by the provider
	 * @returns the sticky model
	 */
	protected abstract createStickyModel(textModel: ITextModel, textModelVersionId: number, token: CancellationToken, model: T): StickyModel;
}

class StickyModelFromCandidateOutlineProvider extends StickyModelCandidateProvider<OutlineModel> {

	constructor(@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService) {
		super();
	}

	public get provider(): LanguageFeatureRegistry<object> | null {
		return this._languageFeaturesService.documentSymbolProvider;
	}

	protected createModelFromProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<OutlineModel> {
		return OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, textModel, token);
	}

	protected createStickyModel(textModel: TextModel, modelVersionId: number, token: CancellationToken, model: OutlineModel): StickyModel {
		const { stickyOutlineElement, providerID } = this._stickyModelFromOutlineModel(model, this._stickyModel?.outlineProviderId);
		return new StickyModel(textModel.uri, modelVersionId, stickyOutlineElement, providerID);
	}

	protected override isModelValid(model: OutlineModel): boolean {
		return model && model.children.size > 0;
	}

	private _stickyModelFromOutlineModel(outlineModel: OutlineModel, preferredProvider: string | undefined): { stickyOutlineElement: StickyElement; providerID: string | undefined } {

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
					const totalSumRanges = this._findSumOfRangesOfGroup(outlineGroup);
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
			return this._comparator(range1, range2);
		});
		for (const outlineElement of outlineElementsArray) {
			stickyChildren.push(this._stickyModelFromOutlineElement(outlineElement, outlineElement.symbol.selectionRange.startLineNumber));
		}
		const stickyOutlineElement = new StickyElement(undefined, stickyChildren, undefined);

		return {
			stickyOutlineElement: stickyOutlineElement,
			providerID: preferredProvider
		};
	}

	private _stickyModelFromOutlineElement(outlineElement: OutlineElement, previousStartLine: number): StickyElement {
		const children: StickyElement[] = [];
		for (const child of outlineElement.children.values()) {
			if (child.symbol.selectionRange.startLineNumber !== child.symbol.range.endLineNumber) {
				if (child.symbol.selectionRange.startLineNumber !== previousStartLine) {
					children.push(this._stickyModelFromOutlineElement(child, child.symbol.selectionRange.startLineNumber));
				} else {
					for (const subchild of child.children.values()) {
						children.push(this._stickyModelFromOutlineElement(subchild, child.symbol.selectionRange.startLineNumber));
					}
				}
			}
		}
		children.sort((child1, child2) => this._comparator(child1.range!, child2.range!));
		const range = new StickyRange(outlineElement.symbol.selectionRange.startLineNumber, outlineElement.symbol.range.endLineNumber);
		return new StickyElement(range, children, undefined);
	}

	private _comparator(range1: StickyRange, range2: StickyRange): number {
		if (range1.startLineNumber !== range2.startLineNumber) {
			return range1.startLineNumber - range2.startLineNumber;
		} else {
			return range2.endLineNumber - range1.endLineNumber;
		}
	}

	private _findSumOfRangesOfGroup(outline: OutlineGroup | OutlineElement): number {
		let res = 0;
		for (const child of outline.children.values()) {
			res += this._findSumOfRangesOfGroup(child);
		}
		if (outline instanceof OutlineElement) {
			return res + outline.symbol.range.endLineNumber - outline.symbol.selectionRange.startLineNumber;
		} else {
			return res;
		}
	}

}

abstract class StickyModelFromCandidateFoldingProvider extends StickyModelCandidateProvider<FoldingRegions | null> {

	protected _foldingLimitReporter: RangesLimitReporter;

	constructor(editor: ICodeEditor) {
		super();
		this._foldingLimitReporter = new RangesLimitReporter(editor);
	}

	protected createStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken, model: FoldingRegions): StickyModel {
		const foldingElement = this._fromFoldingRegions(model);
		return new StickyModel(textModel.uri, modelVersionId, foldingElement, undefined);
	}

	protected override isModelValid(model: FoldingRegions): boolean {
		return model !== null;
	}


	private _fromFoldingRegions(foldingRegions: FoldingRegions): StickyElement {
		const length = foldingRegions.length;
		const orderedStickyElements: StickyElement[] = [];

		// The root sticky outline element
		const stickyOutlineElement = new StickyElement(
			undefined,
			[],
			undefined
		);

		for (let i = 0; i < length; i++) {
			// Finding the parent index of the current range
			const parentIndex = foldingRegions.getParentIndex(i);

			let parentNode;
			if (parentIndex !== -1) {
				// Access the reference of the parent node
				parentNode = orderedStickyElements[parentIndex];
			} else {
				// In that case the parent node is the root node
				parentNode = stickyOutlineElement;
			}

			const child = new StickyElement(
				new StickyRange(foldingRegions.getStartLineNumber(i), foldingRegions.getEndLineNumber(i) + 1),
				[],
				parentNode
			);
			parentNode.children.push(child);
			orderedStickyElements.push(child);
		}
		return stickyOutlineElement;
	}
}

class StickyModelFromCandidateIndentationFoldingProvider extends StickyModelFromCandidateFoldingProvider {

	constructor(
		editor: ICodeEditor,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService) {
		super(editor);
	}

	public get provider(): LanguageFeatureRegistry<object> | null {
		return null;
	}

	protected createModelFromProvider(textModel: TextModel, modelVersionId: number, token: CancellationToken): Promise<FoldingRegions> {
		const provider = new IndentRangeProvider(textModel, this._languageConfigurationService, this._foldingLimitReporter);
		return provider.compute(token);
	}
}

class StickyModelFromCandidateSyntaxFoldingProvider extends StickyModelFromCandidateFoldingProvider {

	constructor(editor: ICodeEditor,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService) {
		super(editor);
	}

	public get provider(): LanguageFeatureRegistry<object> | null {
		return this._languageFeaturesService.foldingRangeProvider;
	}

	protected override isProviderValid(textModel: TextModel): boolean {
		const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, textModel);
		return selectedProviders.length > 0;
	}

	protected createModelFromProvider(textModel: TextModel, modelVersionId: number, token: CancellationToken): Promise<FoldingRegions | null> {
		const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, textModel);
		const provider = new SyntaxRangeProvider(textModel, selectedProviders, () => this.createModelFromProvider(textModel, modelVersionId, token), this._foldingLimitReporter, undefined);
		return provider.compute(token);
	}
}
