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
import { StickyElement, StickyModel } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollElement';

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

	private _cancelModelPromise(): void {
		if (this._modelPromise) {
			this._modelPromise.cancel();
			this._modelPromise = null;
		}
	}

	public async update(textModel: ITextModel, textModelVersionId: number, token: CancellationToken): Promise<StickyModel | null> {

		this._store.clear();
		this._updateScheduler = new Delayer<StickyModel | null>(this._updateDebounceInfo.get(textModel));
		this._store.add({
			dispose: () => {
				this._cancelModelPromise();
				this._updateScheduler?.cancel();
				this._updateScheduler = null;
			}
		});
		this._cancelModelPromise();

		return await this._updateScheduler.trigger(async () => {
			const _stopWatch = new StopWatch(true);

			for (const modelProvider of this._modelProviders) {
				this._modelPromise = modelProvider.providerModelPromise;
				modelProvider.stopWatch = _stopWatch;
				modelProvider.updateScheduler = this._updateScheduler;
				modelProvider.updateDebounceInfo = this._updateDebounceInfo;

				const status = await modelProvider.computeStickyModel(
					textModel,
					textModelVersionId,
					token
				);

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

interface IStickyModelCandidateProvider {
	get stickyModel(): StickyModel | null;
	get providerModelPromise(): CancelablePromise<any> | null;
	set stopWatch(stopWatch: StopWatch | null);
	set updateDebounceInfo(updateDebounceInfo: IFeatureDebounceInformation | null);
	set updateScheduler(updateScheduler: Delayer<StickyModel | null> | null);

	/**
	 * Method which computes the sticky model and returns a status to signal whether the sticky model has been successfully found
	 * @param textmodel text-model of the editor
	 * @param modelVersionId version ID of the text-model
	 * @param token cancellation token
	 * @returns a promise of a status indicating whether the sticky model has been successfully found
	 */
	computeStickyModel(textmodel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<Status> | Status;
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

	private _invalid(): Status {
		this._stickyModel = null;
		return Status.INVALID;
	}

	public computeStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<Status> | Status {
		if (!this.isProviderValid(textModel)) {
			return this._invalid();
		}
		const providerModelPromise = this._providerModelPromise = createCancelablePromise(token => this.createModelFromProvider(textModel, modelVersionId, token));

		return providerModelPromise.then(providerModel => {
			if (!this.isModelValid(providerModel)) {
				return this._invalid();

			} else if (providerModelPromise === this._providerModelPromise && this._updateDebounceInfo && this._stopWatch && this._updateScheduler) {
				const newValue = this._updateDebounceInfo.update(textModel, this._stopWatch.elapsed());
				this._updateScheduler.defaultDelay = newValue;
			}
			if (token.isCancellationRequested) {
				return Status.CANCELED;
			}
			this._stickyModel = this.createStickyModel(textModel, modelVersionId, token, providerModel);
			return Status.VALID;
		}).then(undefined, (err) => {
			onUnexpectedError(err);
			return Status.CANCELED;
		});
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
	protected abstract createModelFromProvider(textModel: ITextModel, textModelVersionId: number, token: CancellationToken): any;

	/**
	 * Abstract method which computes the sticky model from the model returned by the provider and returns the sticky model
	 * @param textModel text-model of the editor
	 * @param textModelVersionId text-model version ID
	 * @param token cancellation token
	 * @param model model returned by the provider
	 * @returns the sticky model
	 */
	protected abstract createStickyModel(textModel: ITextModel, textModelVersionId: number, token: CancellationToken, model: any): StickyModel;
}

class StickyModelFromCandidateOutlineProvider extends StickyModelCandidateProvider {

	constructor(@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService) {
		super();
	}

	protected createModelFromProvider(textModel: ITextModel, modelVersionId: number, token: CancellationToken): Promise<OutlineModel> {
		return OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, textModel, token);
	}

	protected createStickyModel(textModel: TextModel, modelVersionId: number, token: CancellationToken, model: OutlineModel): StickyModel {
		const { stickyOutlineElement, providerID } = StickyElement.fromOutlineModel(model, this._stickyModel?.outlineProviderId);
		return new StickyModel(textModel.uri, modelVersionId, stickyOutlineElement, providerID);
	}

	protected override isModelValid(model: OutlineModel): boolean {
		return model && model.children.size > 0;
	}
}

abstract class StickyModelFromCandidateFoldingProvider extends StickyModelCandidateProvider {

	protected _foldingLimitReporter: RangesLimitReporter;

	constructor(editor: ICodeEditor) {
		super();
		this._foldingLimitReporter = new RangesLimitReporter(editor);
	}

	protected createStickyModel(textModel: ITextModel, modelVersionId: number, token: CancellationToken, model: FoldingRegions): StickyModel {
		const foldingElement = StickyElement.fromFoldingRegions(model);
		return new StickyModel(textModel.uri, modelVersionId, foldingElement, undefined);
	}

	protected override isModelValid(model: FoldingRegions): boolean {
		return model !== null;
	}
}

class StickyModelFromCandidateIndentationFoldingProvider extends StickyModelFromCandidateFoldingProvider {

	constructor(editor: ICodeEditor, @ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,) {
		super(editor);
	}

	protected createModelFromProvider(textModel: TextModel, modelVersionId: number, token: CancellationToken): Promise<FoldingRegions> {
		const provider = new IndentRangeProvider(textModel, this._languageConfigurationService, this._foldingLimitReporter);
		return provider.compute(token);
	}
}

class StickyModelFromCandidateSyntaxFoldingProvider extends StickyModelFromCandidateFoldingProvider {

	constructor(editor: ICodeEditor, @ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService) {
		super(editor);
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
