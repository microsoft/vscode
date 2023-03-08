/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineModel } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancelablePromise, createCancelablePromise, Delayer } from 'vs/base/common/async';
import { FoldingController, RangesLimitReporter } from 'vs/editor/contrib/folding/browser/folding';
import { ITextModel } from 'vs/editor/common/model';
import { SyntaxRangeProvider } from 'vs/editor/contrib/folding/browser/syntaxRangeProvider';
import { IndentRangeProvider } from 'vs/editor/contrib/folding/browser/indentRangeProvider';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { FoldingRegions } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TextModel } from 'vs/editor/common/model/textModel';
import { StickyElement, StickyModel } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollProvider';

enum ModelProvider {
	OUTLINE_MODEL = 'outlineModel',
	FOLDING_PROVIDER_MODEL = 'foldingProviderModel',
	INDENTATION_MODEL = 'indentationModel'
}

enum Status {
	VALID_MODEL,
	NOT_VALID_MODEL,
	CANCELLATION
}

export class StickyModelProvider {
	private _modelProviders: IStickyModelCandidateProvider[] = [];
	private readonly _store: DisposableStore = new DisposableStore();
	private readonly _updateDebounceInfo: IFeatureDebounceInformation;
	private _modelPromise: CancelablePromise<any | null> | null = null;
	private _updateScheduler: Delayer<StickyModel | null> | null = null;
	private _sw: StopWatch | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeatureDebounceService _languageFeatureDebounceService: ILanguageFeatureDebounceService,
		defaultModel: string) {

		switch (defaultModel) {
			case ModelProvider.OUTLINE_MODEL:
				this._modelProviders.push(new StickyModelFromCandidateOutlineProvider(this._languageFeaturesService));
				this._modelProviders.push(new StickyModelFromCandidateSyntaxFoldingProvider(this._editor, this._languageFeaturesService));
				this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, this._languageConfigurationService));
				break;
			case ModelProvider.FOLDING_PROVIDER_MODEL:
				this._modelProviders.push(new StickyModelFromCandidateSyntaxFoldingProvider(this._editor, this._languageFeaturesService));
				this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, this._languageConfigurationService));
				break;
			case ModelProvider.INDENTATION_MODEL:
				this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, this._languageConfigurationService));
				break;
		}

		this._updateDebounceInfo = _languageFeatureDebounceService.for(_languageFeaturesService.foldingRangeProvider, 'Sticky Scroll Folding', { min: 200 });
	}

	public async update(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<StickyModel | null> {

		// Clear the store in all cases
		this._store.clear();

		// New update scheduler for the update request
		this._updateScheduler = new Delayer<StickyModel | null>(this._updateDebounceInfo.get(textModel));

		// When the store is cleared, the request and the update scheduler are cancelled
		this._store.add({
			dispose: () => {
				if (this._modelPromise) {
					this._modelPromise.cancel();
					this._modelPromise = null;
				}
				this._updateScheduler?.cancel();
				this._updateScheduler = null;
			}
		});

		// If the current folding region promise is not null, then cancel it before returning a new folding region promise
		if (this._modelPromise) {
			this._modelPromise.cancel();
			this._modelPromise = null;
		}

		return await this._updateScheduler.trigger(async () => {
			// Create a new stop-watch which will find the time it takes to compute the model which will be used to compute the sticky scroll
			this._sw = new StopWatch(true);

			// Cycle through the array of model providers, until one provides a valid model, which will be used to construct the sticky model
			for (const modelProvider of this._modelProviders) {
				const status = await modelProvider.getModel(textModel, modelVersionId, token, this._updateScheduler, this._updateDebounceInfo, this._sw);
				// If status is undefined, then the cancellation token has been called, then cancel the update operation
				switch (status) {
					case Status.CANCELLATION:
						return null;
					case Status.VALID_MODEL:
						return modelProvider.model;
				}
				// If the status is false, then continue to the next model provider
			}

			// If there is no valid model then return null
			return null;
		});
	}
}

interface IStickyModelCandidateProvider {
	get model(): StickyModel | null;
	getModel(textmodel: ITextModel, modelVersionId: number, token: CancellationToken, updateScheduler: Delayer<StickyModel | null> | null, updateDebounceInfo: IFeatureDebounceInformation, stopWatch: StopWatch): any;
	createModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken): any;
	createStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken, model: any): any;
}

abstract class StickyModelCandidateProvider implements IStickyModelCandidateProvider {

	private _modelPromise: CancelablePromise<any> | null = null;
	protected _model: StickyModel | null = null;
	protected _provider: any;

	constructor() { }

	get model(): StickyModel | null {
		return this._model;
	}

	public getModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken, updateScheduler: Delayer<StickyModel | null> | null, updateDebounceInfo: IFeatureDebounceInformation, stopWatch: StopWatch): Promise<Status> | Status {

		if (!this.isProviderValid(textModel)) {
			return Status.NOT_VALID_MODEL;
		}
		const modelPromise = this._modelPromise = createCancelablePromise(token => this.createModel(textModel, modelVersionId, token));
		return modelPromise.then(model => {
			if (!this.isModelValid(model)) {
				this._model = null;
				return Status.NOT_VALID_MODEL;
			} else if (modelPromise === this._modelPromise) {
				// Update the time it took to find the folding model
				this._updateDebounceInformation(textModel, updateScheduler, updateDebounceInfo, stopWatch);
			}
			// Return undefined when the token is cancelled
			// Unsure where to place the code below?
			if (token.isCancellationRequested) {
				return Status.CANCELLATION;
			}
			return this.createStickyModel(textModel, modelVersionId, token, model);
		}).then((status) => {
			return status;
		}, (err) => {
			onUnexpectedError(err);
			return Status.CANCELLATION;
		});
	}

	private _updateDebounceInformation(textModel: ITextModel, updateScheduler: Delayer<StickyModel | null> | null, updateDebounceInfo: IFeatureDebounceInformation, stopWatch: StopWatch): void {
		const newValue = updateDebounceInfo.update(textModel, stopWatch.elapsed());
		if (updateScheduler) {
			updateScheduler.defaultDelay = newValue;
		}
	}

	abstract createModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken): any;
	abstract createStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken, model: any): Status;

	isModelValid(model: any): boolean {
		return true;
	}
	isProviderValid(textModel: ITextModel): boolean {
		return true;
	}
}

class StickyModelFromCandidateOutlineProvider extends StickyModelCandidateProvider {

	constructor(@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService) {
		super();
	}

	// Looks like not using the modelVersionId here
	public createModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<OutlineModel> {
		return OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, textModel, token);
	}

	public createStickyModel(textModel: TextModel, modelVersionId: number, token: CancellationToken, model: OutlineModel): Status {
		// Suppose the folding model is null or it has no regions, then return false
		const { stickyOutlineElement, providerID } = StickyElement.fromOutlineModel(model, this._model?.outlineProviderId);
		this._model = new StickyModel(textModel.uri, modelVersionId, stickyOutlineElement, providerID);
		return Status.VALID_MODEL;
	}


	public override isModelValid(model: OutlineModel) {
		return model && model.children.size > 0;
	}
}

abstract class StickyModelFromCandidateFoldingProvider extends StickyModelCandidateProvider {

	protected _foldingLimitReporter: RangesLimitReporter;

	constructor(editor: ICodeEditor) {
		super();
		this._foldingLimitReporter = new RangesLimitReporter(editor);
	}

	public createStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken, model: FoldingRegions) {

		// Suppose the folding model is null or it has no regions, then return false
		const foldingElement = StickyElement.fromFoldingRegions(model);
		this._model = new StickyModel(textModel.uri, modelVersionId, foldingElement, undefined);
		return Status.VALID_MODEL;
	}

	public override isModelValid(model: FoldingRegions): boolean {
		return model !== null;
	}
}

class StickyModelFromCandidateIndentationFoldingProvider extends StickyModelFromCandidateFoldingProvider {

	constructor(editor: ICodeEditor, @ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,) {
		super(editor);
	}

	public createModel(textModel: TextModel, modelVersionId: number, token: CancellationToken): Promise<FoldingRegions | null> {
		const provider = new IndentRangeProvider(textModel, this._languageConfigurationService, this._foldingLimitReporter);
		return provider.compute(token);
	}
}

class StickyModelFromCandidateSyntaxFoldingProvider extends StickyModelFromCandidateFoldingProvider {
	constructor(editor: ICodeEditor, @ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService) {
		super(editor);
	}

	public override isProviderValid(textModel: TextModel): boolean {
		const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, textModel);
		if (selectedProviders.length > 0) {
			return true;
		} else {
			return false;
		}

	}

	public createModel(textModel: TextModel, modelVersionId: number, token: CancellationToken): Promise<FoldingRegions | null> {
		const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, textModel);
		const provider = new SyntaxRangeProvider(textModel, selectedProviders, () => this.createModel(textModel, modelVersionId, token), this._foldingLimitReporter, undefined);
		return provider.compute(token);
	}
}
