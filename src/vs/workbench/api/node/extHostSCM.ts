/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { asWinJsPromise } from 'vs/base/common/async';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { SCMProvider, SCMDelegate, SCMResourceGroup } from 'vscode';
import { MainContext, MainThreadSCMShape } from './extHost.protocol';

class ExtHostSCMProvider implements SCMProvider {

	static Providers: { [id: string]: ExtHostSCMProvider; } = Object.create(null);

	constructor(
		private _proxy: MainThreadSCMShape,
		private _id: string,
		private _delegate: SCMDelegate
	) {
		if (ExtHostSCMProvider.Providers[_id]) {
			throw new Error('provider already exists');
		}

		ExtHostSCMProvider.Providers[_id] = this;
		_proxy.$register(this._id, !!this._delegate.getOriginalResource);
	}

	get id(): string {
		return this._id;
	}

	createResourceGroup(id: string, label: string): SCMResourceGroup {
		throw new Error('JOAO not implemented');
	}

	getBaselineResource(uri: URI): TPromise<URI> {
		return asWinJsPromise(token => this._delegate.getOriginalResource(uri, token));
	}

	dispose(): void {
		this._proxy.$unregister(this._id);
		delete ExtHostSCMProvider.Providers[this.id];
	}
}

export class ExtHostSCM {

	private _proxy: MainThreadSCMShape;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadSCM);
	}

	createSCMProvider(id: string, delegate: SCMDelegate): SCMProvider {
		return new ExtHostSCMProvider(this._proxy, id, delegate);
	}

	$getBaselineResource(id: string, uri: URI): TPromise<URI> {
		const provider = ExtHostSCMProvider.Providers[id];

		if (!provider) {
			return TPromise.as(null);
		}

		return provider.getBaselineResource(uri);
	}
}
