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

class ExtHostBrowserTab implements vscode.BrowserTab {
	private _url: string;
	private _title: string;
	private _favicon: string | undefined;

	url!: string;
	title!: string;
	icon!: vscode.IconPath;

	constructor(
		readonly id: string,
		private readonly _proxy: MainThreadBrowsersShape,
		private readonly _sessions: DisposableMap<string, ExtHostBrowserCDPSession>,
		data: BrowserTabDto,
	) {
		this._url = data.url;
		this._title = data.title;
		this._favicon = data.favicon;
		this._syncProperties();
	}

	private _syncProperties(): void {
		this.url = this._url;
		this.title = this._title;
		this.icon = this._favicon
			? URI.parse(this._favicon)
			: new extHostTypes.ThemeIcon(Codicon.globe.id) as vscode.ThemeIcon;
	}

	update(data: Partial<BrowserTabDto>): boolean {
		let changed = false;
		if (data.url !== undefined && data.url !== this._url) {
			this._url = data.url;
			changed = true;
		}
		if (data.title !== undefined && data.title !== this._title) {
			this._title = data.title;
			changed = true;
		}
		if (data.favicon !== undefined && data.favicon !== this._favicon) {
			this._favicon = data.favicon;
			changed = true;
		}
		if (changed) {
			this._syncProperties();
		}
		return changed;
	}

	async startCDPSession(): Promise<vscode.BrowserCDPSession> {
		const sessionId = generateUuid();
		await this._proxy.$startCDPSession(sessionId, this.id);
		const session = new ExtHostBrowserCDPSession(sessionId, this._proxy);
		this._sessions.set(sessionId, session);
		return session;
	}

	async close(): Promise<void> {
		await this._proxy.$closeBrowserTab(this.id);
	}
}

// #endregion

// #region CDP Session

class ExtHostBrowserCDPSession implements vscode.BrowserCDPSession {
	private readonly _onDidReceiveMessage = new Emitter<unknown>();
	readonly onDidReceiveMessage: Event<unknown> = this._onDidReceiveMessage.event;

	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose: Event<void> = this._onDidClose.event;

	private _closed = false;

	constructor(
		readonly id: string,
		private readonly _proxy: MainThreadBrowsersShape,
	) { }

	dispose(): void {
		this._onDidReceiveMessage.dispose();
		this._onDidClose.dispose();
	}

	async sendMessage(message: CDPRequest): Promise<void> {
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

	async close(): Promise<void> {
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
		return [...this._browserTabs.values()];
	}

	get activeBrowserTab(): vscode.BrowserTab | undefined {
		if (this._activeBrowserTabId) {
			return this._browserTabs.get(this._activeBrowserTabId);
		}
		return undefined;
	}

	async openBrowserTab(url: string, options?: vscode.BrowserTabShowOptions): Promise<vscode.BrowserTab> {
		const viewColumn = typeConverters.ViewColumn.from(options?.viewColumn);
		const dto = await this._proxy.$openBrowserTab(url, viewColumn, {
			preserveFocus: options?.preserveFocus,
			inactive: options?.background,
		});

		let tab = this._browserTabs.get(dto.id);
		if (!tab) {
			tab = new ExtHostBrowserTab(dto.id, this._proxy, this._sessions, dto);
			this._browserTabs.set(dto.id, tab);
		} else {
			tab.update(dto);
		}

		return tab;
	}

	// #endregion

	// #region Main thread callbacks

	$onDidOpenBrowserTab(dto: BrowserTabDto): void {
		let tab = this._browserTabs.get(dto.id);
		if (!tab) {
			tab = new ExtHostBrowserTab(dto.id, this._proxy, this._sessions, dto);
			this._browserTabs.set(dto.id, tab);
		} else {
			tab.update(dto);
		}
		this._onDidOpenBrowserTab.fire(tab);
	}

	$onDidCloseBrowserTab(browserId: string): void {
		const tab = this._browserTabs.get(browserId);
		if (tab) {
			this._browserTabs.delete(browserId);
			this._onDidCloseBrowserTab.fire(tab);
		}
	}

	$onDidChangeActiveBrowserTab(dto: BrowserTabDto | undefined): void {
		this._activeBrowserTabId = dto?.id;
		if (dto && !this._browserTabs.has(dto.id)) {
			const tab = new ExtHostBrowserTab(dto.id, this._proxy, this._sessions, dto);
			this._browserTabs.set(dto.id, tab);
		}
		this._onDidChangeActiveBrowserTab.fire(this.activeBrowserTab);
	}

	$onDidChangeBrowserTab(browserId: string, data: Partial<BrowserTabDto>): void {
		const tab = this._browserTabs.get(browserId);
		if (tab && tab.update(data)) {
			this._onDidChangeBrowserTabState.fire(tab);
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
