/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { Range } from '../../../common/core/range.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';
import { getDocumentRangeSemanticTokens, hasDocumentRangeSemanticTokensProvider } from '../common/getSemanticTokens.js';
import { isSemanticColoringEnabled, SEMANTIC_HIGHLIGHTING_SETTING_ID } from '../common/semanticTokensConfig.js';
import { toMultilineTokens2 } from '../../../common/services/semanticTokensProviderStyling.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { DocumentRangeSemanticTokensProvider } from '../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ISemanticTokensStylingService } from '../../../common/services/semanticTokensStyling.js';

export class ViewportSemanticTokensContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.viewportSemanticTokens';

	public static get(editor: ICodeEditor): ViewportSemanticTokensContribution | null {
		return editor.getContribution<ViewportSemanticTokensContribution>(ViewportSemanticTokensContribution.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _provider: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>;
	private readonly _debounceInformation: IFeatureDebounceInformation;
	private readonly _tokenizeViewport: RunOnceScheduler;
	private _outstandingRequests: CancelablePromise<unknown>[];
	private _rangeProvidersChangeListeners: IDisposable[];

	constructor(
		editor: ICodeEditor,
		@ISemanticTokensStylingService private readonly _semanticTokensStylingService: ISemanticTokensStylingService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._editor = editor;
		this._provider = languageFeaturesService.documentRangeSemanticTokensProvider;
		this._debounceInformation = languageFeatureDebounceService.for(this._provider, 'DocumentRangeSemanticTokens', { min: 100, max: 500 });
		this._tokenizeViewport = this._register(new RunOnceScheduler(() => this._tokenizeViewportNow(), 100));
		this._outstandingRequests = [];
		this._rangeProvidersChangeListeners = [];
		const scheduleTokenizeViewport = () => {
			if (this._editor.hasModel()) {
				this._tokenizeViewport.schedule(this._debounceInformation.get(this._editor.getModel()));
			}
		};
		const bindRangeProvidersChangeListeners = () => {
			this._cleanupProviderListeners();
			if (this._editor.hasModel()) {
				const model = this._editor.getModel();
				for (const provider of this._provider.all(model)) {
					const disposable = provider.onDidChange?.(() => {
						this._cancelAll();
						scheduleTokenizeViewport();
					});
					if (disposable) {
						this._rangeProvidersChangeListeners.push(disposable);
					}
				}
			}
		};

		this._register(this._editor.onDidScrollChange(() => {
			scheduleTokenizeViewport();
		}));
		this._register(this._editor.onDidChangeModel(() => {
			bindRangeProvidersChangeListeners();
			this._cancelAll();
			scheduleTokenizeViewport();
		}));
		this._register(this._editor.onDidChangeModelLanguage(() => {
			// The cleanup of the model's semantic tokens happens in the DocumentSemanticTokensFeature
			bindRangeProvidersChangeListeners();
			this._cancelAll();
			scheduleTokenizeViewport();
		}));
		this._register(this._editor.onDidChangeModelContent((e) => {
			this._cancelAll();
			scheduleTokenizeViewport();
		}));

		bindRangeProvidersChangeListeners();
		this._register(this._provider.onDidChange(() => {
			bindRangeProvidersChangeListeners();
			this._cancelAll();
			scheduleTokenizeViewport();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SEMANTIC_HIGHLIGHTING_SETTING_ID)) {
				this._cancelAll();
				scheduleTokenizeViewport();
			}
		}));
		this._register(this._themeService.onDidColorThemeChange(() => {
			this._cancelAll();
			scheduleTokenizeViewport();
		}));
		scheduleTokenizeViewport();
	}

	public override dispose(): void {
		this._cleanupProviderListeners();
		super.dispose();
	}

	private _cleanupProviderListeners(): void {
		dispose(this._rangeProvidersChangeListeners);
		this._rangeProvidersChangeListeners = [];
	}

	private _cancelAll(): void {
		for (const request of this._outstandingRequests) {
			request.cancel();
		}
		this._outstandingRequests = [];
	}

	private _removeOutstandingRequest(req: CancelablePromise<unknown>): void {
		for (let i = 0, len = this._outstandingRequests.length; i < len; i++) {
			if (this._outstandingRequests[i] === req) {
				this._outstandingRequests.splice(i, 1);
				return;
			}
		}
	}

	private _tokenizeViewportNow(): void {
		if (!this._editor.hasModel()) {
			return;
		}
		const model = this._editor.getModel();
		if (model.tokenization.hasCompleteSemanticTokens()) {
			return;
		}
		if (!isSemanticColoringEnabled(model, this._themeService, this._configurationService)) {
			if (model.tokenization.hasSomeSemanticTokens()) {
				model.tokenization.setSemanticTokens(null, false);
			}
			return;
		}
		if (!hasDocumentRangeSemanticTokensProvider(this._provider, model)) {
			if (model.tokenization.hasSomeSemanticTokens()) {
				model.tokenization.setSemanticTokens(null, false);
			}
			return;
		}
		const visibleRanges = this._editor.getVisibleRangesPlusViewportAboveBelow();

		this._outstandingRequests = this._outstandingRequests.concat(visibleRanges.map(range => this._requestRange(model, range)));
	}

	private _requestRange(model: ITextModel, range: Range): CancelablePromise<unknown> {
		const requestVersionId = model.getVersionId();
		const request = createCancelablePromise(token => Promise.resolve(getDocumentRangeSemanticTokens(this._provider, model, range, token)));
		const sw = new StopWatch(false);
		request.then((r) => {
			this._debounceInformation.update(model, sw.elapsed());
			if (!r || !r.tokens || model.isDisposed() || model.getVersionId() !== requestVersionId) {
				return;
			}
			const { provider, tokens: result } = r;
			const styling = this._semanticTokensStylingService.getStyling(provider);
			model.tokenization.setPartialSemanticTokens(range, toMultilineTokens2(result, styling, model.getLanguageId()));
		}).then(() => this._removeOutstandingRequest(request), () => this._removeOutstandingRequest(request));
		return request;
	}
}

registerEditorContribution(ViewportSemanticTokensContribution.ID, ViewportSemanticTokensContribution, EditorContributionInstantiation.AfterFirstRender);
