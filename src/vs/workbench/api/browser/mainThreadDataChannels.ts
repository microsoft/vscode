/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IDataChannelService, ILinkPresentation, ILinkPresentationProvider, ILinkPresentationService, ILinkPresentationWatcher, LinkPresentationKind, parseLinkPresentation } from '../../../platform/dataChannel/common/dataChannel.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostDataChannelsShape, MainContext, MainThreadDataChannelsShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadDataChannels)
export class MainThreadDataChannels extends Disposable implements MainThreadDataChannelsShape {

	private readonly _proxy: ExtHostDataChannelsShape;
	private readonly _linkPresentationWatchers = this._register(new DisposableMap<number>());
	private readonly _linkPresentationProviders = this._register(new DisposableMap<number>());
	private readonly _providedLinkPresentationWatchers = this._register(new DisposableMap<number, MainThreadExtensionLinkPresentationWatcher>());
	private static _providedLinkPresentationWatcherHandlePool = 0;

	constructor(
		extHostContext: IExtHostContext,
		@IDataChannelService private readonly _dataChannelService: IDataChannelService,
		@ILinkPresentationService private readonly _linkPresentationService: ILinkPresentationService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDataChannels);

		this._register(this._dataChannelService.onDidSendData(e => {
			this._proxy.$onDidReceiveData(e.channelId, e.data);
		}));
		const updateLinkPresentationRules = () => this._proxy.$acceptLinkPresentationRules(
			this._linkPresentationService.linkPresentationRules.map(rule => ({
				id: rule.id,
				source: rule.uriPattern.source,
				flags: rule.uriPattern.flags,
				kind: rule.kind,
			}))
		);
		updateLinkPresentationRules();
		this._register(this._linkPresentationService.onDidChangeLinkPresentationRules(updateLinkPresentationRules));
	}

	$createLinkPresentationWatcher(handle: number, providerId: string, kind: LinkPresentationKind, resource: UriComponents): void {
		const watcher = this._linkPresentationService.createLinkPresentationWatcher(providerId, URI.revive(resource));
		if (!watcher) {
			this._proxy.$acceptLinkPresentation(handle, {
				kind,
				status: { kind: 'error', label: localize('linkPresentation.unavailable', "Not available") },
				tooltip: localize('linkPresentation.ruleMismatch', "The selected link presentation provider does not accept this resource."),
				ariaLabel: localize('linkPresentation.unavailableAriaLabel', "Link presentation is not available"),
			});
			return;
		}

		const store = new DisposableStore();
		store.add(autorun(reader => {
			const presentation = watcher.presentation.read(reader);
			if (presentation) {
				this._proxy.$acceptLinkPresentation(handle, presentation);
			}
		}));
		store.add(watcher);
		this._linkPresentationWatchers.set(handle, store);
	}

	$disposeLinkPresentationWatcher(handle: number): void {
		this._linkPresentationWatchers.deleteAndDispose(handle);
	}

	$registerLinkPresentationProvider(handle: number, extensionId: string, providerId: string): void {
		const provider: ILinkPresentationProvider = {
			createLinkPresentationWatcher: resource => this._createExtensionLinkPresentationWatcher(handle, resource),
		};
		this._linkPresentationProviders.set(
			handle,
			this._linkPresentationService.registerExtensionLinkPresentationProvider(extensionId, providerId, provider),
		);
	}

	$unregisterLinkPresentationProvider(handle: number): void {
		this._linkPresentationProviders.deleteAndDispose(handle);
	}

	$acceptLinkPresentationProviderData(handle: number, data: unknown): void {
		this._providedLinkPresentationWatchers.get(handle)?.acceptPresentation(data);
	}

	private _createExtensionLinkPresentationWatcher(providerHandle: number, resource: URI): ILinkPresentationWatcher {
		const handle = MainThreadDataChannels._providedLinkPresentationWatcherHandlePool++;
		const watcher = new MainThreadExtensionLinkPresentationWatcher(() => {
			this._providedLinkPresentationWatchers.deleteAndLeak(handle);
			this._proxy.$disposeLinkPresentationWatcher(handle);
		});
		this._providedLinkPresentationWatchers.set(handle, watcher);
		void this._proxy.$createLinkPresentationWatcher(handle, providerHandle, resource).then(
			data => watcher.initializePresentation(data),
			error => {
				onUnexpectedError(error);
				watcher.initializePresentation({
					kind: 'resource',
					status: { kind: 'error', label: localize('linkPresentation.unavailable', "Not available") },
					tooltip: localize('linkPresentation.unavailableTooltip', "The link presentation provider failed to load."),
					ariaLabel: localize('linkPresentation.unavailableAriaLabel', "Link presentation is not available"),
				});
			},
		);
		return watcher;
	}
}

class MainThreadExtensionLinkPresentationWatcher extends Disposable implements ILinkPresentationWatcher {
	private readonly _presentation = observableValue<ILinkPresentation | undefined>(this, undefined);
	readonly presentation = this._presentation;
	private _isDisposed = false;

	constructor(private readonly _onDispose: () => void) {
		super();
	}

	acceptPresentation(data: unknown): void {
		if (!this._isDisposed) {
			this._presentation.set(parseLinkPresentation(data), undefined);
		}
	}

	initializePresentation(data: unknown): void {
		if (!this._isDisposed && !this._presentation.get()) {
			this.acceptPresentation(data);
		}
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		super.dispose();
		this._onDispose();
	}
}
