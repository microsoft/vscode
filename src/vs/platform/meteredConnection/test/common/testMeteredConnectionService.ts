/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMeteredConnectionService } from '../../common/meteredConnection.js';

export class TestMeteredConnectionService extends Disposable implements IMeteredConnectionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	readonly onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;

	constructor(
		public isConnectionMetered: boolean,
		readonly whenInitialized: Promise<void> = Promise.resolve(),
	) {
		super();
	}

	setIsConnectionMetered(isMetered: boolean): void {
		this.isConnectionMetered = isMetered;
		this._onDidChangeIsConnectionMetered.fire(isMetered);
	}
}
