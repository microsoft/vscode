/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IAgentFinderResource } from '../../../../platform/agentFinder/common/agentFinderService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type AgentFinderInstallState =
	| { readonly kind: 'available' | 'installing' | 'installed' }
	| { readonly kind: 'unavailable'; readonly message: string };

export const IAgentFinderInstallService = createDecorator<IAgentFinderInstallService>('agentFinderInstallService');

export interface IAgentFinderInstallService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getInstallState(resource: IAgentFinderResource): AgentFinderInstallState;
	/** Uses the owning install flow; cancellation rejects with a CancellationError. */
	install(resource: IAgentFinderResource): Promise<void>;
}
