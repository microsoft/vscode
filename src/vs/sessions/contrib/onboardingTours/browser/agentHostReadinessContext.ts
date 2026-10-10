/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { AgentHostSessionTypesAvailableContext } from '../../../common/contextkeys.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class AgentHostReadinessContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.onboardingTours.agentHostReadinessContext';

	private readonly _agentHostSessionTypesAvailable: IContextKey<boolean>;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._agentHostSessionTypesAvailable = AgentHostSessionTypesAvailableContext.bindTo(contextKeyService);
		this._register(toDisposable(() => this._agentHostSessionTypesAvailable.reset()));
		this._register(this._sessionsManagementService.onDidChangeSessionTypes(() => this._update()));
		this._update();
	}

	private _update(): void {
		this._agentHostSessionTypesAvailable.set(this._sessionsManagementService.getAllProviderSessionTypes()
			.some(({ providerId }) => isAgentHostProviderId(providerId)));
	}
}

registerWorkbenchContribution2(AgentHostReadinessContextContribution.ID, AgentHostReadinessContextContribution, WorkbenchPhase.BlockRestore);
