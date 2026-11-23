/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
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

/**
 * Stubs what `ChatViewHostService` reads to know whether a provided sessions list is expected: a window that has the shared list
 * off, and, unless the test stubs it already, a local editor window.
 */
export function stubChatViewHostServiceDependencies(instantiationService: TestInstantiationService, options?: { readonly environmentStubbed?: boolean }): void {
	instantiationService.stub(IChatViewSessionsListService, upcastPartial<IChatViewSessionsListService>({ enabled: constObservable(false) }));
	if (!options?.environmentStubbed) {
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
	}
}
