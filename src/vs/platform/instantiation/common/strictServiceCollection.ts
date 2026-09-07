/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from './descriptors.js';
import { ServiceIdentifier, _util } from './instantiation.js';
import { ServiceCollection } from './serviceCollection.js';

/**
 * A service collection that rejects descriptor static arguments which
 * `InstantiationService` would otherwise pad or truncate at resolution time.
 */
export class StrictServiceCollection extends ServiceCollection {
	constructor(...entries: ConstructorParameters<typeof ServiceCollection>) {
		super();
		for (const [id, service] of entries) {
			this.set(id, service);
		}
	}

	override set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> {
		if (instanceOrDescriptor instanceof SyncDescriptor) {
			const dependencies = _util.getServiceDependencies(instanceOrDescriptor.ctor).sort((a, b) => a.index - b.index);
			if (dependencies.length > 0 && instanceOrDescriptor.staticArguments.length !== dependencies[0].index) {
				throw new Error(
					`Descriptor ${instanceOrDescriptor.ctor.name} must pass exactly ${dependencies[0].index} leading static arguments `
					+ `(got ${instanceOrDescriptor.staticArguments.length})`
				);
			}
		}
		return super.set(id, instanceOrDescriptor);
	}
}
