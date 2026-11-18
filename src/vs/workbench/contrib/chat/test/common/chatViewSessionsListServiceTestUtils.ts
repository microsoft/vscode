/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatViewSessionsListService, IChatViewSessionsListService } from '../../common/chatViewSessionsListService.js';

/**
 * Stubs {@link IChatViewSessionsListService} with the real service of the environment and configuration that `instantiationService`
 * has as it is read, also of those a test stubs after it calls this.
 */
export function stubChatViewSessionsListService(instantiationService: TestInstantiationService): void {
	const current = () => instantiationService.createInstance(ChatViewSessionsListService);
	instantiationService.stub(IChatViewSessionsListService, {
		get enabled() { return current().enabled; },
		get surfacesAllLocalAgentHostAgents() { return current().surfacesAllLocalAgentHostAgents; },
	});
}
