/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { WebviewPlotClient } from './base/webviewPlotClient.js';
import { IOverlayWebview, IWebviewService, WebviewInitInfo } from '../../../webview/browser/webview.js';
import { ShowHtmlFileEvent } from '../../../../services/languageRuntime/common/erdosUiComm.js';
import { ILanguageRuntimeSession } from '../../../../services/runtimeSession/common/runtimeSessionService.js';

/**
 * Plot client that displays HTML content from a file in a webview.
 */
export class HtmlPlotClient extends WebviewPlotClient {

	private readonly _webviewContainer = this._register(new MutableDisposable<IOverlayWebview>());
	private readonly _htmlEvents = this._register(new DisposableStore());

	private static _nextId = 0;

	constructor(
		private readonly _webviewService: IWebviewService,
		private readonly _openerService: IOpenerService,
		private readonly _commandService: ICommandService,
		private readonly _session: ILanguageRuntimeSession,
		private readonly _event: ShowHtmlFileEvent
	) {
		super({
			id: `html-plot-${HtmlPlotClient._nextId++}`,
			parent_id: '',
			created: Date.now(),
			session_id: _session.sessionId,
			code: '',
			language: _session.runtimeMetadata.languageId,
		});
	}

	get uri(): URI {
		return URI.parse(this._event.path);
	}

	protected override async initializeView() {
		if (this._webviewContainer.value) {
			throw new Error('Webview already created. Dispose existing webview first.');
		}

		const pathUri = URI.parse(this._event.path);
		const isHttpUrl = pathUri.scheme === 'http' || pathUri.scheme === 'https';

		const proxyCommand = isHttpUrl ? 'erdosProxy.startHttpProxyServer' : 'erdosProxy.startHtmlProxyServer';
		const proxyUrl = await this._commandService.executeCommand<string>(
			proxyCommand,
			this._event.path
		);

		if (!proxyUrl) {
			throw new Error(`Failed to start proxy server for ${this._event.path}`);
		}

		let resolvedUri = URI.parse(proxyUrl);
		try {
			const resolved = await this._openerService.resolveExternalUri(resolvedUri);
			resolvedUri = resolved.resolved;
		} catch {
			// Use original URI on resolution failure
		}

		const webviewInitInfo: WebviewInitInfo = {
			origin: DOM.getActiveWindow().origin,
			providedViewType: 'erdos.htmlPlot',
			title: this._event.title || 'HTML Plot',
			options: {
				enableFindWidget: true,
				retainContextWhenHidden: true,
			},
			contentOptions: {
				allowScripts: true,
				allowForms: true,
				enableCommandUris: false,
			},
			extension: this._session.runtimeMetadata.extensionId ? {
				id: this._session.runtimeMetadata.extensionId
			} : undefined
		};

		const webview = this._webviewService.createWebviewOverlay(webviewInitInfo);
		this._webviewContainer.value = webview;

		webview.setHtml(`
		<html>
			<head>
				<style>
					html, body {
						padding: 0;
						margin: 0;
						height: 100%;
						min-height: 100%;
					}
					iframe {
						width: 100%;
						height: 100%;
						border: none;
						display: block;
					}
				</style>
			</head>
			<body>
				<iframe id="html-plot-iframe" title="${this._event.title || 'HTML Plot'}" src="${resolvedUri.toString()}"></iframe>
				<script async type="module">
					const vscode = acquireVsCodeApi();
					const iframe = document.getElementById("html-plot-iframe");

					// Forward messages between iframe and host
					window.addEventListener('message', message => {
						if (message.source === iframe.contentWindow) {
							vscode.postMessage({
								__erdos_html_plot_message: true,
								...message.data
							});
						} else {
							iframe.contentWindow.postMessage(message.data, '*');
						}
					});
				</script>
			</body>
		</html>`);

		this._register(webview.onDidClickLink((link: string) => {
			this._openerService.open(URI.parse(link), {
				fromUserGesture: true
			});
		}));

		return webview;
	}

	protected override teardownView() {
		this._webviewContainer.clear();
		this._htmlEvents.clear();
	}
}

