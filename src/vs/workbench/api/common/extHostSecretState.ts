/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostSecretStateShape, MainContext, MainThreadSecretStateShape } from './extHost.protocol.js';
import { Emitter } from '../../../base/common/event.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export class ExtHostSecretState implements ExtHostSecretStateShape {
	private _proxy: MainThreadSecretStateShape;
	private _onDidChangePassword = new Emitter<{ extensionId: string; key: string }>();
	readonly onDidChangePassword = this._onDidChangePassword.event;

	constructor(mainContext: IExtHostRpcService) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSecretState);
	}

	async $onDidChangePassword(e: { extensionId: string; key: string }): Promise<void> {
		this._onDidChangePassword.fire(e);
	}

	get(extensionId: string, key: string): Promise<string | undefined> {
		return this._proxy.$getPassword(extensionId, key);
	}

	store(extensionId: string, key: string, value: string): Promise<void> {
		return this._proxy.$setPassword(extensionId, key, value);
	}

	delete(extensionId: string, key: string): Promise<void> {
		return this._proxy.$deletePassword(extensionId, key);
	}
}

export interface IExtHostSecretState extends ExtHostSecretState { }
export const IExtHostSecretState = createDecorator<IExtHostSecretState>('IExtHostSecretState');
