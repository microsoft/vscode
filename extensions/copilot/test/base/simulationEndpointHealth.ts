/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SimpleRPC } from '../../src/extension/onboardDebug/node/copilotDebugWorker/rpc';
import { ChatFetchError } from '../../src/platform/chat/common/commonTypes';
import { createServiceIdentifier } from '../../src/util/common/services';
import { CachedTestInfo } from './cachingChatMLFetcher';

export const ISimulationEndpointHealth = createServiceIdentifier<ISimulationEndpointHealth>('ISimulationEndpointHealth');

export interface ISimulationEndpointHealth {
	readonly _serviceBrand: undefined;
	readonly failures: { testInfo: CachedTestInfo; request: ChatFetchError }[];
	markFailure(testInfo: CachedTestInfo, failedRequest: ChatFetchError): void;
}

export class SimulationEndpointHealthImpl implements ISimulationEndpointHealth {

	declare readonly _serviceBrand: undefined;

	public readonly failures: { testInfo: CachedTestInfo; request: ChatFetchError }[] = [];

	constructor() { }

	markFailure(testInfo: CachedTestInfo, request: ChatFetchError) {
		this.failures.push({ testInfo, request });
	}
}

export class ProxiedSimulationEndpointHealth implements ISimulationEndpointHealth {
	declare readonly _serviceBrand: undefined;

	public readonly failures: { testInfo: CachedTestInfo; request: ChatFetchError }[] = [];

	public static registerTo(instance: ISimulationEndpointHealth, rpc: SimpleRPC): ISimulationEndpointHealth {
		rpc.registerMethod('ProxiedSimulationEndpointHealth.markFailure', ({ testInfo, request }) => {
			instance.markFailure(testInfo, request);
		});
		return instance;
	}

	constructor(
		private readonly rpc: SimpleRPC,
	) { }

	markFailure(testInfo: CachedTestInfo, request: ChatFetchError): void {
		this.failures.push({ testInfo, request });
		this.rpc.callMethod('ProxiedSimulationEndpointHealth.markFailure', { testInfo, request });
	}
}
