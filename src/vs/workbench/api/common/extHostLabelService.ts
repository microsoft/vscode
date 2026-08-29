/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceLabelFormatter } from '../../../platform/label/common/label.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { MainThreadLabelServiceShape, ExtHostLabelServiceShape, MainContext, IMainContext } from './extHost.protocol.js';

export class ExtHostLabelService implements ExtHostLabelServiceShape {

	private readonly _proxy: MainThreadLabelServiceShape;
	private _handlePool: number = 0;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadLabelService);
	}

	$registerResourceLabelFormatter(formatter: ResourceLabelFormatter): IDisposable {
		const handle = this._handlePool++;
		this._proxy.$registerResourceLabelFormatter(handle, formatter);

		return toDisposable(() => {
			this._proxy.$unregisterResourceLabelFormatter(handle);
		});
	}
}