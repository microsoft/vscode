/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape } from './extHost.protocol';

export class MainThreadSCM extends MainThreadSCMShape {

	private toDispose: IDisposable;
	private proxy: ExtHostSCMShape;
	private providers: { [id: string]: IDisposable; } = Object.create(null);

	constructor(
		@IThreadService threadService: IThreadService,
		@ISCMService private scmService: ISCMService
	) {
		super();

		this.proxy = threadService.get(ExtHostContext.ExtHostSCM);
	}

	$register(id: string, registerOriginalResourceProvider: boolean): void {
		const disposables = [];

		if (registerOriginalResourceProvider) {
			const baselineProvider = this.scmService.registerBaselineResourceProvider({
				getBaselineResource: uri => this.proxy.$getBaselineResource(id, uri)
			});

			disposables.push(baselineProvider);
		}

		this.providers[id] = combinedDisposable(disposables);
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
		this.toDispose = dispose(this.toDispose);
	}
}
