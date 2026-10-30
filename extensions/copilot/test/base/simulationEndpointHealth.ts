/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
