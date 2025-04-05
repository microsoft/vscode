/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ILabelService, ResourceLabelFormatter } from '../../../platform/label/common/label.js';
import { MainContext, MainThreadLabelServiceShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';

@extHostNamedCustomer(MainContext.MainThreadLabelService)
export class MainThreadLabelService extends Disposable implements MainThreadLabelServiceShape {

	private readonly _resourceLabelFormatters = this._register(new DisposableMap<number>());

	constructor(
		_: IExtHostContext,
		@ILabelService private readonly _labelService: ILabelService
	) {
		super();
	}

	$registerResourceLabelFormatter(handle: number, formatter: ResourceLabelFormatter): void {
		// Dynamicily registered formatters should have priority over those contributed via package.json
		formatter.priority = true;
		const disposable = this._labelService.registerCachedFormatter(formatter);
		this._resourceLabelFormatters.set(handle, disposable);
	}

	$unregisterResourceLabelFormatter(handle: number): void {
		this._resourceLabelFormatters.deleteAndDispose(handle);
	}
}
