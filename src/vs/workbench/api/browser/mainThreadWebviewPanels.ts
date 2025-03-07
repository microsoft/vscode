/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { DiffEditorInput } from '../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../common/editor/editorInput.js';
import { ExtensionKeyedWebviewOriginStore, WebviewOptions } from '../../contrib/webview/browser/webview.js';
import { WebviewInput } from '../../contrib/webviewPanel/browser/webviewEditorInput.js';
import { WebviewIcons } from '../../contrib/webviewPanel/browser/webviewIconManager.js';
import { IWebViewShowOptions, IWebviewWorkbenchService } from '../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { GroupLocation, GroupsOrder, IEditorGroup, IEditorGroupsService, preferredSideBySideGroupDirection } from '../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, PreferredGroup, SIDE_GROUP } from '../../services/editor/common/editorService.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { MainThreadWebviews, reviveWebviewContentOptions, reviveWebviewExtension } from './mainThreadWebviews.js';

/**
 * Bi-directional map between webview handles and inputs.
 */
class WebviewInputStore {
	private readonly _handlesToInputs = new Map<string, WebviewInput>();
	private readonly _inputsToHandles = new Map<WebviewInput, string>();

	public add(handle: string, input: WebviewInput): void {
		this._handlesToInputs.set(handle, input);
		this._inputsToHandles.set(input, handle);
	}

	public getHandleForInput(input: WebviewInput): string | undefined {
		return this._inputsToHandles.get(input);
	}

	public getInputForHandle(handle: string): WebviewInput | undefined {
		return this._handlesToInputs.get(handle);
	}

	public delete(handle: string): void {
		const input = this.getInputForHandle(handle);
		this._handlesToInputs.delete(handle);
		if (input) {
			this._inputsToHandles.delete(input);
		}
	}

	public get size(): number {
		return this._handlesToInputs.size;
	}

	[Symbol.iterator](): Iterator<WebviewInput> {
		return this._handlesToInputs.values();
	}
}

class WebviewViewTypeTransformer {
	public constructor(
		public readonly prefix: string,
	) { }

	public fromExternal(viewType: string): string {
		return this.prefix + viewType;
	}

	public toExternal(viewType: string): string | undefined {
		return viewType.startsWith(this.prefix)
			? viewType.substr(this.prefix.length)
			: undefined;
	}
}

export class MainThreadWebviewPanels extends Disposable implements extHostProtocol.MainThreadWebviewPanelsShape {

	private readonly webviewPanelViewType = new WebviewViewTypeTransformer('mainThreadWebview-');

	private readonly _proxy: extHostProtocol.ExtHostWebviewPanelsShape;

	private readonly _webviewInputs = new WebviewInputStore();

	private readonly _revivers = this._register(new DisposableMap<string>());

	private readonly webviewOriginStore: ExtensionKeyedWebviewOriginStore;

	constructor(
		context: IExtHostContext,
		private readonly _mainThreadWebviews: MainThreadWebviews,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IExtensionService extensionService: IExtensionService,
		@IStorageService storageService: IStorageService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
	) {
		super();

		this.webviewOriginStore = new ExtensionKeyedWebviewOriginStore('mainThreadWebviewPanel.origins', storageService);

		this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviewPanels);

		this._register(Event.any(
			_editorService.onDidActiveEditorChange,
			_editorService.onDidVisibleEditorsChange,
			_editorGroupService.onDidAddGroup,
			_editorGroupService.onDidRemoveGroup,
			_editorGroupService.onDidMoveGroup,
		)(() => {
			this.updateWebviewViewStates(this._editorService.activeEditor);
		}));

		this._register(_webviewWorkbenchService.onDidChangeActiveWebviewEditor(input => {
			this.updateWebviewViewStates(input);
		}));

		// This reviver's only job is to activate extensions.
		// This should trigger the real reviver to be registered from the extension host side.
		this._register(_webviewWorkbenchService.registerResolver({
			canResolve: (webview: WebviewInput) => {
				const viewType = this.webviewPanelViewType.toExternal(webview.viewType);
				if (typeof viewType === 'string') {
					extensionService.activateByEvent(`onWebviewPanel:${viewType}`);
				}
				return false;
			},
			resolveWebview: () => { throw new Error('not implemented'); }
		}));
	}

	public get webviewInputs(): Iterable<WebviewInput> { return this._webviewInputs; }

	public addWebviewInput(handle: extHostProtocol.WebviewHandle, input: WebviewInput, options: { serializeBuffersForPostMessage: boolean }): void {
		this._webviewInputs.add(handle, input);
		this._mainThreadWebviews.addWebview(handle, input.webview, options);

		input.webview.onDidDispose(() => {
			this._proxy.$onDidDisposeWebviewPanel(handle).finally(() => {
				this._webviewInputs.delete(handle);
			});
		});
	}

	public $createWebviewPanel(
		extensionData: extHostProtocol.WebviewExtensionDescription,
		handle: extHostProtocol.WebviewHandle,
		viewType: string,
		initData: extHostProtocol.IWebviewInitData,
		showOptions: extHostProtocol.WebviewPanelShowOptions,
	): void {
		const targetGroup = this.getTargetGroupFromShowOptions(showOptions);
		const mainThreadShowOptions: IWebViewShowOptions = showOptions ? {
			preserveFocus: !!showOptions.preserveFocus,
			group: targetGroup
		} : {};

		const extension = reviveWebviewExtension(extensionData);
		const origin = this.webviewOriginStore.getOrigin(viewType, extension.id);

		const webview = this._webviewWorkbenchService.openWebview({
			origin,
			providedViewType: viewType,
			title: initData.title,
			options: reviveWebviewOptions(initData.panelOptions),
			contentOptions: reviveWebviewContentOptions(initData.webviewOptions),
			extension
		}, this.webviewPanelViewType.fromExternal(viewType), initData.title, mainThreadShowOptions);

		this.addWebviewInput(handle, webview, { serializeBuffersForPostMessage: initData.serializeBuffersForPostMessage });
	}

	public $disposeWebview(handle: extHostProtocol.WebviewHandle): void {
		const webview = this.tryGetWebviewInput(handle);
		if (!webview) {
			return;
		}
		webview.dispose();
	}

	public $setTitle(handle: extHostProtocol.WebviewHandle, value: string): void {
		this.tryGetWebviewInput(handle)?.setName(value);
	}

	public $setIconPath(handle: extHostProtocol.WebviewHandle, value: extHostProtocol.IWebviewIconPath | undefined): void {
		const webview = this.tryGetWebviewInput(handle);
		if (webview) {
			webview.iconPath = reviveWebviewIcon(value);
		}
	}

	public $reveal(handle: extHostProtocol.WebviewHandle, showOptions: extHostProtocol.WebviewPanelShowOptions): void {
		const webview = this.tryGetWebviewInput(handle);
		if (!webview || webview.isDisposed()) {
			return;
		}

		const targetGroup = this.getTargetGroupFromShowOptions(showOptions);
		this._webviewWorkbenchService.revealWebview(webview, targetGroup, !!showOptions.preserveFocus);
	}

	private getTargetGroupFromShowOptions(showOptions: extHostProtocol.WebviewPanelShowOptions): PreferredGroup {
		if (typeof showOptions.viewColumn === 'undefined'
			|| showOptions.viewColumn === ACTIVE_GROUP
			|| (this._editorGroupService.count === 1 && this._editorGroupService.activeGroup.isEmpty)
		) {
			return ACTIVE_GROUP;
		}

		if (showOptions.viewColumn === SIDE_GROUP) {
			return SIDE_GROUP;
		}

		if (showOptions.viewColumn >= 0) {
			// First check to see if an existing group exists
			const groupInColumn = this._editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE)[showOptions.viewColumn];
			if (groupInColumn) {
				return groupInColumn.id;
			}

			// We are dealing with an unknown group and therefore need a new group.
			// Note that the new group's id may not match the one requested. We only allow
			// creating a single new group, so if someone passes in `showOptions.viewColumn = 99`
			// and there are two editor groups open, we simply create a third editor group instead
			// of creating all the groups up to 99.
			const newGroup = this._editorGroupService.findGroup({ location: GroupLocation.LAST });
			if (newGroup) {
				const direction = preferredSideBySideGroupDirection(this._configurationService);
				return this._editorGroupService.addGroup(newGroup, direction);
			}
		}

		return ACTIVE_GROUP;
	}

	public $registerSerializer(viewType: string, options: { serializeBuffersForPostMessage: boolean }): void {
		if (this._revivers.has(viewType)) {
			throw new Error(`Reviver for ${viewType} already registered`);
		}

		this._revivers.set(viewType, this._webviewWorkbenchService.registerResolver({
			canResolve: (webviewInput) => {
				return webviewInput.viewType === this.webviewPanelViewType.fromExternal(viewType);
			},
			resolveWebview: async (webviewInput): Promise<void> => {
				const viewType = this.webviewPanelViewType.toExternal(webviewInput.viewType);
				if (!viewType) {
					webviewInput.webview.setHtml(this._mainThreadWebviews.getWebviewResolvedFailedContent(webviewInput.viewType));
					return;
				}

				const handle = generateUuid();

				this.addWebviewInput(handle, webviewInput, options);

				let state = undefined;
				if (webviewInput.webview.state) {
					try {
						state = JSON.parse(webviewInput.webview.state);
					} catch (e) {
						console.error('Could not load webview state', e, webviewInput.webview.state);
					}
				}

				try {
					await this._proxy.$deserializeWebviewPanel(handle, viewType, {
						title: webviewInput.getTitle(),
						state,
						panelOptions: webviewInput.webview.options,
						webviewOptions: webviewInput.webview.contentOptions,
						active: webviewInput === this._editorService.activeEditor,
					}, editorGroupToColumn(this._editorGroupService, webviewInput.group || 0));
				} catch (error) {
					onUnexpectedError(error);
					webviewInput.webview.setHtml(this._mainThreadWebviews.getWebviewResolvedFailedContent(viewType));
				}
			}
		}));
	}

	public $unregisterSerializer(viewType: string): void {
		if (!this._revivers.has(viewType)) {
			throw new Error(`No reviver for ${viewType} registered`);
		}

		this._revivers.deleteAndDispose(viewType);
	}

	private updateWebviewViewStates(activeEditorInput: EditorInput | undefined) {
		if (!this._webviewInputs.size) {
			return;
		}

		const viewStates: extHostProtocol.WebviewPanelViewStateData = {};

		const updateViewStatesForInput = (group: IEditorGroup, topLevelInput: EditorInput, editorInput: EditorInput) => {
			if (!(editorInput instanceof WebviewInput)) {
				return;
			}

			editorInput.updateGroup(group.id);

			const handle = this._webviewInputs.getHandleForInput(editorInput);
			if (handle) {
				viewStates[handle] = {
					visible: topLevelInput === group.activeEditor,
					active: editorInput === activeEditorInput,
					position: editorGroupToColumn(this._editorGroupService, group.id),
				};
			}
		};

		for (const group of this._editorGroupService.groups) {
			for (const input of group.editors) {
				if (input instanceof DiffEditorInput) {
					updateViewStatesForInput(group, input, input.primary);
					updateViewStatesForInput(group, input, input.secondary);
				} else {
					updateViewStatesForInput(group, input, input);
				}
			}
		}

		if (Object.keys(viewStates).length) {
			this._proxy.$onDidChangeWebviewPanelViewStates(viewStates);
		}
	}

	private tryGetWebviewInput(handle: extHostProtocol.WebviewHandle): WebviewInput | undefined {
		return this._webviewInputs.getInputForHandle(handle);
	}
}

function reviveWebviewIcon(value: extHostProtocol.IWebviewIconPath | undefined): WebviewIcons | undefined {
	if (!value) {
		return undefined;
	}
	return {
		light: URI.revive(value.light),
		dark: URI.revive(value.dark),
	};
}

function reviveWebviewOptions(panelOptions: extHostProtocol.IWebviewPanelOptions): WebviewOptions {
	return {
		enableFindWidget: panelOptions.enableFindWidget,
		retainContextWhenHidden: panelOptions.retainContextWhenHidden,
	};
}
