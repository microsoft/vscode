/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { confirmSessionShutdown, getEffectiveSessionShutdownReason } from '../../../../../workbench/contrib/chat/electron-browser/chatLifecycle.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { INativeWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/electron-browser/environmentService.js';
import { ILifecycleService, ShutdownReason } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { isActiveSessionStatus } from '../../../../services/sessions/common/session.js';

export class LocalAgentHostLifecycleContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.localAgentHostLifecycle';

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IDialogService private readonly dialogService: IDialogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this._register(lifecycleService.onBeforeShutdown(event => {
			event.veto(this.shouldVetoShutdown(event.reason), 'veto.sessions.localAgentHost');
		}));
	}

	private hasActiveSession(): boolean {
		if (this.sessionsManagementService.getInFlightNewSessionRequests().some(session => session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID)) {
			return true;
		}

		const provider = this.sessionsProvidersService.getProvider(LOCAL_AGENT_HOST_PROVIDER_ID);
		return provider?.getSessions().some(session => !session.isArchived.get() && isActiveSessionStatus(session.status.get())) === true;
	}

	private async shouldVetoShutdown(reason: ShutdownReason): Promise<boolean> {
		if (this.environmentService.enableSmokeTestDriver || this.chatEntitlementService.sentiment.hidden) {
			return false;
		}

		const windowCount = reason === ShutdownReason.CLOSE ? await this.nativeHostService.getWindowCount() : 0;
		const effectiveReason = getEffectiveSessionShutdownReason(reason, windowCount, isMacintosh);
		if (effectiveReason !== ShutdownReason.QUIT || !this.hasActiveSession()) {
			return false;
		}

		if (ChatContextKeys.skipChatRequestInProgressMessage.getValue(this.contextKeyService) === true) {
			return false;
		}

		return !await confirmSessionShutdown(this.dialogService, effectiveReason);
	}
}

registerWorkbenchContribution2(LocalAgentHostLifecycleContribution.ID, LocalAgentHostLifecycleContribution, WorkbenchPhase.AfterRestored);
