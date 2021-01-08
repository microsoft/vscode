/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostSecretStateShape, MainContext, MainThreadSecretStateShape } from 'vs/workbench/api/common/extHost.protocol';
import { Emitter, Event } from 'vs/base/common/event';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export class ExtHostSecretState implements ExtHostSecretStateShape {
	private _proxy: MainThreadSecretStateShape;
	private _onDidChangePassword = new Emitter<void>();
	readonly onDidChangePassword: Event<void> = this._onDidChangePassword.event;

	constructor(mainContext: IExtHostRpcService) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSecretState);
	}

	async $onDidChangePassword(): Promise<void> {
		this._onDidChangePassword.fire();
	}

	get(extensionId: string, key: string): Promise<string | undefined> {
		return this._proxy.$getPassword(extensionId, key);
	}

	set(extensionId: string, key: string, value: string): Promise<void> {
		return this._proxy.$setPassword(extensionId, key, value);
	}

	delete(extensionId: string, key: string): Promise<void> {
		return this._proxy.$deletePassword(extensionId, key);
	}
}

export interface IExtHostSecretState extends ExtHostSecretState { }
export const IExtHostSecretState = createDecorator<IExtHostSecretState>('IExtHostSecretState');
