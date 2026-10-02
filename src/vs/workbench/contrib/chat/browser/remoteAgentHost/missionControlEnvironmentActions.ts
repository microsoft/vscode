/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICloudSandboxAgentHostService, ICloudSandboxApiService, type IMissionControlEnvironment } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { type ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, type IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';

export const ConnectMissionControlEnvironmentCommand = 'workbench.action.chat.connectMissionControlEnvironment';

interface IEnvironmentPick extends IQuickPickItem {
	readonly environment: IMissionControlEnvironment;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ConnectMissionControlEnvironmentCommand,
			title: localize2('connectMissionControlEnvironment', "Connect to Mission Control Environment..."),
			f1: true,
			precondition: ContextKeyExpr.and(IsDevelopmentContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		if (accessor.get(IEnvironmentService).isBuilt || accessor.get(IChatEntitlementService).sentiment.hidden) {
			throw new Error('User-local Mission Control connections are development-only.');
		}
		const api = accessor.get(ICloudSandboxApiService);
		const connections = accessor.get(ICloudSandboxAgentHostService);
		const picker = accessor.get(IQuickInputService);
		const notifications = accessor.get(INotificationService);
		const local = accessor.get(IAgentHostService);
		try {
			const ownEnvironment = await local.getExperimentalMissionControlEnvironmentId?.();
			const items = api.listEnvironments(CancellationToken.None).then(environments => environments
				.filter(environment => environment.kind === 'user-local' && environment.id !== ownEnvironment)
				.sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online') || a.name.localeCompare(b.name))
				.map(environment => ({ label: environment.name, description: environment.status, detail: environment.id, environment })));
			const selection = await picker.pick<IEnvironmentPick>(items, {
				title: localize('missionControlEnvironments', "Mission Control Environments"),
				placeHolder: localize('selectMissionControlEnvironment', "Select an existing user-local host; no replacement compute is provisioned"),
				matchOnDescription: true,
				matchOnDetail: true,
			});
			if (!selection) {
				return;
			}
			const current = await api.getEnvironment(selection.environment.id, CancellationToken.None);
			if (current.id !== selection.environment.id) {
				throw new Error('Mission Control returned a different environment.');
			}
			if (current.status !== 'online') {
				notifications.warn(localize('missionControlEnvironmentOffline', "{0} is not online. Start its owning application before connecting.", selection.environment.name));
				return;
			}
			await connections.connect({
				environmentId: selection.environment.id, name: selection.environment.name, environmentKind: 'user-local',
			}, CancellationToken.None);
		} catch (error) {
			if (!isCancellationError(error)) {
				notifications.error(error);
			}
		}
	}
});
