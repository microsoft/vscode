/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { INotebookOutputWebview, IErdosNotebookOutputWebviewService } from '../../../erdosOutputWebview/browser/notebookOutputWebviewService.js';
import { AbstractWebviewClient } from './base/abstractWebviewClient.js';
import { ILanguageRuntimeMessageOutput } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { IConsoleCodeAttribution } from '../../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';

/**
 * Client managing notebook output rendered in a webview for the plots pane.
 */
export class NotebookWidgetClient extends AbstractWebviewClient {

	private readonly _webviewOutput = this._register(new MutableDisposable<INotebookOutputWebview>());
	private readonly _outputEventHandlers = this._register(new DisposableStore());

	constructor(
		private readonly _webviewProvider: IErdosNotebookOutputWebviewService,
		private readonly _runtimeSession: ILanguageRuntimeSession,
		private readonly _outputMessage: ILanguageRuntimeMessageOutput,
		sourceCode?: string,
		attributionInfo?: IConsoleCodeAttribution) {

		console.log('[NotebookWidgetClient] Constructor - message id:', _outputMessage.id);
		let sourceFilePath: string | undefined;
		let sourceCategory: string | undefined;
		let executionBatchId: string | undefined;

		if (attributionInfo) {
			sourceCategory = attributionInfo.source;
			executionBatchId = attributionInfo.batchId;
			if (attributionInfo.metadata?.file) {
				sourceFilePath = attributionInfo.metadata.file;
			}
		}

		super({
			id: _outputMessage.id,
			parent_id: _outputMessage.parent_id,
			created: Date.parse(_outputMessage.when),
			session_id: _runtimeSession.sessionId,
			code: sourceCode ? sourceCode : '',
			output_id: _outputMessage.output_id,
			language: _runtimeSession.runtimeMetadata.languageId,
			source_file: sourceFilePath,
			source_type: sourceCategory,
			batch_id: executionBatchId
		});
		console.log('[NotebookWidgetClient] Constructor complete');
	}

	protected override async initializeView() {
		console.log('[NotebookWidgetClient] initializeView called for plot:', this.id);
		if (this._webviewOutput.value) {
			throw new Error('Webview already instantiated. Dispose existing instance first.');
		}
		console.log('[NotebookWidgetClient] Creating notebook output webview');
		const webviewInstance = await this._webviewProvider.createNotebookOutputWebview({
			id: this.id,
			runtime: this._runtimeSession,
			output: this._outputMessage,
			viewType: 'jupyter-notebook'
		});
		if (!webviewInstance) {
			console.error('[NotebookWidgetClient] Failed to create webview instance');
			throw new Error('Failed to instantiate notebook output webview');
		}

		console.log('[NotebookWidgetClient] Webview created successfully');
		this._webviewOutput.value = webviewInstance;
		this._outputEventHandlers.add(webviewInstance.onDidRender(e => {
			console.log('[NotebookWidgetClient] onDidRender fired');
			this.triggerThumbnailCapture();
		}));

		return webviewInstance.webview;
	}

	protected override teardownView() {
		this._webviewOutput.clear();
		this._outputEventHandlers.clear();
	}
}

