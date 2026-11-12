/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsHostLayoutService } from '../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { IAgentWorkbenchLayoutService } from '../../browser/workbench.js';

/**
 * Stubs {@link ISessionsHostLayoutService} with whatever Agents workbench layout service is stubbed when it is used,
 * which also provides the docked side pane, as the Agents workbench does.
 */
export function stubSessionsHostLayout(instantiationService: TestInstantiationService): void {
	instantiationService.stub(ISessionsHostLayoutService, new Proxy({}, {
		get: (_target, property) => {
			const layout = instantiationService.get(IAgentWorkbenchLayoutService);
			return property === 'sidePane' ? layout : Reflect.get(layout, property);
		}
	}) as ISessionsHostLayoutService);
}
