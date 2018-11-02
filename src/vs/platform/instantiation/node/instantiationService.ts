/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IdleValue } from 'vs/base/common/async';
import { InstantiationService as BaseInstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

// this is in the /node/-layer because it depends on Proxy which isn't available
// in IE11 and therefore not in the /common/-layer

export class InstantiationService extends BaseInstantiationService {

	createChild(services: ServiceCollection): IInstantiationService {
		return new InstantiationService(services, this._strict, this);
	}

	protected _createServiceInstance<T>(ctor: any, args: any[] = [], supportsDelayedInstantiation: boolean, _trace): T {
		if (supportsDelayedInstantiation) {
			return InstantiationService._newIdleProxyService(() => super._createServiceInstance(ctor, args, supportsDelayedInstantiation, _trace));
		} else {
			return super._createServiceInstance(ctor, args, supportsDelayedInstantiation, _trace);
		}
	}

	private static _newIdleProxyService<T>(executor: () => T): T {
		const idle = new IdleValue(executor);
		return <T>new Proxy(Object.create(null), {
			get(_target: T, prop: PropertyKey): any {
				return idle.getValue()[prop];
			},
			set(_target: T, p: PropertyKey, value: any): boolean {
				idle.getValue()[p] = value;
				return true;
			}
		});
	}
}
