/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { Codicon } from '../../../base/common/codicons.js';
import type * as vscode from 'vscode';
import { BrowserTabDto, ExtHostBrowsersShape, IMainContext, MainContext, MainThreadBrowsersShape } from './extHost.protocol.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as extHostTypes from './extHostTypes.js';
import * as typeConverters from './extHostTypeConverters.js';
import { CDPEvent, CDPRequest, CDPResponse } from '../../../platform/browserView/common/cdp/types.js';

// #region Internal browser tab object

class ExtHostBrowserTab {
	private _url: string;
	private _title: string;
	private _favicon: string | undefined;

	readonly value: vscode.BrowserTab;

	constructor(
		readonly id: string,
		private readonly _proxy: MainThreadBrowsersShape,
		private readonly _sessions: DisposableMap<string, ExtHostBrowserCDPSession>,
		data: BrowserTabDto,
	) {
		this._url = data.url;
		this._title = data.title;
		this._favicon = data.favicon;

		const that = this;
		this.value = {
			get url(): string { return that._url; },
			get title(): string { return that._title; },
			get icon(): vscode.IconPath {
				return that._favicon
					? URI.parse(that._favicon)
					: new extHostTypes.ThemeIcon(Codicon.globe.id) as vscode.ThemeIcon;
			},
			startCDPSession(): Promise<vscode.BrowserCDPSession> {
				return that._startCDPSession();
			},
			close(): Promise<void> {
				return that._close();
			}
		};
	}

	update(data: BrowserTabDto): boolean {
		let changed = false;
		if (data.url !== this._url) {
			this._url = data.url;
			changed = true;
		}
		if (data.title !== this._title) {
			this._title = data.title;
			changed = true;
		}
		if (data.favicon !== this._favicon) {
			this._favicon = data.favicon;
			changed = true;
		}
		return changed;
	}

	private async _startCDPSession(): Promise<vscode.BrowserCDPSession> {
		const sessionId = generateUuid();
		await this._proxy.$startCDPSession(sessionId, this.id);
		const session = new ExtHostBrowserCDPSession(sessionId, this._proxy);
		this._sessions.set(sessionId, session);
		return session.value;
	}

	private async _close(): Promise<void> {
		await this._proxy.$closeBrowserTab(this.id);
	}
}

// #endregion

// #region CDP Session

class ExtHostBrowserCDPSession {
	private readonly _onDidReceiveMessage = new Emitter<unknown>();
	private readonly _onDidClose = new Emitter<void>();

	private _closed = false;

	readonly value: vscode.BrowserCDPSession;

	constructor(
		readonly id: string,
		private readonly _proxy: MainThreadBrowsersShape,
	) {
		const that = this;
		this.value = {
			get onDidReceiveMessage(): Event<unknown> { return that._onDidReceiveMessage.event; },
			get onDidClose(): Event<void> { return that._onDidClose.event; },
			sendMessage(message: unknown): Promise<void> {
				return that._sendMessage(message as CDPRequest);
			},
			close(): Promise<void> {
				return that._close();
			}
		};
	}

	dispose(): void {
		this._onDidReceiveMessage.dispose();
		this._onDidClose.dispose();
	}

	private async _sendMessage(message: CDPRequest): Promise<void> {
		if (this._closed) {
			throw new Error('Session is closed');
		}
		if (!message || typeof message !== 'object') {
			throw new Error('Message must be an object');
		}
		if (typeof message.id !== 'number') {
			throw new Error('Message must have a numeric id');
		}
		if (typeof message.method !== 'string') {
			throw new Error('Message must have a method string');
		}
		if (message.params !== undefined && typeof message.params !== 'object') {
			throw new Error('Message params must be an object');
		}
		if (message.sessionId !== undefined && typeof message.sessionId !== 'string') {
			throw new Error('Message sessionId must be a string');
		}
		await this._proxy.$sendCDPMessage(this.id, { id: message.id, method: message.method, params: message.params, sessionId: message.sessionId });
	}

	private async _close(): Promise<void> {
		this._closed = true;
		await this._proxy.$closeCDPSession(this.id);
	}

	// Called from main thread
	_acceptMessage(message: unknown): void {
		this._onDidReceiveMessage.fire(message);
	}

	_acceptClosed(): void {
		this._closed = true;
		this._onDidClose.fire();
	}
}

// #endregion

export class ExtHostBrowsers extends Disposable implements ExtHostBrowsersShape {
	private readonly _proxy: MainThreadBrowsersShape;
	private readonly _browserTabs = new Map<string, ExtHostBrowserTab>();
	private readonly _sessions = this._register(new DisposableMap<string, ExtHostBrowserCDPSession>());

	private _activeBrowserTabId: string | undefined;

	private readonly _onDidOpenBrowserTab = this._register(new Emitter<vscode.BrowserTab>());
	readonly onDidOpenBrowserTab: Event<vscode.BrowserTab> = this._onDidOpenBrowserTab.event;

	private readonly _onDidCloseBrowserTab = this._register(new Emitter<vscode.BrowserTab>());
	readonly onDidCloseBrowserTab: Event<vscode.BrowserTab> = this._onDidCloseBrowserTab.event;

	private readonly _onDidChangeActiveBrowserTab = this._register(new Emitter<vscode.BrowserTab | undefined>());
	readonly onDidChangeActiveBrowserTab: Event<vscode.BrowserTab | undefined> = this._onDidChangeActiveBrowserTab.event;

	private readonly _onDidChangeBrowserTabState = this._register(new Emitter<vscode.BrowserTab>());
	readonly onDidChangeBrowserTabState: Event<vscode.BrowserTab> = this._onDidChangeBrowserTabState.event;

	constructor(mainContext: IMainContext) {
		super();
		this._proxy = mainContext.getProxy(MainContext.MainThreadBrowsers);
	}

	// #region Public API (called from extension code)

	get browserTabs(): readonly vscode.BrowserTab[] {
		return [...this._browserTabs.values()].map(t => t.value);
	}

	get activeBrowserTab(): vscode.BrowserTab | undefined {
		if (this._activeBrowserTabId) {
			return this._browserTabs.get(this._activeBrowserTabId)?.value;
		}
		return undefined;
	}

	async openBrowserTab(url: string, options?: vscode.BrowserTabShowOptions): Promise<vscode.BrowserTab> {
		const viewColumn = typeConverters.ViewColumn.from(options?.viewColumn);
		const dto = await this._proxy.$openBrowserTab(url, viewColumn, {
			preserveFocus: options?.preserveFocus,
			inactive: options?.background,
		});

		return this._getOrCreateTab(dto).value;
	}

	// #endregion

	// #region Internal helpers

	private _getOrCreateTab(dto: BrowserTabDto): ExtHostBrowserTab {
		let tab = this._browserTabs.get(dto.id);
		if (!tab) {
			tab = new ExtHostBrowserTab(dto.id, this._proxy, this._sessions, dto);
			this._browserTabs.set(dto.id, tab);
			this._onDidOpenBrowserTab.fire(tab.value);
		} else {
			tab.update(dto);
		}
		return tab;
	}

	// #endregion

	// #region Main thread callbacks

	$onDidOpenBrowserTab(dto: BrowserTabDto): void {
		this._getOrCreateTab(dto);
	}

	$onDidCloseBrowserTab(browserId: string): void {
		const tab = this._browserTabs.get(browserId);
		if (tab) {
			this._browserTabs.delete(browserId);
			if (this._activeBrowserTabId === browserId) {
				this._activeBrowserTabId = undefined;
			}
			this._onDidCloseBrowserTab.fire(tab.value);
		}
	}

	$onDidChangeActiveBrowserTab(dto: BrowserTabDto | undefined): void {
		this._activeBrowserTabId = dto?.id;
		if (dto) {
			this._getOrCreateTab(dto);
		}
		this._onDidChangeActiveBrowserTab.fire(this.activeBrowserTab);
	}

	$onDidChangeBrowserTabState(browserId: string, data: BrowserTabDto): void {
		const tab = this._browserTabs.get(browserId);
		if (tab && tab.update(data)) {
			this._onDidChangeBrowserTabState.fire(tab.value);
		}
	}

	$onCDPSessionMessage(sessionId: string, message: CDPResponse | CDPEvent): void {
		const session = this._sessions.get(sessionId);
		if (session) {
			session._acceptMessage(message);
		}
	}

	$onCDPSessionClosed(sessionId: string): void {
		const session = this._sessions.get(sessionId);
		if (session) {
			session._acceptClosed();
			this._sessions.deleteAndDispose(sessionId);
		}
	}

	// #endregion
}
