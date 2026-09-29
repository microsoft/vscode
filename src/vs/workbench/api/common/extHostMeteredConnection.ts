/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ExtHostMeteredConnectionShape } from './extHost.protocol.js';

export interface IExtHostMeteredConnection extends ExtHostMeteredConnectionShape {
	readonly _serviceBrand: undefined;
	readonly isConnectionMetered: boolean;
	readonly onDidChangeIsConnectionMetered: Event<boolean>;
}

export const IExtHostMeteredConnection = createDecorator<IExtHostMeteredConnection>('IExtHostMeteredConnection');

export class ExtHostMeteredConnection extends Disposable implements IExtHostMeteredConnection, ExtHostMeteredConnectionShape {

	declare readonly _serviceBrand: undefined;

	private _isConnectionMetered: boolean = false;

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	readonly onDidChangeIsConnectionMetered: Event<boolean> = this._onDidChangeIsConnectionMetered.event;

	constructor() {
		super();
	}

	get isConnectionMetered(): boolean {
		return this._isConnectionMetered;
	}

	$initializeIsConnectionMetered(isMetered: boolean): void {
		this._isConnectionMetered = isMetered;
	}

	$onDidChangeIsConnectionMetered(isMetered: boolean): void {
		if (this._isConnectionMetered !== isMetered) {
			this._isConnectionMetered = isMetered;
			this._onDidChangeIsConnectionMetered.fire(isMetered);
		}
	}
}
