/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { IdleValue } from 'vs/base/common/async';
import { InstantiationService as BaseInstantiationService } from 'vs/platform/instantiation/common/instantiationService';

// this is in the /node/-layer because it depends on Proxy which isn't available
// in IE11 and therefore not in the /common/-layer

export class InstantiationService extends BaseInstantiationService {

	protected _createServiceInstance<T>(ctor: any, args: any[] = [], _trace): T {
		return InstantiationService._newIdleProxyService(() => super._createServiceInstance(ctor, args, _trace));
	}

	private static _newIdleProxyService<T>(executor: () => T): T {
		const idle = new IdleValue(executor);
		return <T>new Proxy(Object.create(null), {
			get(_target, prop) {
				return idle.getValue()[prop];
			}
		});
	}
}
