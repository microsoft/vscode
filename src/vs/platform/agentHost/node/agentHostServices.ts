/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../instantiation/common/descriptors.js';
import { ServiceIdentifier } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';

/**
 * The process-local Agent Host service collection. Sealing is opt-in while the
 * existing imperative registrations migrate to descriptors.
 */
export class AgentHostServiceCollection extends ServiceCollection {
	private sealed = false;

	seal(): void {
		this.sealed = true;
	}

	override set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> {
		if (this.sealed) {
			const current = this.get(id);
			const isDescriptorResolution = current instanceof SyncDescriptor && !(instanceOrDescriptor instanceof SyncDescriptor);
			if (!isDescriptorResolution) {
				throw new Error(`Agent Host service collection is sealed: ${id}`);
			}
		}
		return super.set(id, instanceOrDescriptor);
	}
}

/**
 * Registers shared Agent Host services. This starts empty so descriptor
 * registrations can migrate atomically with their imperative construction.
 */
export function registerAgentHostServices(_services: AgentHostServiceCollection): readonly ServiceIdentifier<unknown>[] {
	return [];
}
