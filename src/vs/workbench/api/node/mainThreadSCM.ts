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
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape } from './extHost.protocol';

interface Supports {
	originalResource: boolean;
}

class MainThreadSCMProvider implements ISCMProvider {

	get id(): string { return this._id; }

	private _onChange = new Emitter<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	readonly resourceGroups: ISCMResourceGroup[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private _id: string,
		private proxy: ExtHostSCMShape,
		private supports: Supports,
		@ISCMService scmService: ISCMService
	) {
		this.disposables.push(scmService.registerSCMProvider(this));
	}

	commit(message: string): TPromise<void> {
		return TPromise.wrapError<void>('commit not implemented');
	}

	open(uri: ISCMResource): TPromise<void> {
		return TPromise.wrapError<void>('open not implemented');
	}

	drag(from: ISCMResource, to: ISCMResource): TPromise<void> {
		return TPromise.wrapError<void>('drag not implemented');
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		if (!this.supports.originalResource) {
			return TPromise.as(null);
		}

		return this.proxy.$getBaselineResource(this.id, uri);
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

	$register(id: string, registerOriginalResourceProvider: boolean): void {
		this.providers[id] = this.instantiationService.createInstance(MainThreadSCMProvider, id, this.proxy, {
			originalResource: registerOriginalResourceProvider
		});
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
