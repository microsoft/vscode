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
	VALID,
	NOT_VALID,
	CANCELLATION
}

export interface IStickyModelProvider {
	update(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<StickyModel | null>;
}

export class StickyModelProvider implements IStickyModelProvider {

	private _modelProviders: IStickyModelCandidateProvider[] = [];
	private _modelPromise: CancelablePromise<any | null> | null = null;
	private _updateScheduler: Delayer<StickyModel | null> | null = null;
	private readonly _updateDebounceInfo: IFeatureDebounceInformation;
	private readonly _store: DisposableStore;

	constructor(
		private _editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService _languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeatureDebounceService _languageFeatureDebounceService: ILanguageFeatureDebounceService,
		defaultModel: string) {

		switch (defaultModel) {
			case ModelProvider.OUTLINE_MODEL:
				this._modelProviders.push(new StickyModelFromCandidateOutlineProvider(_languageFeaturesService));
				this._modelProviders.push(new StickyModelFromCandidateSyntaxFoldingProvider(this._editor, _languageFeaturesService));
				this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, _languageConfigurationService));
				break;
			case ModelProvider.FOLDING_PROVIDER_MODEL:
				this._modelProviders.push(new StickyModelFromCandidateSyntaxFoldingProvider(this._editor, _languageFeaturesService));
				this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, _languageConfigurationService));
				break;
			case ModelProvider.INDENTATION_MODEL:
				this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, _languageConfigurationService));
				break;
		}

		this._updateDebounceInfo = _languageFeatureDebounceService.for(_languageFeaturesService.foldingRangeProvider, 'Sticky Scroll Folding', { min: 200 });
		this._store = new DisposableStore();
	}

	public async update(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<StickyModel | null> {

		// Clear the store in all cases
		this._store.clear();

		// New update scheduler for the update request
		this._updateScheduler = new Delayer<StickyModel | null>(this._updateDebounceInfo.get(textModel));

		// When the store is cleared, the model request and the update scheduler are cancelled
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

		// If the current model promise is not null, then cancel it before returning a new model promise
		if (this._modelPromise) {
			this._modelPromise.cancel();
			this._modelPromise = null;
		}

		return await this._updateScheduler.trigger(async () => {
			// Create a new stop-watch which will find the time it takes to compute the model which will be used to compute the sticky scroll
			const _stopWatch = new StopWatch(true);

			// Cycle through the array of model providers, until one provides a valid model, which will be used to construct the sticky model
			for (const modelProvider of this._modelProviders) {

				// model promise will point to the model promise of the model provider
				this._modelPromise = modelProvider.providerModelPromise;

				// Store the stopwatch, updateScheduler and updateDebounceInfo in the model provider for the update of the debounce information
				modelProvider.stopWatch = _stopWatch;
				modelProvider.updateScheduler = this._updateScheduler;
				modelProvider.updateDebounceInfo = this._updateDebounceInfo;

				const status = await modelProvider.getModel(
					textModel,
					modelVersionId,
					token
				);

				// If status is cancellation, then cancel the update operation by doing an early return
				switch (status) {
					case Status.CANCELLATION:
						this._store.clear();
						return null;
					case Status.VALID:
						return modelProvider.stickyModel;
				}
				// If the status is not valid, then continue to the next model provider
			}

			// If there is no valid model then return null
			return null;
		});
	}
}

interface IStickyModelCandidateProvider {
	get stickyModel(): StickyModel | null;
	get providerModelPromise(): CancelablePromise<any> | null;
	set stopWatch(stopWatch: StopWatch | null);
	set updateDebounceInfo(updateDebounceInfo: IFeatureDebounceInformation | null);
	set updateScheduler(updateScheduler: Delayer<StickyModel | null> | null);
	getModel(textmodel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<Status> | Status;
	createModelFromProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken): any;
	createStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken, model: any): any;
}

abstract class StickyModelCandidateProvider implements IStickyModelCandidateProvider {

	private _providerModelPromise: CancelablePromise<any> | null = null;
	protected _stickyModel: StickyModel | null = null;
	private _updateScheduler: Delayer<StickyModel | null> | null = null;
	private _updateDebounceInfo: IFeatureDebounceInformation | null = null;
	private _stopWatch: StopWatch | null = null;

	constructor() { }

	get stickyModel(): StickyModel | null {
		return this._stickyModel;
	}

	get providerModelPromise(): CancelablePromise<any> | null {
		return this._providerModelPromise;
	}

	set updateScheduler(updateScheduler: Delayer<StickyModel | null> | null) {
		this._updateScheduler = updateScheduler;
	}

	set updateDebounceInfo(updateDebounceInfo: IFeatureDebounceInformation | null) {
		this._updateDebounceInfo = updateDebounceInfo;
	}

	set stopWatch(stopWatch: StopWatch | null) {
		this._stopWatch = stopWatch;
	}

	private _notValid(): Status {
		this._stickyModel = null;
		return Status.NOT_VALID;
	}

	public getModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<Status> | Status {

		// Check that provider is valid
		if (!this.isProviderValid(textModel)) {
			return this._notValid();
		}
		const providerModelPromise = this._providerModelPromise = createCancelablePromise(token => this.createModelFromProvider(textModel, modelVersionId, token));
		return providerModelPromise.then(providerModel => {

			if (!this.isModelValid(providerModel)) {
				return this._notValid();

			} else if (providerModelPromise === this._providerModelPromise && this._updateDebounceInfo && this._stopWatch && this._updateScheduler) {
				// Update the time it took to find the model from the provider
				const newValue = this._updateDebounceInfo.update(textModel, this._stopWatch.elapsed());
				this._updateScheduler.defaultDelay = newValue;
			}
			// Return undefined when the token is cancelled
			if (token.isCancellationRequested) {
				return Status.CANCELLATION;
			}
			// Create the sticky model from the model of the provider
			return this.createStickyModel(textModel, modelVersionId, token, providerModel);
		}).then((status) => {
			return status;
		}, (err) => {
			onUnexpectedError(err);
			return Status.CANCELLATION;
		});
	}

	// Function which checks that the model obtained is valid, and that it can be passed on to the createStickyModel function
	// If the model is not valid, then getModel return Status.NOT_VALID
	public isModelValid(model: any): boolean {
		return true;
	}

	// Preliminary check that the selected provider can be used
	public isProviderValid(textModel: ITextModel): boolean {
		return true;
	}

	// Classes extending the StickyModelCandidateProvider should implement the following two methods
	// createModelFromProvider creates a model from the provider which will be used to define the sticky model
	// creatStickyModel creates the actual sticky model from the previous model returned by the provider
	abstract createModelFromProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken): any;
	abstract createStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken, model: any): Status;
}

class StickyModelFromCandidateOutlineProvider extends StickyModelCandidateProvider {

	constructor(@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService) {
		super();
	}

	// Looks like not using the modelVersionId here
	public createModelFromProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<OutlineModel> {
		return OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, textModel, token);
	}

	public createStickyModel(textModel: TextModel, modelVersionId: number, token: CancellationToken, model: OutlineModel): Status {
		// Suppose the folding model is null or it has no regions, then return false
		const { stickyOutlineElement, providerID } = StickyElement.fromOutlineModel(model, this._stickyModel?.outlineProviderId);
		this._stickyModel = new StickyModel(textModel.uri, modelVersionId, stickyOutlineElement, providerID);
		return Status.VALID;
	}

	public override isModelValid(model: OutlineModel): boolean {
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
		this._stickyModel = new StickyModel(textModel.uri, modelVersionId, foldingElement, undefined);
		return Status.VALID;
	}

	public override isModelValid(model: FoldingRegions): boolean {
		return model !== null;
	}
}

class StickyModelFromCandidateIndentationFoldingProvider extends StickyModelFromCandidateFoldingProvider {

	constructor(editor: ICodeEditor, @ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,) {
		super(editor);
	}

	public createModelFromProvider(textModel: TextModel, modelVersionId: number, token: CancellationToken): Promise<FoldingRegions | null> {
		const provider = new IndentRangeProvider(textModel, this._languageConfigurationService, this._foldingLimitReporter);
		return provider.compute(token);
	}
}

class StickyModelFromCandidateSyntaxFoldingProvider extends StickyModelFromCandidateFoldingProvider {
	constructor(editor: ICodeEditor, @ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService) {
		super(editor);
	}

	public override isProviderValid(textModel: TextModel): boolean {
		// Checking that a syntax folding provider exists
		const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, textModel);
		if (selectedProviders.length > 0) {
			return true;
		} else {
			return false;
		}

	}

	public createModelFromProvider(textModel: TextModel, modelVersionId: number, token: CancellationToken): Promise<FoldingRegions | null> {
		const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, textModel);
		const provider = new SyntaxRangeProvider(textModel, selectedProviders, () => this.createModelFromProvider(textModel, modelVersionId, token), this._foldingLimitReporter, undefined);
		return provider.compute(token);
	}
}
