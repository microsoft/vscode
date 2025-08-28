/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { INotebookOutputWebview, IErdosNotebookOutputWebviewService } from '../../erdosOutputWebview/browser/notebookOutputWebviewService.js';
import { WebviewPlotClient } from './webviewPlotClient.js';
import { ILanguageRuntimeMessageWebOutput } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession } from '../../../services/runtimeSession/common/runtimeSessionService.js';

export class NotebookMultiMessagePlotClient extends WebviewPlotClient {

	private readonly _output = this._register(new MutableDisposable<INotebookOutputWebview>());

	private readonly _outputEvents = this._register(new DisposableStore());

	constructor(
		private readonly _notebookOutputWebviewService: IErdosNotebookOutputWebviewService,
		private readonly _session: ILanguageRuntimeSession,
		private readonly _preReqMessages: ILanguageRuntimeMessageWebOutput[],
		private readonly _displayMessage: ILanguageRuntimeMessageWebOutput,
		code?: string) {

		super({
			id: _displayMessage.id,
			parent_id: _displayMessage.parent_id,
			created: Date.parse(_displayMessage.when),
			session_id: _session.sessionId,
			code: code ? code : '',
		});
	}

	protected override async createWebview() {
		if (this._output.value) {
			throw new Error('Webview already created. Dispose the existing webview first.');
		}
		const output = await this._notebookOutputWebviewService.createMultiMessageWebview({
			runtimeId: this._session.sessionId,
			preReqMessages: this._preReqMessages,
			displayMessage: this._displayMessage,
			viewType: 'jupyter-notebook'
		});
		if (!output) {
			throw new Error('Failed to create notebook output webview');
		}
		this._output.value = output;

		this._outputEvents.add(output.onDidRender(e => {
			this.nudgeRenderThumbnail();
		}));

		return output.webview;
	}

	protected override disposeWebview() {
		this._output.clear();
		this._outputEvents.clear();
	}
}
