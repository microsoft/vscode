/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, createCancelablePromise, CancelablePromise } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentRangeSemanticTokensProviderRegistry, DocumentRangeSemanticTokensProvider, SemanticTokens } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { toMultilineTokens2, SemanticTokensProviderStyling } from 'vs/editor/common/services/semanticTokensProviderStyling';

class ViewportSemanticTokensContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.viewportSemanticTokens';

	public static get(editor: ICodeEditor): ViewportSemanticTokensContribution {
		return editor.getContribution<ViewportSemanticTokensContribution>(ViewportSemanticTokensContribution.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _tokenizeViewport: RunOnceScheduler;
	private _outstandingRequests: CancelablePromise<SemanticTokens | null | undefined>[];

	constructor(
		editor: ICodeEditor,
		@IModelService private readonly _modelService: IModelService
	) {
		super();
		this._editor = editor;
		this._tokenizeViewport = new RunOnceScheduler(() => this._tokenizeViewportNow(), 100);
		this._outstandingRequests = [];
		this._register(this._editor.onDidScrollChange(() => {
			this._tokenizeViewport.schedule();
		}));
		this._register(this._editor.onDidChangeModel(() => {
			this._cancelAll();
			this._tokenizeViewport.schedule();
		}));
		this._register(this._editor.onDidChangeModelContent((e) => {
			this._cancelAll();
			this._tokenizeViewport.schedule();
		}));
		this._register(DocumentRangeSemanticTokensProviderRegistry.onDidChange(() => {
			this._cancelAll();
			this._tokenizeViewport.schedule();
		}));
	}

	private static _getSemanticColoringProvider(model: ITextModel): DocumentRangeSemanticTokensProvider | null {
		const result = DocumentRangeSemanticTokensProviderRegistry.ordered(model);
		return (result.length > 0 ? result[0] : null);
	}

	private _cancelAll(): void {
		for (const request of this._outstandingRequests) {
			request.cancel();
		}
		this._outstandingRequests = [];
	}

	private _removeOutstandingRequest(req: CancelablePromise<SemanticTokens | null | undefined>): void {
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
		if (model.hasSemanticTokens()) {
			return;
		}
		const provider = ViewportSemanticTokensContribution._getSemanticColoringProvider(model);
		if (!provider) {
			return;
		}
		const styling = this._modelService.getSemanticTokensProviderStyling(provider);
		const visibleRanges = this._editor.getVisibleRanges();

		this._outstandingRequests = this._outstandingRequests.concat(visibleRanges.map(range => this._requestRange(model, range, provider, styling)));
	}

	private _requestRange(model: ITextModel, range: Range, provider: DocumentRangeSemanticTokensProvider, styling: SemanticTokensProviderStyling): CancelablePromise<SemanticTokens | null | undefined> {
		const requestVersionId = model.getVersionId();
		const request = createCancelablePromise(token => Promise.resolve(provider.provideDocumentRangeSemanticTokens(model, range, token)));
		request.then((r) => {
			if (!r || model.isDisposed() || model.getVersionId() !== requestVersionId) {
				return;
			}
			model.setPartialSemanticTokens(range, toMultilineTokens2(r, styling));
		}).then(() => this._removeOutstandingRequest(request), () => this._removeOutstandingRequest(request));
		return request;
	}
}

registerEditorContribution(ViewportSemanticTokensContribution.ID, ViewportSemanticTokensContribution);
