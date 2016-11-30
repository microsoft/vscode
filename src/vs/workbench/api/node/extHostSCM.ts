/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { asWinJsPromise } from 'vs/base/common/async';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { SCMProvider } from 'vscode';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { MainContext, MainThreadSCMShape } from './extHost.protocol';

export class ExtHostSCM {

	private _proxy: MainThreadSCMShape;
	private _providers: { [id: string]: SCMProvider; } = Object.create(null);

	private _onDidChangeActiveProvider = new Emitter<SCMProvider>();
	get onDidChangeActiveProvider(): Event<SCMProvider> { return this._onDidChangeActiveProvider.event; }

	private _activeProvider: SCMProvider;
	get activeProvider(): SCMProvider | undefined { return this._activeProvider; }

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadSCM);
	}

	registerSCMProvider(id: string, provider: SCMProvider): Disposable {
		if (this._providers[id]) {
			throw new Error(`Provider ${id} already registered`);
		}

		// TODO@joao: should pluck all the things out of the provider
		this._providers[id] = provider;

		this._proxy.$register(id, {
			commitCommand: provider.commitCommand,
			clickCommand: provider.clickCommand,
			dragCommand: provider.dragCommand,
			supportsOriginalResource: !!provider.getOriginalResource
		});

		return new Disposable(() => {
			delete this._providers[id];
			this._proxy.$unregister(id);
		});
	}

	$getOriginalResource(id: string, uri: URI): TPromise<URI> {
		const provider = this._providers[id];

		if (!provider) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.getOriginalResource(uri, token));
	}
}
