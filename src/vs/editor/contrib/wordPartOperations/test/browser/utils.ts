/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceIdentifier, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';

export class StaticServiceAccessor implements ServicesAccessor {
	private services = new Map<ServiceIdentifier<any>, any>();

	public withService<T>(id: ServiceIdentifier<T>, service: T): this {
		this.services.set(id, service);
		return this;
	}

	public get<T>(id: ServiceIdentifier<T>): T {
		const value = this.services.get(id);
		if (!value) {
			throw new Error('Service does not exist');
		}
		return value;
	}
}
