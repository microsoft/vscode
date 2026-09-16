/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { constObservable } from '../../../../base/common/observable.js';
import { mock } from '../../../../base/test/common/mock.js';
import type { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { IAgentHostRemoteAgentsService } from '../../node/agentHostRemoteAgentsService.js';
import { IAgentHostStorageService } from '../../node/agentHostStorageService.js';
import { IAgentHostSessionToolCallbacks, SessionCreationBudget, type IAgentServiceSessionServerToolAccessor } from '../../node/shared/sessionServerTools.js';

class InMemoryAgentHostStorageService extends mock<IAgentHostStorageService>() {
	override readonly onDidChange = Event.None;
	override readonly loadError = undefined;
	private readonly _values = new Map<string, unknown>();

	override get<T>(key: string): T | undefined {
		return this._values.get(key) as T | undefined;
	}

	override set<T>(key: string, value: T): void {
		this._values.set(key, value);
	}

	override async setAndFlush<T>(key: string, value: T): Promise<void> {
		this.set(key, value);
	}

	override delete(key: string): void {
		this._values.delete(key);
	}

	override async whenIdle(): Promise<void> { }
}

/** Supplies inert dependencies for test graphs that only exercise unrelated chat contributions. */
export function registerNoopRemoteSessionDelegationServices(services: ServiceCollection): void {
	services.set(IAgentHostRemoteAgentsService, new class extends mock<IAgentHostRemoteAgentsService>() {
		override readonly enabled = constObservable(false);
		override readonly tunnelDiscoveryEnabled = constObservable(false);
		override readonly tunnelDiscoveryState = constObservable({ kind: 'disabled' } as const);
		override readonly targets = constObservable([]);
	});
	services.set(IAgentHostSessionToolCallbacks, new class extends mock<IAgentHostSessionToolCallbacks>() {
		override readonly accessor = new class extends mock<IAgentServiceSessionServerToolAccessor>() { };
		override readonly sessionCreationBudget = new SessionCreationBudget();
	});
	services.set(IAgentHostStorageService, new InMemoryAgentHostStorageService());
}
