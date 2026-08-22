/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { LinkPresentationKind, parseLinkPresentation } from '../../../platform/dataChannel/common/dataChannel.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { ExtHostDataChannelsShape, MainContext, MainThreadDataChannelsShape } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';

export interface IExtHostDataChannels extends ExtHostDataChannelsShape {
	readonly _serviceBrand: undefined;
	readonly linkPresentationRules: readonly vscode.LinkPresentationRule[];
	readonly onDidChangeLinkPresentationRules: Event<void>;
	createDataChannel<T>(extension: IExtensionDescription, channelId: string): vscode.DataChannel<T>;
	createLinkPresentationWatcher(extension: IExtensionDescription, providerId: string, resource: vscode.Uri): vscode.LinkPresentationWatcher;
	registerLinkPresentationProvider(extension: IExtensionDescription, id: string, provider: vscode.LinkPresentationProvider): vscode.Disposable;
}

export const IExtHostDataChannels = createDecorator<IExtHostDataChannels>('IExtHostDataChannels');

export class ExtHostDataChannels implements IExtHostDataChannels {
	declare readonly _serviceBrand: undefined;

	private readonly _channels = new Map<string, IDataChannelHandle>();
	private readonly _linkPresentationWatchers = new Map<number, LinkPresentationWatcherImpl>();
	private readonly _linkPresentationProviders = new Map<number, vscode.LinkPresentationProvider>();
	private readonly _providedLinkPresentationWatchers = new Map<number, { readonly providerHandle: number; readonly store: DisposableStore }>();
	private readonly _linkPresentationCache = new Map<string, vscode.LinkPresentationData>();
	private readonly _onDidChangeLinkPresentationRules = new Emitter<void>();
	readonly onDidChangeLinkPresentationRules = this._onDidChangeLinkPresentationRules.event;
	private _linkPresentationRules: readonly vscode.LinkPresentationRule[] = [];
	private static _linkPresentationWatcherHandlePool = 0;
	private static _linkPresentationProviderHandlePool = 0;
	private readonly _proxy: MainThreadDataChannelsShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadDataChannels);
	}

	get linkPresentationRules(): readonly vscode.LinkPresentationRule[] {
		return this._linkPresentationRules;
	}

	createDataChannel<T>(extension: IExtensionDescription, channelId: string): vscode.DataChannel<T> {
		checkProposedApiEnabled(extension, 'dataChannels');

		let channel = this._channels.get(channelId);
		if (!channel) {
			channel = new DataChannelImpl<T>(channelId);
			this._channels.set(channelId, channel);
		}
		return channel as DataChannelImpl<T>;
	}

	createLinkPresentationWatcher(extension: IExtensionDescription, providerId: string, resource: vscode.Uri): vscode.LinkPresentationWatcher {
		checkProposedApiEnabled(extension, 'linkPresentation');

		const resourceString = resource.toString(true);
		const rule = this._linkPresentationRules.find(rule => rule.id === providerId && matchesUriPattern(rule.uriPattern, resourceString));
		if (!rule) {
			throw new Error(`Link presentation provider '${providerId}' does not accept '${resourceString}'.`);
		}
		const cacheKey = `${providerId}\0${resourceString}`;
		const cachedPresentation = this._getCachedLinkPresentation(cacheKey);
		const initialPresentation: vscode.LinkPresentationData = {
			...(cachedPresentation ?? { kind: rule.initialKind }),
			isLoading: true,
		};
		const handle = ExtHostDataChannels._linkPresentationWatcherHandlePool++;
		const watcher = new LinkPresentationWatcherImpl(
			handle,
			initialPresentation,
			this._proxy,
			disposedHandle => this._linkPresentationWatchers.delete(disposedHandle),
			presentation => this._cacheLinkPresentation(cacheKey, presentation),
		);
		this._linkPresentationWatchers.set(handle, watcher);
		this._proxy.$createLinkPresentationWatcher(handle, providerId, resource);
		return watcher;
	}

	registerLinkPresentationProvider(
		extension: IExtensionDescription,
		id: string,
		provider: vscode.LinkPresentationProvider,
	): vscode.Disposable {
		checkProposedApiEnabled(extension, 'linkPresentation');
		if (!id.trim()) {
			throw new Error('Link presentation provider id must not be empty.');
		}

		const handle = ExtHostDataChannels._linkPresentationProviderHandlePool++;
		this._linkPresentationProviders.set(handle, provider);
		this._proxy.$registerLinkPresentationProvider(handle, extension.identifier.value, id);
		return toDisposable(() => {
			this._proxy.$unregisterLinkPresentationProvider(handle);
			this._linkPresentationProviders.delete(handle);
			for (const [watcherHandle, watcher] of this._providedLinkPresentationWatchers) {
				if (watcher.providerHandle === handle) {
					watcher.store.dispose();
					this._providedLinkPresentationWatchers.delete(watcherHandle);
				}
			}
		});
	}

	$onDidReceiveData(channelId: string, data: unknown): void {
		this._channels.get(channelId)?._fireDidReceiveData(data);
	}

	$acceptLinkPresentationRules(rules: readonly { id: string; source: string; flags: string; initialKind: LinkPresentationKind }[]): void {
		this._linkPresentationRules = rules.map(rule => ({
			id: rule.id,
			uriPattern: new RegExp(rule.source, rule.flags),
			initialKind: rule.initialKind,
		}));
		this._onDidChangeLinkPresentationRules.fire();
	}

	$acceptLinkPresentation(handle: number, data: unknown): void {
		this._linkPresentationWatchers.get(handle)?.acceptPresentation(data);
	}

	async $createLinkPresentationWatcher(handle: number, providerHandle: number, resource: UriComponents): Promise<unknown> {
		const provider = this._linkPresentationProviders.get(providerHandle);
		if (!provider) {
			throw new Error(`Link presentation provider handle '${providerHandle}' is not registered.`);
		}

		const watcher = provider.provideLinkPresentationWatcher(URI.revive(resource), CancellationToken.None);
		const store = new DisposableStore();
		store.add(watcher);
		store.add(watcher.onDidChangePresentation(() => {
			this._proxy.$acceptLinkPresentationProviderData(handle, watcher.presentation);
		}));
		this._providedLinkPresentationWatchers.set(handle, { providerHandle, store });
		return watcher.presentation;
	}

	$disposeLinkPresentationWatcher(handle: number): void {
		const watcher = this._providedLinkPresentationWatchers.get(handle);
		if (watcher) {
			this._providedLinkPresentationWatchers.delete(handle);
			watcher.store.dispose();
		}
	}

	private _getCachedLinkPresentation(key: string): vscode.LinkPresentationData | undefined {
		const presentation = this._linkPresentationCache.get(key);
		if (presentation) {
			this._linkPresentationCache.delete(key);
			this._linkPresentationCache.set(key, presentation);
		}
		return presentation;
	}

	private _cacheLinkPresentation(key: string, presentation: vscode.LinkPresentationData): void {
		this._linkPresentationCache.delete(key);
		this._linkPresentationCache.set(key, presentation);
		while (this._linkPresentationCache.size > 100) {
			const oldest = this._linkPresentationCache.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this._linkPresentationCache.delete(oldest);
		}
	}
}

interface IDataChannelHandle {
	_fireDidReceiveData(data: unknown): void;
}

class DataChannelImpl<T> extends Disposable implements vscode.DataChannel<T>, IDataChannelHandle {
	private readonly _onDidReceiveData = this._register(new Emitter<vscode.DataChannelEvent<T>>());
	readonly onDidReceiveData: Event<vscode.DataChannelEvent<T>> = this._onDidReceiveData.event;

	constructor(private readonly channelId: string) {
		super();
	}

	_fireDidReceiveData(data: unknown): void {
		this._onDidReceiveData.fire({ data: data as T });
	}

	override toString(): string {
		return `DataChannel(${this.channelId})`;
	}
}

class LinkPresentationWatcherImpl extends Disposable implements vscode.LinkPresentationWatcher {
	private readonly _onDidChangePresentation = this._register(new Emitter<void>());
	readonly onDidChangePresentation = this._onDidChangePresentation.event;

	private _presentation: vscode.LinkPresentationData;
	get presentation(): vscode.LinkPresentationData {
		return this._presentation;
	}

	constructor(
		handle: number,
		initialPresentation: vscode.LinkPresentationData,
		proxy: MainThreadDataChannelsShape,
		onDispose: (handle: number) => void,
		private readonly _onDidAcceptPresentation: (presentation: vscode.LinkPresentationData) => void,
	) {
		super();
		this._presentation = initialPresentation;
		this._register({
			dispose: () => {
				proxy.$disposeLinkPresentationWatcher(handle);
				onDispose(handle);
			},
		});
	}

	acceptPresentation(data: unknown): void {
		this._presentation = parseLinkPresentation(data);
		this._onDidAcceptPresentation(this._presentation);
		this._onDidChangePresentation.fire();
	}
}

function matchesUriPattern(pattern: RegExp, value: string): boolean {
	pattern.lastIndex = 0;
	return pattern.test(value);
}
