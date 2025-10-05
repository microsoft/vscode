/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { INotebookOutputWebview, IErdosNotebookOutputWebviewService } from '../../../erdosOutputWebview/browser/notebookOutputWebviewService.js';
import { AbstractWebviewClient } from './base/abstractWebviewClient.js';
import { ILanguageRuntimeMessageWebOutput } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession } from '../../../../services/runtimeSession/common/runtimeSessionService.js';

/**
 * Client managing complex notebook widgets requiring multiple prerequisite messages.
 */
export class MultiMessageWidgetClient extends AbstractWebviewClient {

	private readonly _webviewOutput = this._register(new MutableDisposable<INotebookOutputWebview>());
	private readonly _outputEventHandlers = this._register(new DisposableStore());

	constructor(
		private readonly _webviewProvider: IErdosNotebookOutputWebviewService,
		private readonly _runtimeSession: ILanguageRuntimeSession,
		private readonly _prerequisiteMessages: ILanguageRuntimeMessageWebOutput[],
		private readonly _primaryDisplayMessage: ILanguageRuntimeMessageWebOutput,
		sourceCode?: string) {

		super({
			id: _primaryDisplayMessage.id,
			parent_id: _primaryDisplayMessage.parent_id,
			created: Date.parse(_primaryDisplayMessage.when),
			session_id: _runtimeSession.sessionId,
			code: sourceCode ? sourceCode : '',
			language: _runtimeSession.runtimeMetadata.languageId,
		});
	}

	protected override async initializeView() {
		if (this._webviewOutput.value) {
			throw new Error('Webview already instantiated. Dispose existing instance first.');
		}
		const webviewInstance = await this._webviewProvider.createMultiMessageWebview({
			runtimeId: this._runtimeSession.sessionId,
			preReqMessages: this._prerequisiteMessages,
			displayMessage: this._primaryDisplayMessage,
			viewType: 'jupyter-notebook'
		});
		if (!webviewInstance) {
			console.error('[MultiMessageWidgetClient] Failed to create webview instance');
			throw new Error('Failed to instantiate multi-message webview');
		}
		this._webviewOutput.value = webviewInstance;

		this._outputEventHandlers.add(webviewInstance.onDidRender(e => {
			console.log('[MultiMessageWidgetClient] onDidRender fired');
			this.triggerThumbnailCapture();
		}));

		return webviewInstance.webview;
	}

	protected override teardownView() {
		this._webviewOutput.clear();
		this._outputEventHandlers.clear();
	}
}

