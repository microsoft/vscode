/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, debounceEvent } from 'vs/base/common/event';
import { asWinJsPromise } from 'vs/base/common/async';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { MainContext, MainThreadSCMShape, SCMRawResource, SCMRawResourceGroup } from './extHost.protocol';
import * as vscode from 'vscode';

function getIconPath(decorations: vscode.SCMResourceThemableDecorations) {
	if (!decorations) {
		return undefined;
	} else if (typeof decorations.iconPath === 'string') {
		return URI.file(decorations.iconPath).toString();
	} else if (decorations.iconPath) {
		return `${decorations.iconPath}`;
	}
	return undefined;
}

export interface Cache {
	[providerId: string]: {
		[groupId: string]: {
			resourceGroup: vscode.SCMResourceGroup,
			resources: { [uri: string]: vscode.SCMResource }
		};
	};
}

export class ExtHostSCM {

	private _proxy: MainThreadSCMShape;
	private _providers: { [id: string]: vscode.SCMProvider; } = Object.create(null);

	private _onDidChangeActiveProvider = new Emitter<vscode.SCMProvider>();
	get onDidChangeActiveProvider(): Event<vscode.SCMProvider> { return this._onDidChangeActiveProvider.event; }

	private _activeProvider: vscode.SCMProvider;
	get activeProvider(): vscode.SCMProvider | undefined { return this._activeProvider; }

	private cache: Cache = Object.create(null);

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadSCM);
	}

	getResourceFromURI(uri: vscode.Uri): vscode.SCMResource | vscode.SCMResourceGroup | undefined {
		if (uri.scheme !== 'scm') {
			return undefined;
		}

		const providerId = uri.authority;
		const providerCache = this.cache[providerId];

		if (!providerCache) {
			return undefined;
		}

		const match = /^\/([^/]+)(\/(.*))?$/.exec(uri.path);

		if (!match) {
			return undefined;
		}

		const resourceGroupId = match[1];
		const resourceGroupRef = providerCache[resourceGroupId];

		if (!resourceGroupRef) {
			return undefined;
		}

		const rawResourceUri = match[3];

		if (!rawResourceUri) {
			return resourceGroupRef.resourceGroup;
		}

		let resourceUri: string;

		try {
			const rawResource = JSON.parse(rawResourceUri);
			const resource = URI.from(rawResource);
			resourceUri = resource.toString();
		} catch (err) {
			resourceUri = undefined;
		}

		if (!resourceUri) {
			return undefined;
		}

		const resource = resourceGroupRef.resources[resourceUri];

		if (!resource) {
			return undefined;
		}

		return resource;
	}

	registerSCMProvider(providerId: string, provider: vscode.SCMProvider): Disposable {
		if (this._providers[providerId]) {
			throw new Error(`Provider ${providerId} already registered`);
		}

		// TODO@joao: should pluck all the things out of the provider
		this._providers[providerId] = provider;

		this._proxy.$register(providerId, {
			label: provider.label,
			supportsOpen: !!provider.open,
			supportsDrag: !!provider.drag,
			supportsOriginalResource: !!provider.getOriginalResource
		});

		const onDidChange = debounceEvent(provider.onDidChange, (l, e) => e, 100);
		const onDidChangeListener = onDidChange(resourceGroups => {
			this.cache[providerId] = Object.create(null);

			const rawResourceGroups = resourceGroups.map(g => {
				const resources: { [id: string]: vscode.SCMResource; } = Object.create(null);

				const rawResources = g.resources.map(r => {
					const uri = r.uri.toString();
					const iconPath = getIconPath(r.decorations);
					const lightIconPath = r.decorations && getIconPath(r.decorations.light) || iconPath;
					const darkIconPath = r.decorations && getIconPath(r.decorations.dark) || iconPath;
					const icons: string[] = [];

					if (lightIconPath || darkIconPath) {
						icons.push(lightIconPath);
					}

					if (darkIconPath !== lightIconPath) {
						icons.push(darkIconPath);
					}

					const strikeThrough = r.decorations && !!r.decorations.strikeThrough;
					resources[uri] = r;

					return [uri, icons, strikeThrough] as SCMRawResource;
				});

				this.cache[providerId][g.id] = { resourceGroup: g, resources };

				return [g.id, g.label, rawResources] as SCMRawResourceGroup;
			});

			this._proxy.$onChange(providerId, rawResourceGroups, provider.count);
		});

		return new Disposable(() => {
			onDidChangeListener.dispose();
			delete this._providers[providerId];
			this._proxy.$unregister(providerId);
		});
	}

	$open(providerId: string, resourceGroupId: string, uri: string): TPromise<void> {
		const provider = this._providers[providerId];

		if (!provider) {
			return TPromise.as(null);
		}

		const providerCache = this.cache[providerId];
		const resourceGroup = providerCache[resourceGroupId];
		const resource = resourceGroup && resourceGroup.resources[uri];

		if (!resource) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.open(resource, token));
	}

	$drag(providerId: string, fromResourceGroupId: string, fromUri: string, toResourceGroupId: string): TPromise<void> {
		const provider = this._providers[providerId];

		if (!provider) {
			return TPromise.as(null);
		}

		const providerCache = this.cache[providerId];
		const fromResourceGroup = providerCache[fromResourceGroupId];
		const resource = fromResourceGroup && fromResourceGroup.resources[fromUri];
		const toResourceGroup = providerCache[toResourceGroupId];
		const resourceGroup = toResourceGroup && toResourceGroup.resourceGroup;

		if (!resource || !resourceGroup) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.drag(resource, resourceGroup, token));
	}

	$getOriginalResource(id: string, uri: URI): TPromise<URI> {
		const provider = this._providers[id];

		if (!provider) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.getOriginalResource(uri, token));
	}
}
