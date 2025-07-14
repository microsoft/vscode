/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import * as errors from '../../../../base/common/errors.js';
import { Disposable, IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { registerEditorFeature } from '../../../common/editorFeatures.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { DocumentSemanticTokensProvider, SemanticTokens, SemanticTokensEdits } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { IModelService } from '../../../common/services/model.js';
import { SemanticTokensProviderStyling, toMultilineTokens2 } from '../../../common/services/semanticTokensProviderStyling.js';
import { ISemanticTokensStylingService } from '../../../common/services/semanticTokensStyling.js';
import { IModelContentChangedEvent } from '../../../common/textModelEvents.js';
import { getDocumentSemanticTokens, hasDocumentSemanticTokensProvider, isSemanticTokens, isSemanticTokensEdits } from '../common/getSemanticTokens.js';
import { SEMANTIC_HIGHLIGHTING_SETTING_ID, isSemanticColoringEnabled } from '../common/semanticTokensConfig.js';

export class DocumentSemanticTokensFeature extends Disposable {

	private readonly _watchers = new ResourceMap<ModelSemanticColoring>();

	constructor(
		@ISemanticTokensStylingService semanticTokensStylingService: ISemanticTokensStylingService,
		@IModelService modelService: IModelService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		const register = (model: ITextModel) => {
			this._watchers.get(model.uri)?.dispose();
			this._watchers.set(model.uri, new ModelSemanticColoring(model, semanticTokensStylingService, themeService, languageFeatureDebounceService, languageFeaturesService));
		};
		const deregister = (model: ITextModel, modelSemanticColoring: ModelSemanticColoring) => {
			modelSemanticColoring.dispose();
			this._watchers.delete(model.uri);
		};
		const handleSettingOrThemeChange = () => {
			for (const model of modelService.getModels()) {
				const curr = this._watchers.get(model.uri);
				if (isSemanticColoringEnabled(model, themeService, configurationService)) {
					if (!curr) {
						register(model);
					}
				} else {
					if (curr) {
						deregister(model, curr);
					}
				}
			}
		};
		modelService.getModels().forEach(model => {
			if (isSemanticColoringEnabled(model, themeService, configurationService)) {
				register(model);
			}
		});
		this._register(modelService.onModelAdded((model) => {
			if (isSemanticColoringEnabled(model, themeService, configurationService)) {
				register(model);
			}
		}));
		this._register(modelService.onModelRemoved((model) => {
			const curr = this._watchers.get(model.uri);
			if (curr) {
				deregister(model, curr);
			}
		}));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SEMANTIC_HIGHLIGHTING_SETTING_ID)) {
				handleSettingOrThemeChange();
			}
		}));
		this._register(themeService.onDidColorThemeChange(handleSettingOrThemeChange));
	}

	override dispose(): void {
		dispose(this._watchers.values());
		this._watchers.clear();

		super.dispose();
	}
}

class ModelSemanticColoring extends Disposable {

	public static REQUEST_MIN_DELAY = 300;
	public static REQUEST_MAX_DELAY = 2000;

	private _isDisposed: boolean;
	private readonly _model: ITextModel;
	private readonly _provider: LanguageFeatureRegistry<DocumentSemanticTokensProvider>;
	private readonly _debounceInformation: IFeatureDebounceInformation;
	private readonly _fetchDocumentSemanticTokens: RunOnceScheduler;
	private _currentDocumentResponse: SemanticTokensResponse | null;
	private _currentDocumentRequestCancellationTokenSource: CancellationTokenSource | null;
	private _documentProvidersChangeListeners: IDisposable[];
	private _providersChangedDuringRequest: boolean;

	constructor(
		model: ITextModel,
		@ISemanticTokensStylingService private readonly _semanticTokensStylingService: ISemanticTokensStylingService,
		@IThemeService themeService: IThemeService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this._isDisposed = false;
		this._model = model;
		this._provider = languageFeaturesService.documentSemanticTokensProvider;
		this._debounceInformation = languageFeatureDebounceService.for(this._provider, 'DocumentSemanticTokens', { min: ModelSemanticColoring.REQUEST_MIN_DELAY, max: ModelSemanticColoring.REQUEST_MAX_DELAY });
		this._fetchDocumentSemanticTokens = this._register(new RunOnceScheduler(() => this._fetchDocumentSemanticTokensNow(), ModelSemanticColoring.REQUEST_MIN_DELAY));
		this._currentDocumentResponse = null;
		this._currentDocumentRequestCancellationTokenSource = null;
		this._documentProvidersChangeListeners = [];
		this._providersChangedDuringRequest = false;

		this._register(this._model.onDidChangeContent(() => {
			if (!this._fetchDocumentSemanticTokens.isScheduled()) {
				this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
			}
		}));
		this._register(this._model.onDidChangeAttached(() => {
			if (!this._fetchDocumentSemanticTokens.isScheduled()) {
				this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
			}
		}));
		this._register(this._model.onDidChangeLanguage(() => {
			// clear any outstanding state
			if (this._currentDocumentResponse) {
				this._currentDocumentResponse.dispose();
				this._currentDocumentResponse = null;
			}
			if (this._currentDocumentRequestCancellationTokenSource) {
				this._currentDocumentRequestCancellationTokenSource.cancel();
				this._currentDocumentRequestCancellationTokenSource = null;
			}
			this._setDocumentSemanticTokens(null, null, null, []);
			this._fetchDocumentSemanticTokens.schedule(0);
		}));

		const bindDocumentChangeListeners = () => {
			dispose(this._documentProvidersChangeListeners);
			this._documentProvidersChangeListeners = [];
			for (const provider of this._provider.all(model)) {
				if (typeof provider.onDidChange === 'function') {
					this._documentProvidersChangeListeners.push(provider.onDidChange(() => {
						if (this._currentDocumentRequestCancellationTokenSource) {
							// there is already a request running,
							this._providersChangedDuringRequest = true;
							return;
						}
						this._fetchDocumentSemanticTokens.schedule(0);
					}));
				}
			}
		};
		bindDocumentChangeListeners();
		this._register(this._provider.onDidChange(() => {
			bindDocumentChangeListeners();
			this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
		}));

		this._register(themeService.onDidColorThemeChange(_ => {
			// clear out existing tokens
			this._setDocumentSemanticTokens(null, null, null, []);
			this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
		}));

		this._fetchDocumentSemanticTokens.schedule(0);
	}

	public override dispose(): void {
		if (this._currentDocumentResponse) {
			this._currentDocumentResponse.dispose();
			this._currentDocumentResponse = null;
		}
		if (this._currentDocumentRequestCancellationTokenSource) {
			this._currentDocumentRequestCancellationTokenSource.cancel();
			this._currentDocumentRequestCancellationTokenSource = null;
		}
		dispose(this._documentProvidersChangeListeners);
		this._documentProvidersChangeListeners = [];
		this._setDocumentSemanticTokens(null, null, null, []);
		this._isDisposed = true;

		super.dispose();
	}

	private _fetchDocumentSemanticTokensNow(): void {
		if (this._currentDocumentRequestCancellationTokenSource) {
			// there is already a request running, let it finish...
			return;
		}

		if (!hasDocumentSemanticTokensProvider(this._provider, this._model)) {
			// there is no provider
			if (this._currentDocumentResponse) {
				// there are semantic tokens set
				this._model.tokenization.setSemanticTokens(null, false);
			}
			return;
		}

		if (!this._model.isAttachedToEditor()) {
			// this document is not visible, there is no need to fetch semantic tokens for it
			return;
		}

		const cancellationTokenSource = new CancellationTokenSource();
		const lastProvider = this._currentDocumentResponse ? this._currentDocumentResponse.provider : null;
		const lastResultId = this._currentDocumentResponse ? this._currentDocumentResponse.resultId || null : null;
		const request = getDocumentSemanticTokens(this._provider, this._model, lastProvider, lastResultId, cancellationTokenSource.token);
		this._currentDocumentRequestCancellationTokenSource = cancellationTokenSource;
		this._providersChangedDuringRequest = false;

		const pendingChanges: IModelContentChangedEvent[] = [];
		const contentChangeListener = this._model.onDidChangeContent((e) => {
			pendingChanges.push(e);
		});

		const sw = new StopWatch(false);
		request.then((res) => {
			this._debounceInformation.update(this._model, sw.elapsed());
			this._currentDocumentRequestCancellationTokenSource = null;
			contentChangeListener.dispose();

			if (!res) {
				this._setDocumentSemanticTokens(null, null, null, pendingChanges);
			} else {
				const { provider, tokens } = res;
				const styling = this._semanticTokensStylingService.getStyling(provider);
				this._setDocumentSemanticTokens(provider, tokens || null, styling, pendingChanges);
			}
		}, (err) => {
			const isExpectedError = err && (errors.isCancellationError(err) || (typeof err.message === 'string' && err.message.indexOf('busy') !== -1));
			if (!isExpectedError) {
				errors.onUnexpectedError(err);
			}

			// Semantic tokens eats up all errors and considers errors to mean that the result is temporarily not available
			// The API does not have a special error kind to express this...
			this._currentDocumentRequestCancellationTokenSource = null;
			contentChangeListener.dispose();

			if (pendingChanges.length > 0 || this._providersChangedDuringRequest) {
				// More changes occurred while the request was running
				if (!this._fetchDocumentSemanticTokens.isScheduled()) {
					this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
				}
			}
		});
	}

	private static _copy(src: Uint32Array, srcOffset: number, dest: Uint32Array, destOffset: number, length: number): void {
		// protect against overflows
		length = Math.min(length, dest.length - destOffset, src.length - srcOffset);
		for (let i = 0; i < length; i++) {
			dest[destOffset + i] = src[srcOffset + i];
		}
	}

	private _setDocumentSemanticTokens(provider: DocumentSemanticTokensProvider | null, tokens: SemanticTokens | SemanticTokensEdits | null, styling: SemanticTokensProviderStyling | null, pendingChanges: IModelContentChangedEvent[]): void {
		const currentResponse = this._currentDocumentResponse;
		const rescheduleIfNeeded = () => {
			if ((pendingChanges.length > 0 || this._providersChangedDuringRequest) && !this._fetchDocumentSemanticTokens.isScheduled()) {
				this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
			}
		};

		if (this._currentDocumentResponse) {
			this._currentDocumentResponse.dispose();
			this._currentDocumentResponse = null;
		}
		if (this._isDisposed) {
			// disposed!
			if (provider && tokens) {
				provider.releaseDocumentSemanticTokens(tokens.resultId);
			}
			return;
		}
		if (!provider || !styling) {
			this._model.tokenization.setSemanticTokens(null, false);
			return;
		}
		if (!tokens) {
			this._model.tokenization.setSemanticTokens(null, true);
			rescheduleIfNeeded();
			return;
		}

		if (isSemanticTokensEdits(tokens)) {
			if (!currentResponse) {
				// not possible!
				this._model.tokenization.setSemanticTokens(null, true);
				return;
			}
			if (tokens.edits.length === 0) {
				// nothing to do!
				tokens = {
					resultId: tokens.resultId,
					data: currentResponse.data
				};
			} else {
				let deltaLength = 0;
				for (const edit of tokens.edits) {
					deltaLength += (edit.data ? edit.data.length : 0) - edit.deleteCount;
				}

				const srcData = currentResponse.data;
				const destData = new Uint32Array(srcData.length + deltaLength);

				let srcLastStart = srcData.length;
				let destLastStart = destData.length;
				for (let i = tokens.edits.length - 1; i >= 0; i--) {
					const edit = tokens.edits[i];

					if (edit.start > srcData.length) {
						styling.warnInvalidEditStart(currentResponse.resultId, tokens.resultId, i, edit.start, srcData.length);
						// The edits are invalid and there's no way to recover
						this._model.tokenization.setSemanticTokens(null, true);
						return;
					}

					const copyCount = srcLastStart - (edit.start + edit.deleteCount);
					if (copyCount > 0) {
						ModelSemanticColoring._copy(srcData, srcLastStart - copyCount, destData, destLastStart - copyCount, copyCount);
						destLastStart -= copyCount;
					}

					if (edit.data) {
						ModelSemanticColoring._copy(edit.data, 0, destData, destLastStart - edit.data.length, edit.data.length);
						destLastStart -= edit.data.length;
					}

					srcLastStart = edit.start;
				}

				if (srcLastStart > 0) {
					ModelSemanticColoring._copy(srcData, 0, destData, 0, srcLastStart);
				}

				tokens = {
					resultId: tokens.resultId,
					data: destData
				};
			}
		}

		if (isSemanticTokens(tokens)) {

			this._currentDocumentResponse = new SemanticTokensResponse(provider, tokens.resultId, tokens.data);

			const result = toMultilineTokens2(tokens, styling, this._model.getLanguageId());

			// Adjust incoming semantic tokens
			if (pendingChanges.length > 0) {
				// More changes occurred while the request was running
				// We need to:
				// 1. Adjust incoming semantic tokens
				// 2. Request them again
				for (const change of pendingChanges) {
					for (const area of result) {
						for (const singleChange of change.changes) {
							area.applyEdit(singleChange.range, singleChange.text);
						}
					}
				}
			}

			this._model.tokenization.setSemanticTokens(result, true);
		} else {
			this._model.tokenization.setSemanticTokens(null, true);
		}

		rescheduleIfNeeded();
	}
}

class SemanticTokensResponse {
	constructor(
		public readonly provider: DocumentSemanticTokensProvider,
		public readonly resultId: string | undefined,
		public readonly data: Uint32Array
	) { }

	public dispose(): void {
		this.provider.releaseDocumentSemanticTokens(this.resultId);
	}
}

registerEditorFeature(DocumentSemanticTokensFeature);
