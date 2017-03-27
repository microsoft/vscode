/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ISCMService, ISCMProvider, ISCMResource, ISCMResourceGroup } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures, SCMRawResourceGroup } from './extHost.protocol';

class MainThreadSCMProvider implements ISCMProvider {

	private _resources: ISCMResourceGroup[] = [];
	get resources(): ISCMResourceGroup[] { return this._resources; }

	private _onDidChange = new Emitter<ISCMResourceGroup[]>();
	get onDidChange(): Event<ISCMResourceGroup[]> { return this._onDidChange.event; }

	private disposables: IDisposable[] = [];

	get handle(): number { return this._handle; }
	get label(): string { return this.features.label; }
	get contextKey(): string { return this.features.contextKey; }

	private _count: number | undefined = undefined;
	get count(): number | undefined { return this._count; }

	private _state: string | undefined = undefined;
	get state(): string | undefined { return this._state; }

	constructor(
		private _handle: number,
		private proxy: ExtHostSCMShape,
		private features: SCMProviderFeatures,
		@ISCMService scmService: ISCMService,
		@ICommandService private commandService: ICommandService
	) {
		scmService.onDidChangeProvider(this.onDidChangeProvider, this, this.disposables);
		this.disposables.push(scmService.registerSCMProvider(this));
	}

	open(resource: ISCMResource): TPromise<void> {
		if (!this.features.supportsOpen) {
			return TPromise.as(null);
		}

		return this.proxy.$open(this.handle, resource.uri.toString());
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		if (!this.features.supportsOriginalResource) {
			return TPromise.as(null);
		}

		return this.proxy.$getOriginalResource(this.handle, uri);
	}

	private onDidChangeProvider(provider: ISCMProvider): void {
		// if (provider === this) {
		// 	return
		// }
	}

	$onChange(rawResourceGroups: SCMRawResourceGroup[], count: number | undefined, state: string | undefined): void {
		this._resources = rawResourceGroups.map(rawGroup => {
			const [uri, contextKey, label, rawResources] = rawGroup;
			const resources: ISCMResource[] = [];
			const group: ISCMResourceGroup = { uri: URI.parse(uri), contextKey, label, resources };

			rawResources.forEach(rawResource => {
				const [uri, sourceUri, icons, strikeThrough] = rawResource;
				const icon = icons[0];
				const iconDark = icons[1] || icon;
				const decorations = {
					icon: icon && URI.parse(icon),
					iconDark: iconDark && URI.parse(iconDark),
					strikeThrough
				};

				resources.push({
					resourceGroup: group,
					uri: URI.parse(uri),
					sourceUri: URI.parse(sourceUri),
					decorations
				});
			});

			return group;
		});

		this._count = count;
		this._state = state;

		this._onDidChange.fire(this.resources);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class MainThreadSCM extends MainThreadSCMShape {

	private proxy: ExtHostSCMShape;
	private providers: { [handle: number]: MainThreadSCMProvider; } = Object.create(null);
	private inputBoxListeners: IDisposable[] = [];

	constructor(
		@IThreadService threadService: IThreadService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ISCMService private scmService: ISCMService
	) {
		super();
		this.proxy = threadService.get(ExtHostContext.ExtHostSCM);

		this.scmService.input.onDidChange(this.proxy.$onInputBoxValueChange, this.proxy, this.inputBoxListeners);
		this.scmService.input.onDidAccept(this.proxy.$onInputBoxAcceptChanges, this.proxy, this.inputBoxListeners);
	}

	$register(handle: number, features: SCMProviderFeatures): void {
		this.providers[handle] = this.instantiationService.createInstance(MainThreadSCMProvider, handle, this.proxy, features);
	}

	$unregister(handle: number): void {
		const provider = this.providers[handle];

		if (!provider) {
			return;
		}

		provider.dispose();
		delete this.providers[handle];
	}

	$onChange(handle: number, rawResourceGroups: SCMRawResourceGroup[], count: number | undefined, state: string | undefined): void {
		const provider = this.providers[handle];

		if (!provider) {
			return;
		}

		provider.$onChange(rawResourceGroups, count, state);
	}

	$setInputBoxValue(value: string): void {
		this.scmService.input.value = value;
	}

	dispose(): void {
		Object.keys(this.providers)
			.forEach(id => this.providers[id].dispose());

		this.providers = Object.create(null);
		this.inputBoxListeners = dispose(this.inputBoxListeners);
	}
}
