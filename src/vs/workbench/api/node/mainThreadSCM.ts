/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { dispose } from 'vs/base/common/lifecycle';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ISCMService, ISCMProvider, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures, SCMRawResource } from './extHost.protocol';
import { SCMProvider } from 'vs/workbench/services/scm/common/scmProvider';

class MainThreadSCMProvider extends SCMProvider {

	constructor(
		id: string,
		private proxy: ExtHostSCMShape,
		private features: SCMProviderFeatures,
		@ISCMService scmService: ISCMService,
		@ICommandService private commandService: ICommandService
	) {
		super(id, 'Ext Host SCM Provider');
		scmService.onDidChangeProvider(this.onDidChangeProvider, this, this.disposables);
		this.disposables.push(scmService.registerSCMProvider(this));

		features.resourceGroups
			.forEach(resourceGroup => this.createResourceGroup(resourceGroup.id, resourceGroup.label));
	}

	commit(message: string): TPromise<void> {
		const id = this.features.commitCommand;

		if (!id) {
			return TPromise.as(null);
		}

		return this.commandService.executeCommand<void>(id, message);
	}

	open(uri: ISCMResource): TPromise<void> {
		const id = this.features.clickCommand;

		if (!id) {
			return TPromise.as(null);
		}

		return this.commandService.executeCommand<void>(id, uri);
	}

	drag(from: ISCMResource, to: ISCMResource): TPromise<void> {
		const id = this.features.dragCommand;

		if (!id) {
			return TPromise.as(null);
		}

		return this.commandService.executeCommand<void>(id, from, to);
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

	$onChange(raw: SCMRawResource[][]): void {
		if (raw.length !== this.resourceGroups.length) {
			throw new Error('bad on change');
		}

		raw.forEach((group, index) => {
			const resourceGroup = this.resourceGroups[index];
			const resources = group.map(raw => ({ uri: URI.parse(raw.uri) }));
			resourceGroup.set(...resources);
		});
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

	$onChange(id: string, resources: SCMRawResource[][]): void {
		const provider = this.providers[id];

		if (!provider) {
			return;
		}

		provider.$onChange(resources);
	}

	dispose(): void {
		Object.keys(this.providers)
			.forEach(id => this.providers[id].dispose());

		this.providers = Object.create(null);
	}
}
