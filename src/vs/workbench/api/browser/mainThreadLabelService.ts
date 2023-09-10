/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ILabelService, ResourceLabelFormatter } from 'vs/platform/label/common/label';
import { MainContext, MainThreadLabelServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';

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
