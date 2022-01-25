/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentRangeSemanticTokensProviderRegistry } from 'vs/editor/common/languages';
import { getDocumentRangeSemanticTokens, hasDocumentRangeSemanticTokensProvider } from 'vs/editor/common/services/getSemanticTokens';
import { IModelService } from 'vs/editor/common/services/model';
import { isSemanticColoringEnabled, SEMANTIC_HIGHLIGHTING_SETTING_ID } from 'vs/editor/common/services/modelService';
import { toMultilineTokens2 } from 'vs/editor/common/services/semanticTokensProviderStyling';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { StopWatch } from 'vs/base/common/stopwatch';

class ViewportSemanticTokensContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.viewportSemanticTokens';

	public static get(editor: ICodeEditor): ViewportSemanticTokensContribution | null {
		return editor.getContribution<ViewportSemanticTokensContribution>(ViewportSemanticTokensContribution.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _debounceInformation: IFeatureDebounceInformation;
	private readonly _tokenizeViewport: RunOnceScheduler;
	private _outstandingRequests: CancelablePromise<any>[];

	constructor(
		editor: ICodeEditor,
		@IModelService private readonly _modelService: IModelService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService
	) {
		super();
		this._editor = editor;
		this._debounceInformation = languageFeatureDebounceService.for(DocumentRangeSemanticTokensProviderRegistry, 'DocumentRangeSemanticTokens', { min: 100, max: 500 });
		this._tokenizeViewport = new RunOnceScheduler(() => this._tokenizeViewportNow(), 100);
		this._outstandingRequests = [];
		const scheduleTokenizeViewport = () => {
			if (this._editor.hasModel()) {
				this._tokenizeViewport.schedule(this._debounceInformation.get(this._editor.getModel()));
			}
		};
		this._register(this._editor.onDidScrollChange(() => {
			scheduleTokenizeViewport();
		}));
		this._register(this._editor.onDidChangeModel(() => {
			this._cancelAll();
			scheduleTokenizeViewport();
		}));
		this._register(this._editor.onDidChangeModelContent((e) => {
			this._cancelAll();
			scheduleTokenizeViewport();
		}));
		this._register(DocumentRangeSemanticTokensProviderRegistry.onDidChange(() => {
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
	}

	private _cancelAll(): void {
		for (const request of this._outstandingRequests) {
			request.cancel();
		}
		this._outstandingRequests = [];
	}

	private _removeOutstandingRequest(req: CancelablePromise<any>): void {
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
		if (model.hasCompleteSemanticTokens()) {
			return;
		}
		if (!isSemanticColoringEnabled(model, this._themeService, this._configurationService)) {
			if (model.hasSomeSemanticTokens()) {
				model.setSemanticTokens(null, false);
			}
			return;
		}
		if (!hasDocumentRangeSemanticTokensProvider(model)) {
			if (model.hasSomeSemanticTokens()) {
				model.setSemanticTokens(null, false);
			}
			return;
		}
		const visibleRanges = this._editor.getVisibleRangesPlusViewportAboveBelow();

		this._outstandingRequests = this._outstandingRequests.concat(visibleRanges.map(range => this._requestRange(model, range)));
	}

	private _requestRange(model: ITextModel, range: Range): CancelablePromise<any> {
		const requestVersionId = model.getVersionId();
		const request = createCancelablePromise(token => Promise.resolve(getDocumentRangeSemanticTokens(model, range, token)));
		const sw = new StopWatch(false);
		request.then((r) => {
			this._debounceInformation.update(model, sw.elapsed());
			if (!r || !r.tokens || model.isDisposed() || model.getVersionId() !== requestVersionId) {
				return;
			}
			const { provider, tokens: result } = r;
			const styling = this._modelService.getSemanticTokensProviderStyling(provider);
			model.setPartialSemanticTokens(range, toMultilineTokens2(result, styling, model.getLanguageId()));
		}).then(() => this._removeOutstandingRequest(request), () => this._removeOutstandingRequest(request));
		return request;
	}
}

registerEditorContribution(ViewportSemanticTokensContribution.ID, ViewportSemanticTokensContribution);
