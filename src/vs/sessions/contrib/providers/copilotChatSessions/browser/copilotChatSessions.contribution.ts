/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { registerCopilotChatSessionsProviders } from '../../../../../workbench/contrib/sessions/providers/copilotChatSessions/browser/copilotChatSessionsProvidersRegistration.js';

/** Registers the Copilot Cloud sessions providers of the Agents window. */
class DefaultSessionsProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.defaultSessionsProvider';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this._register(instantiationService.invokeFunction(registerCopilotChatSessionsProviders));
	}
}

registerWorkbenchContribution2(DefaultSessionsProviderContribution.ID, DefaultSessionsProviderContribution, WorkbenchPhase.AfterRestored);
