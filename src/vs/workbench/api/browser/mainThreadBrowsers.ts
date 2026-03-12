/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { BrowserTabDto, ExtHostBrowsersShape, ExtHostContext, MainContext, MainThreadBrowsersShape } from '../common/extHost.protocol.js';
import { IBrowserViewWorkbenchService, IBrowserViewCDPService, IBrowserViewModel } from '../../contrib/browserView/common/browserView.js';
import { BrowserViewUri } from '../../../platform/browserView/common/browserViewUri.js';
import { EditorGroupColumn, columnToEditorGroup } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IEditorOptions } from '../../../platform/editor/common/editor.js';
import { IEditorIdentifier } from '../../common/editor.js';
import { CDPRequest } from '../../../platform/browserView/common/cdp/types.js';

const BROWSER_EDITOR_INPUT_ID = 'workbench.editorinputs.browser';

@extHostNamedCustomer(MainContext.MainThreadBrowsers)
export class MainThreadBrowsers extends Disposable implements MainThreadBrowsersShape {

	private readonly _proxy: ExtHostBrowsersShape;

	/** Maps CDP session IDs to disposables. */
	private readonly _sessions = this._register(new DisposableMap<string, DisposableStore>());
	/** Maps CDP session ID to group ID for message routing. */
	private readonly _sessionGroupIds = new Map<string, string>();

	/** Browser view models we are currently tracking. */
	private readonly _trackedModels = this._register(new DisposableMap<string, DisposableStore>());

	/** Set of browser IDs currently known to the ext host. */
	private readonly _knownBrowserIds = new Set<string>();

	constructor(
		extHostContext: IExtHostContext,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserViewWorkbenchService private readonly browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@IBrowserViewCDPService private readonly cdpService: IBrowserViewCDPService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostBrowsers);

		// Track open browser editors
		this._register(this.editorService.onDidVisibleEditorsChange(() => this._syncOpenBrowserTabs()));
		this._register(this.editorService.onDidActiveEditorChange(() => this._syncActiveBrowserTab()));

		// Initial sync
		this._syncOpenBrowserTabs();
		this._syncActiveBrowserTab();
	}

	// #region Browser tab open

	async $openBrowserTab(url: string, viewColumn?: EditorGroupColumn, options?: IEditorOptions): Promise<BrowserTabDto> {
		const browserUri = BrowserViewUri.forUrl(url);
		const parsed = BrowserViewUri.parse(browserUri)!;

		await this.editorService.openEditor(
			{
				resource: browserUri,
				options
			},
			columnToEditorGroup(this.editorGroupsService, this.configurationService, viewColumn),
		);

		const model = await this._resolveAndTrack(parsed.id);
		if (!model) {
			throw new Error(`Failed to open browser tab`);
		}

		// Wait for the initial navigation to complete before resolving
		if (url !== 'about:blank' && model.url !== url) {
			await Event.toPromise(model.onDidNavigate);
		}

		return this._toDto(model);
	}

	// #endregion

	// #region Browser tab tracking

	private _getOpenBrowserIds(): string[] {
		const result: string[] = [];
		for (const editor of this.editorService.editors) {
			if (editor.typeId === BROWSER_EDITOR_INPUT_ID && editor.resource) {
				const parsed = BrowserViewUri.parse(editor.resource);
				if (parsed) {
					result.push(parsed.id);
				}
			}
		}
		return result;
	}

	private async _syncOpenBrowserTabs(): Promise<void> {
		const entries = this._getOpenBrowserIds();
		const currentIds = new Set<string>();

		for (const browserId of entries) {
			currentIds.add(browserId);
			if (!this._knownBrowserIds.has(browserId)) {
				this._knownBrowserIds.add(browserId);
				const model = await this._resolveAndTrack(browserId);
				if (model) {
					this._proxy.$onDidOpenBrowserTab(this._toDto(model));
				} else {
					this._knownBrowserIds.delete(browserId);
				}
			}
		}

		// Fire close events for browsers that are no longer open
		for (const id of this._knownBrowserIds) {
			if (!currentIds.has(id)) {
				this._knownBrowserIds.delete(id);
				this._proxy.$onDidCloseBrowserTab(id);
			}
		}
	}

	private async _syncActiveBrowserTab(): Promise<void> {
		const active = this.editorService.activeEditorPane?.input;
		if (active?.typeId === BROWSER_EDITOR_INPUT_ID && active.resource) {
			const parsed = BrowserViewUri.parse(active.resource);
			if (parsed) {
				const model = await this._resolveAndTrack(parsed.id);
				if (model) {
					this._proxy.$onDidChangeActiveBrowserTab(this._toDto(model));
					return;
				}
			}
		}
		this._proxy.$onDidChangeActiveBrowserTab(undefined);
	}

	private async _resolveAndTrack(browserId: string): Promise<IBrowserViewModel | undefined> {
		if (this._trackedModels.has(browserId)) {
			try {
				return await this.browserViewWorkbenchService.getBrowserViewModel(browserId);
			} catch {
				return undefined;
			}
		}

		try {
			const model = await this.browserViewWorkbenchService.getBrowserViewModel(browserId);
			const disposables = new DisposableStore();

			// Track property changes
			disposables.add(model.onDidNavigate(() => {
				this._proxy.$onDidChangeBrowserTab(model.id, this._toDto(model));
			}));
			disposables.add(model.onDidChangeTitle(() => {
				this._proxy.$onDidChangeBrowserTab(model.id, this._toDto(model));
			}));
			disposables.add(model.onDidChangeFavicon(() => {
				this._proxy.$onDidChangeBrowserTab(model.id, this._toDto(model));
			}));
			disposables.add(model.onDidClose(() => {
				this._proxy.$onDidCloseBrowserTab(model.id);
				this._knownBrowserIds.delete(model.id);
				this._trackedModels.deleteAndDispose(model.id);
			}));

			this._trackedModels.set(browserId, disposables);
			return model;
		} catch {
			return undefined;
		}
	}

	private _toDto(model: IBrowserViewModel): BrowserTabDto {
		const url = model.url || 'about:blank';
		return {
			id: model.id,
			url,
			title: model.title || url,
			favicon: model.favicon,
		};
	}

	// #endregion

	// #region CDP session management

	async $startCDPSession(sessionId: string, browserId: string): Promise<void> {
		const groupId = await this.cdpService.createSessionGroup(browserId);
		const disposables = new DisposableStore();
		this._sessionGroupIds.set(sessionId, groupId);

		// Destroy the CDP group when this session is disposed
		disposables.add(toDisposable(() => {
			this._sessionGroupIds.delete(sessionId);
			this.cdpService.destroySessionGroup(groupId).catch(() => { });
		}));

		// Wire CDP messages from main process back to ext host
		disposables.add(this.cdpService.onCDPMessage(groupId)(message => {
			this._proxy.$onCDPSessionMessage(sessionId, message);
		}));

		disposables.add(this.cdpService.onDidDestroy(groupId)(() => {
			this._sessions.deleteAndDispose(sessionId);
		}));

		disposables.add(toDisposable(() => {
			this._proxy.$onCDPSessionClosed(sessionId);
		}));

		this._sessions.set(sessionId, disposables);
	}

	async $closeCDPSession(sessionId: string): Promise<void> {
		this._sessions.deleteAndDispose(sessionId);
	}

	async $sendCDPMessage(sessionId: string, message: CDPRequest): Promise<void> {
		const groupId = this._sessionGroupIds.get(sessionId);
		if (groupId) {
			await this.cdpService.sendCDPMessage(groupId, message);
		}
	}

	async $closeBrowserTab(browserId: string): Promise<void> {
		const toClose: IEditorIdentifier[] = [];
		for (const editor of this.editorService.editors) {
			if (editor.typeId === BROWSER_EDITOR_INPUT_ID && editor.resource) {
				const parsed = BrowserViewUri.parse(editor.resource);
				if (parsed && parsed.id === browserId) {
					const identifiers = this.editorService.findEditors(editor.resource);
					toClose.push(...identifiers);
				}
			}
		}
		if (toClose.length > 0) {
			await this.editorService.closeEditors(toClose);
		}
	}

	// #endregion
}
