/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI, { UriComponents } from 'vs/base/common/uri';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ExtHostContext, MainContext, IExtHostContext, MainThreadDecorationsShape, ExtHostDecorationsShape } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IDecorationsService, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';

@extHostNamedCustomer(MainContext.MainThreadDecorations)
export class MainThreadDecorations implements MainThreadDecorationsShape {

	private readonly _provider = new Map<number, [Emitter<URI[]>, IDisposable]>();
	private readonly _proxy: ExtHostDecorationsShape;

	constructor(
		context: IExtHostContext,
		@IDecorationsService private readonly _decorationsService: IDecorationsService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostDecorations);
	}

	dispose() {
		this._provider.forEach(value => dispose(value));
		this._provider.clear();
	}

	$registerDecorationProvider(handle: number, label: string): void {
		let emitter = new Emitter<URI[]>();
		let registration = this._decorationsService.registerDecorationsProvider({
			label,
			onDidChange: emitter.event,
			provideDecorations: (uri) => {
				return this._proxy.$provideDecorations(handle, uri).then(data => {
					if (!data) {
						return undefined;
					}
					const [weight, bubble, tooltip, letter, themeColor, source] = data;
					return <IDecorationData>{
						weight: weight || 0,
						bubble: bubble || false,
						color: themeColor && themeColor.id,
						tooltip,
						letter,
						source,
					};
				});
			}
		});
		this._provider.set(handle, [emitter, registration]);
	}

	$onDidChange(handle: number, resources: UriComponents[]): void {
		const [emitter] = this._provider.get(handle);
		emitter.fire(resources && resources.map(URI.revive));
	}

	$unregisterDecorationProvider(handle: number): void {
		if (this._provider.has(handle)) {
			dispose(this._provider.get(handle));
			this._provider.delete(handle);
		}
	}
}
