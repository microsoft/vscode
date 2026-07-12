/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { BrowserTabDto, ExtHostBrowsersShape, ExtHostContext, MainContext, MainThreadBrowsersShape } from '../common/extHost.protocol.js';
import { IBrowserViewCDPService, IBrowserViewWorkbenchService } from '../../contrib/browserView/common/browserView.js';
import { BrowserViewUri } from '../../../platform/browserView/common/browserViewUri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { EditorGroupColumn, columnToEditorGroup } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IEditorOptions } from '../../../platform/editor/common/editor.js';
import { CDPRequest } from '../../../platform/browserView/common/cdp/types.js';
import { BrowserEditorInput } from '../../contrib/browserView/common/browserEditorInput.js';

@extHostNamedCustomer(MainContext.MainThreadBrowsers)
export class MainThreadBrowsers extends Disposable implements MainThreadBrowsersShape {

	private readonly _proxy: ExtHostBrowsersShape;

	private readonly _cdpSessions = this._register(new DisposableMap<string, { groupId: string } & IDisposable>());
	private readonly _knownBrowsers = this._register(new DisposableMap<string, { input: BrowserEditorInput } & IDisposable>());

	constructor(
		extHostContext: IExtHostContext,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserViewCDPService private readonly cdpService: IBrowserViewCDPService,
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostBrowsers);

		// Track open browser editors via the workbench service
		this._register(this.browserViewService.onDidChangeBrowserViews(() => {
			for (const editor of this.browserViewService.getKnownBrowserViews().values()) {
				this._track(editor);
			}
		}));
		this._register(this.editorService.onDidActiveEditorChange(() => this._syncActiveBrowserTab()));

		// Initial sync
		for (const editor of this.browserViewService.getKnownBrowserViews().values()) {
			this._track(editor);
		}
		this._syncActiveBrowserTab();
	}

	// #region Browser tab open

	async $openBrowserTab(url: string, viewColumn?: EditorGroupColumn, options?: IEditorOptions): Promise<BrowserTabDto> {
		const id = generateUuid();
		const browserUri = BrowserViewUri.forId(id);

		await this.editorService.openEditor(
			{
				resource: browserUri,
				options: { ...options, viewState: { url } }
			},
			columnToEditorGroup(this.editorGroupsService, this.configurationService, viewColumn),
		);
		const known = this._knownBrowsers.get(id);
		if (!known) {
			throw new Error('Failed to open browser tab');
		}

		return this._toDto(known.input);
	}

	// #endregion

	// #region Browser tab tracking

	private _lastActiveBrowserId: string | undefined = undefined;
	private async _syncActiveBrowserTab(): Promise<void> {
		const active = this.editorService.activeEditorPane?.input;
		let activeId: string | undefined;
		if (active instanceof BrowserEditorInput) {
			this._track(active);
			activeId = active.id;
		}
		if (this._lastActiveBrowserId !== activeId) {
			this._lastActiveBrowserId = activeId;
			this._proxy.$onDidChangeActiveBrowserTab(activeId);
		}
	}

	private _track(input: BrowserEditorInput): void {
		if (this._knownBrowsers.has(input.id)) {
			return;
		}
		const disposables = new DisposableStore();

		// Track property changes. Currently all the tracked properties are covered under the `onDidChangeLabel` event.
		disposables.add(input.onDidChangeLabel(() => {
			this._proxy.$onDidChangeBrowserTabState(this._toDto(input));
		}));
		disposables.add(input.onWillDispose(() => {
			this._knownBrowsers.deleteAndDispose(input.id);
		}));
		disposables.add(toDisposable(() => {
			this._proxy.$onDidCloseBrowserTab(input.id);
		}));

		this._knownBrowsers.set(input.id, { input, dispose: () => disposables.dispose() });
		this._proxy.$onDidOpenBrowserTab(this._toDto(input));
	}

	private _toDto(input: BrowserEditorInput): BrowserTabDto {
		return {
			id: input.id,
			url: input.url || 'about:blank',
			title: input.getTitle(),
			favicon: input.favicon,
		};
	}

	// #endregion

	// #region CDP session management

	async $startCDPSession(sessionId: string, browserId: string): Promise<void> {
		const known = this._knownBrowsers.get(browserId);
		if (!known) {
			throw new Error(`Unknown browser id: ${browserId}`);
		}

		// Before starting a session, resolve the input to ensure the underlying web contents exist and can be attached.
		await known.input.resolve();

		const groupId = await this.cdpService.createSessionGroup(browserId);
		const disposables = new DisposableStore();

		// Wire CDP messages from main process back to ext host
		disposables.add(this.cdpService.onCDPMessage(groupId)(message => {
			this._proxy.$onCDPSessionMessage(sessionId, message);
		}));
		disposables.add(this.cdpService.onDidDestroy(groupId)(() => {
			this._cdpSessions.deleteAndDispose(sessionId);
		}));
		disposables.add(toDisposable(() => {
			this.cdpService.destroySessionGroup(groupId).catch(() => { });
			this._proxy.$onCDPSessionClosed(sessionId);
		}));

		this._cdpSessions.set(sessionId, { groupId, dispose: () => disposables.dispose() });
	}

	async $closeCDPSession(sessionId: string): Promise<void> {
		this._cdpSessions.deleteAndDispose(sessionId);
	}

	async $sendCDPMessage(sessionId: string, message: CDPRequest): Promise<void> {
		const session = this._cdpSessions.get(sessionId);
		if (session) {
			await this.cdpService.sendCDPMessage(session.groupId, message);
		}
	}

	async $closeBrowserTab(browserId: string): Promise<void> {
		const known = this._knownBrowsers.get(browserId);
		if (!known) {
			throw new Error(`Unknown browser id: ${browserId}`);
		}
		known.input.dispose();
	}

	// #endregion
}
