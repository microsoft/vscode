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

	get id(): string { return this._id; }
	get label(): string { return this.features.label; }

	private _count: number | undefined = undefined;
	get count(): number | undefined { return this._count; }

	constructor(
		private _id: string,
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

		return this.proxy.$open(this.id, resource.resourceGroupId, resource.uri.toString());
	}

	drag(from: ISCMResource, to: ISCMResourceGroup): TPromise<void> {
		if (!this.features.supportsDrag) {
			return TPromise.as(null);
		}

		return this.proxy.$drag(this.id, from.resourceGroupId, from.uri.toString(), to.id);
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		if (!this.features.supportsOriginalResource) {
			return TPromise.as(null);
		}

		return this.proxy.$getOriginalResource(this.id, uri);
	}

	private onDidChangeProvider(provider: ISCMProvider): void {
		// if (provider === this) {
		// 	return
		// }
	}

	$onChange(rawResourceGroups: SCMRawResourceGroup[], count: number | undefined): void {
		this._resources = rawResourceGroups.map(rawGroup => {
			const [id, label, rawResources] = rawGroup;

			const resources = rawResources.map(rawResource => {
				const [uri, icons, strikeThrough] = rawResource;

				const icon = icons[0];
				const iconDark = icons[1] || icon;

				const decorations = {
					icon: icon && URI.parse(icon),
					iconDark: iconDark && URI.parse(iconDark),
					strikeThrough
				};

				return {
					resourceGroupId: id,
					uri: URI.parse(uri),
					decorations
				};
			});

			return { id, label, resources };
		});
		this._count = count;

		this._onDidChange.fire(this.resources);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class MainThreadSCM extends MainThreadSCMShape {

	private proxy: ExtHostSCMShape;
	private providers: { [id: string]: MainThreadSCMProvider; } = Object.create(null);

	constructor(
		@IThreadService threadService: IThreadService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
		this.proxy = threadService.get(ExtHostContext.ExtHostSCM);
	}

	$register(id: string, features: SCMProviderFeatures): void {
		this.providers[id] = this.instantiationService.createInstance(MainThreadSCMProvider, id, this.proxy, features);
	}

	$unregister(id: string): void {
		const provider = this.providers[id];

		if (!provider) {
			return;
		}

		provider.dispose();
		delete this.providers[id];
	}

	$onChange(id: string, rawResourceGroups: SCMRawResourceGroup[], count: number | undefined): void {
		const provider = this.providers[id];

		if (!provider) {
			return;
		}

		provider.$onChange(rawResourceGroups, count);
	}

	dispose(): void {
		Object.keys(this.providers)
			.forEach(id => this.providers[id].dispose());

		this.providers = Object.create(null);
	}
}
