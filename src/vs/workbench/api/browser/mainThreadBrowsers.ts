/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { BrowserTabDto, ExtHostBrowsersShape, ExtHostContext, MainContext, MainThreadBrowsersShape } from '../common/extHost.protocol.js';
import { IBrowserViewWorkbenchService, IBrowserViewModel } from '../../contrib/browserView/common/browserView.js';
import { IBrowserViewGroupService, ipcBrowserViewGroupChannelName } from '../../../platform/browserView/common/browserViewGroup.js';
import { IMainProcessService } from '../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { BrowserViewUri } from '../../../platform/browserView/common/browserViewUri.js';
import { EditorInput } from '../../common/editor/editorInput.js';
import { EditorGroupColumn, columnToEditorGroup } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IEditorOptions } from '../../../platform/editor/common/editor.js';
import { CDPRequest } from '../../../platform/browserView/common/cdp/types.js';
import { t } from '../../contrib/chat/common/model/objectMutationLog.js';

@extHostNamedCustomer(MainContext.MainThreadBrowsers)
export class MainThreadBrowsers extends Disposable implements MainThreadBrowsersShape {

	private readonly _proxy: ExtHostBrowsersShape;
	private readonly _groupService: IBrowserViewGroupService;
	private readonly _windowId: number;

	/** Maps CDP session IDs to the browser view group ID and disposables. */
	private readonly _sessions = this._register(new DisposableMap<string, DisposableStore>());
	/** Maps CDP session ID to group ID. */
	private readonly _sessionGroupIds = new Map<string, string>();

	/** Browser view models we are currently tracking. */
	private readonly _trackedModels = this._register(new DisposableMap<string, DisposableStore>());

	/** Set of browser IDs currently known to the ext host. */
	private readonly _knownBrowserIds = new Set<string>();

	constructor(
		extHostContext: IExtHostContext,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserViewWorkbenchService private readonly browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeHostService nativeHostService: INativeHostService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostBrowsers);
		this._windowId = nativeHostService.windowId;

		const channel = mainProcessService.getChannel(ipcBrowserViewGroupChannelName);
		this._groupService = ProxyChannel.toService<IBrowserViewGroupService>(channel);

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
		return this._toDto(model!);
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
				const model = await this._resolveAndTrack(browserId);
				if (model) {
					this._knownBrowserIds.add(browserId);
					this._proxy.$onDidOpenBrowserTab(this._toDto(model));
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
				this._proxy.$onDidChangeActiveBrowserTab(parsed.id);
				return;
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
		const groupId = await this._groupService.createGroup(this._windowId);
		const disposables = new DisposableStore();
		this._sessionGroupIds.set(sessionId, groupId);

		// Add the browser to the group
		await this._groupService.addViewToGroup(groupId, browserId);

		// Wire CDP messages from main process back to ext host
		disposables.add(this._groupService.onDynamicCDPMessage(groupId)(message => {
			this._proxy.$onCDPSessionMessage(sessionId, message);
		}));

		disposables.add(this._groupService.onDynamicDidDestroy(groupId)(() => {
			this._proxy.$onCDPSessionClosed(sessionId);
			this._sessions.deleteAndDispose(sessionId);
			this._sessionGroupIds.delete(sessionId);
		}));

		this._sessions.set(sessionId, disposables);
	}

	async $closeCDPSession(sessionId: string): Promise<void> {
		const groupId = this._sessionGroupIds.get(sessionId);
		if (groupId) {
			await this._groupService.destroyGroup(groupId);
			this._sessions.deleteAndDispose(sessionId);
			this._sessionGroupIds.delete(sessionId);
		}
	}

	async $sendCDPMessage(sessionId: string, message: CDPRequest): Promise<void> {
		const groupId = this._sessionGroupIds.get(sessionId);
		if (groupId) {
			await this._groupService.sendCDPMessage(groupId, message);
		}
	}

	// #endregion
}
