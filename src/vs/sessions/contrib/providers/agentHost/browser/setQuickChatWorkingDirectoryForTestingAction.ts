/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Schemas } from '../../../../../base/common/network.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { parseChatUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IsQuickChatSessionContext, SessionIsCreatedContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IsAgentHostSession } from './agentHostSkillButtons.js';

export class SetQuickChatWorkingDirectoryForTestingAction extends Action2 {

	static readonly ID = 'agentHost.setQuickChatWorkingDirectoryForTesting';

	constructor() {
		super({
			id: SetQuickChatWorkingDirectoryForTestingAction.ID,
			title: localize2('setQuickChatWorkingDirectoryForTesting', "Convert Active Quick Chat to Workspace Session..."),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(
				IsDevelopmentContext,
				ChatContextKeys.enabled,
				IsSessionsWindowContext,
				IsAgentHostSession,
				IsQuickChatSessionContext,
				SessionIsCreatedContext,
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		try {
			await setQuickChatWorkingDirectoryForTesting(accessor);
		} catch (error) {
			notificationService.error(localize(
				'setQuickChatWorkingDirectoryForTesting.error',
				"Unable to convert the active Quick Chat to a workspace session: {0}",
				toErrorMessage(error),
			));
		}
	}
}

export async function setQuickChatWorkingDirectoryForTesting(accessor: ServicesAccessor): Promise<void> {
	const sessionsService = accessor.get(ISessionsService);
	const sessionsProvidersService = accessor.get(ISessionsProvidersService);
	const agentHostService = accessor.get(IAgentHostService);
	const fileDialogService = accessor.get(IFileDialogService);
	const notificationService = accessor.get(INotificationService);

	const activeSession = sessionsService.activeSession.get();
	const isQuickChat = activeSession?.isQuickChat;
	if (!activeSession || activeSession.providerId !== LOCAL_AGENT_HOST_PROVIDER_ID || !isQuickChat?.get()) {
		throw new Error(localize(
			'setQuickChatWorkingDirectoryForTesting.noQuickChat',
			"Open a local Agent Host Quick Chat before running this command.",
		));
	}

	const provider = sessionsProvidersService.getProvider(activeSession.providerId);
	if (!provider || !isAgentHostProvider(provider)) {
		throw new Error(localize(
			'setQuickChatWorkingDirectoryForTesting.noProvider',
			"The local Agent Host Sessions provider is unavailable.",
		));
	}

	const backendChat = provider.getBackendChatResource(activeSession.mainChat.get().resource);
	if (!backendChat || !parseChatUri(backendChat)) {
		throw new Error(localize(
			'setQuickChatWorkingDirectoryForTesting.notLive',
			"Send a message in the Quick Chat and wait for it to become idle before running this command.",
		));
	}

	const selected = await fileDialogService.showOpenDialog({
		title: localize('setQuickChatWorkingDirectoryForTesting.pickFolder', "Select Quick Chat Working Directory"),
		openLabel: localize('setQuickChatWorkingDirectoryForTesting.selectFolder', "Select"),
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		defaultUri: await fileDialogService.defaultFolderPath(Schemas.file),
		availableFileSystems: [Schemas.file],
	});
	const workingDirectory = selected?.[0];
	if (!workingDirectory) {
		return;
	}

	await agentHostService.setSessionWorkingDirectoryForTesting(backendChat, workingDirectory);
	await waitForState(isQuickChat, value => !value);
	notificationService.info(localize(
		'setQuickChatWorkingDirectoryForTesting.success',
		"The active Quick Chat was converted to a workspace session in '{0}'.",
		workingDirectory.fsPath,
	));
}
