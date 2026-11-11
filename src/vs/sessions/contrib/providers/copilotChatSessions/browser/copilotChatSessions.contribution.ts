/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { registerCopilotChatSessionsProviders } from '../../../../../workbench/contrib/sessions/providers/copilotChatSessions/browser/copilotChatSessionsProvidersRegistration.js';

/**
 * Registers the Copilot Cloud sessions provider as a sessions provider.
 *
 * The provider only surfaces Copilot Cloud sessions from the Copilot extension;
 * local Copilot CLI sessions are owned by the agent host providers.
 */
class DefaultSessionsProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.defaultSessionsProvider';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this._register(instantiationService.invokeFunction(registerCopilotChatSessionsProviders));
	}
}

registerWorkbenchContribution2(DefaultSessionsProviderContribution.ID, DefaultSessionsProviderContribution, WorkbenchPhase.AfterRestored);
