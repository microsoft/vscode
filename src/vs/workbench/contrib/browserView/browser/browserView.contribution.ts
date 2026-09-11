/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserViewWorkbenchService, IBrowserViewCDPService, IBrowserViewModel, IBrowserViewContextualFilter, IBrowserViewOpenHandler, IBrowserViewWorkbenchCreateOptions, IBrowserViewPageSourceResolver, IBrowserViewResolvedPageSource } from '../common/browserView.js';
import type { PreferredGroup } from '../../../services/editor/common/editorService.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IBrowserViewEditorOpenOptions } from '../../../../platform/browserView/common/browserView.js';
import { CDPEvent, CDPRequest, CDPResponse } from '../../../../platform/browserView/common/cdp/types.js';
import { ITunnelProxyInfo } from '../../../../platform/tunnel/common/tunnelProxy.js';
import { BrowserEditorInput, IBrowserEditorInputData } from '../common/browserEditorInput.js';
import type { URI } from '../../../../base/common/uri.js';
import type { CancellationToken } from '../../../../base/common/cancellation.js';

class WebBrowserViewWorkbenchService implements IBrowserViewWorkbenchService {
	declare readonly _serviceBrand: undefined;

	willUseRemoteProxy(): boolean {
		return false;
	}

	setRemoteProxyInfo(_info: ITunnelProxyInfo | undefined): void { }

	readonly onDidChangeBrowserViews = Event.None;
	readonly onDidChangeSharingAvailable = Event.None;
	readonly onDidUnregisterPageSourceResolver = Event.None;
	readonly isSharingAvailable = false;

	private readonly _known = new Map<string, BrowserEditorInput>();

	getKnownBrowserViews(): Map<string, BrowserEditorInput> {
		return this._known;
	}

	registerContextualFilter(_filter: IBrowserViewContextualFilter): IDisposable {
		return Disposable.None;
	}

	getContextualBrowserViews(): Map<string, BrowserEditorInput> {
		return this._known;
	}

	async getPreferredGroup(preferredGroup?: PreferredGroup): Promise<PreferredGroup | undefined> {
		return preferredGroup;
	}

	registerOpenHandler(_handler: IBrowserViewOpenHandler): IDisposable {
		return Disposable.None;
	}

	async createBrowserView(_options: IBrowserViewWorkbenchCreateOptions, _editorOpenOptions?: IBrowserViewEditorOpenOptions): Promise<BrowserEditorInput> {
		throw new Error('Integrated Browser is not available in web.');
	}

	getOrCreateLazy(_data: IBrowserEditorInputData): BrowserEditorInput {
		throw new Error('Integrated Browser is not available in web.');
	}

	registerPageSourceResolver(_scheme: string, _resolver: IBrowserViewPageSourceResolver): IDisposable {
		throw new Error('Integrated Browser is not available in web.');
	}

	async resolvePageSource(_source: URI, _token: CancellationToken): Promise<IBrowserViewResolvedPageSource> {
		throw new Error('Integrated Browser is not available in web.');
	}

	getBrowserViewModel(_id: string): IBrowserViewModel | undefined {
		return undefined;
	}

	async clearGlobalStorage(): Promise<void> { }
	async clearWorkspaceStorage(): Promise<void> { }
}

class WebBrowserViewCDPService implements IBrowserViewCDPService {
	declare readonly _serviceBrand: undefined;

	async createSessionGroup(_browserId: string): Promise<string> {
		throw new Error('Integrated Browser is not available in web.');
	}

	async destroySessionGroup(_groupId: string): Promise<void> { }

	async sendCDPMessage(_groupId: string, _message: CDPRequest): Promise<void> { }

	onCDPMessage(_groupId: string): Event<CDPResponse | CDPEvent> {
		return Event.None;
	}

	onDidDestroy(_groupId: string): Event<void> {
		return Event.None;
	}
}

registerSingleton(IBrowserViewWorkbenchService, WebBrowserViewWorkbenchService, InstantiationType.Delayed);
registerSingleton(IBrowserViewCDPService, WebBrowserViewCDPService, InstantiationType.Delayed);
