/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { type IAgent } from '../../common/agent.js';
import type { IAgentHostProviderService } from '../../node/agentHostProviderService.js';

export function createTestAgentHostProviderService(getProviderForSession: (session: URI | string) => IAgent | undefined): IAgentHostProviderService {
	const agents = observableValue<readonly IAgent[]>('testAgentHostProviderService', []);
	return {
		_serviceBrand: undefined,
		agents,
		onDidRegisterProvider: Event.None,
		onMcpNotification: Event.None,
		registerProviderInitializer: () => Disposable.None,
		registerProvider: () => { throw new Error('Not implemented'); },
		resolveProvider: () => undefined,
		getProvider: () => undefined,
		getProviderForSession,
		getProviders: () => [],
		associateSession: () => { },
		releaseSession: () => { },
		authenticate: async () => ({ authenticated: false }),
		handleMcpRequest: async () => { throw new Error('Not implemented'); },
		getNetworkDiagnostics: async () => ({ endpoints: [], account: undefined }),
		getManagedSettingsDiagnostics: async () => [],
		shutdown: async () => { },
	};
}
