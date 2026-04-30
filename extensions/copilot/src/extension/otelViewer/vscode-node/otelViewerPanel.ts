/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { OTelSqliteStore } from '../../../platform/otel/node/sqlite/otelSqliteStore';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { OTelViewerQueries, type IViewerQuery, type IViewerResult } from './otelViewerQueries';
import { getOTelViewerHtml } from './otelViewerHtml';

const VIEW_TYPE = 'copilotChat.otelViewer';

/**
 * Manages the lifecycle of the OTel trace viewer webview panel.
 * Single-instance — if the panel is already open, reveal it instead of creating a new one.
 */
export class OTelViewerPanel extends Disposable {
	private static _current: OTelViewerPanel | undefined;

	static openOrReveal(
		store: OTelSqliteStore,
		extensionUri: vscode.Uri,
		initialTraceId?: string,
	): OTelViewerPanel {
		if (OTelViewerPanel._current) {
			OTelViewerPanel._current._panel.reveal(vscode.ViewColumn.Active);
			if (initialTraceId) {
				OTelViewerPanel._current._postInitialTrace(initialTraceId);
			}
			return OTelViewerPanel._current;
		}

		const panel = vscode.window.createWebviewPanel(
			VIEW_TYPE,
			'Agent Traces',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri],
			},
		);

		const instance = new OTelViewerPanel(panel, store, initialTraceId);
		OTelViewerPanel._current = instance;
		return instance;
	}

	private readonly _queries: OTelViewerQueries;

	private constructor(
		private readonly _panel: vscode.WebviewPanel,
		store: OTelSqliteStore,
		initialTraceId: string | undefined,
	) {
		super();
		this._queries = new OTelViewerQueries(store);

		const nonce = crypto.randomBytes(16).toString('base64');
		this._panel.webview.html = getOTelViewerHtml(this._panel.webview.cspSource, nonce, initialTraceId);

		this._register(this._panel.webview.onDidReceiveMessage(raw => this._onMessage(raw)));

		this._register(this._panel.onDidDispose(() => {
			if (OTelViewerPanel._current === this) {
				OTelViewerPanel._current = undefined;
			}
			this.dispose();
		}));
	}

	private _postInitialTrace(traceId: string): void {
		void this._panel.webview.postMessage({ type: 'openTrace', traceId });
	}

	private _onMessage(raw: unknown): void {
		if (!raw || typeof raw !== 'object') { return; }
		const msg = raw as { id?: string; query?: IViewerQuery };
		if (!msg.id || !msg.query) { return; }

		let result: IViewerResult | { type: 'error'; message: string };
		try {
			result = this._queries.handle(msg.query);
		} catch (err) {
			result = { type: 'error', message: String(err) };
		}
		void this._panel.webview.postMessage({ id: msg.id, result });
	}
}
