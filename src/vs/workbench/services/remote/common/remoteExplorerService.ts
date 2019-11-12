/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export const IRemoteExplorerService = createDecorator<IRemoteExplorerService>('remoteExplorerService');

export interface IRemoteExplorerService {
	_serviceBrand: undefined;
	onDidChangeTargetType: Event<string>;
	targetType: string;
}

class RemoteExplorerService implements IRemoteExplorerService {
	public _serviceBrand: undefined;
	private _targetType: string = '';
	private _onDidChangeTargetType: Emitter<string> = new Emitter<string>();
	public onDidChangeTargetType: Event<string> = this._onDidChangeTargetType.event;

	set targetType(name: string) {
		if (this._targetType !== name) {
			this._targetType = name;
			this._onDidChangeTargetType.fire(this._targetType);
		}
	}
	get targetType(): string {
		return this._targetType;
	}
}

registerSingleton(IRemoteExplorerService, RemoteExplorerService, true);
