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
import { ISCMService, ISCMProvider, ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures } from './extHost.protocol';

class MainThreadSCMProvider implements ISCMProvider {

	get id(): string { return this._id; }

	private _onChange = new Emitter<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	readonly resourceGroups: ISCMResourceGroup[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private _id: string,
		private proxy: ExtHostSCMShape,
		private features: SCMProviderFeatures,
		@ISCMService scmService: ISCMService,
		@ICommandService private commandService: ICommandService
	) {
		this.disposables.push(scmService.registerSCMProvider(this));
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

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class MainThreadSCM extends MainThreadSCMShape {

	private proxy: ExtHostSCMShape;
	private providers: { [id: string]: IDisposable; } = Object.create(null);

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

	dispose(): void {
		Object.keys(this.providers)
			.forEach(id => this.providers[id].dispose());

		this.providers = Object.create(null);
	}
}
