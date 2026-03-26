/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CopilotChatSessionsProvider } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';

/**
 * Registers the {@link CopilotChatSessionsProvider} as a sessions provider.
 */
class DefaultSessionsProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.defaultSessionsProvider';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
		const provider = this._register(instantiationService.createInstance(CopilotChatSessionsProvider));
		this._register(sessionsProvidersService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(DefaultSessionsProviderContribution.ID, DefaultSessionsProviderContribution, WorkbenchPhase.AfterRestored);
