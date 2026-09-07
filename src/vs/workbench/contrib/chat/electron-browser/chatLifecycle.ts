/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShutdownReason } from '../../../services/lifecycle/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { AgentSessionProviders } from '../browser/agentSessions/agentSessions.js';
import { type IAgentSession, isSessionInProgressStatus } from '../browser/agentSessions/agentSessionsModel.js';
import { isLocalAgentHostTarget, isRemoteAgentHostTarget } from '../common/chatSessionsService.js';

type ShutdownWarningSession = Pick<IAgentSession, 'isArchived' | 'providerType' | 'status'>;

export function getEffectiveSessionShutdownReason(reason: ShutdownReason, windowCount: number, macintosh: boolean): ShutdownReason {
	return reason === ShutdownReason.CLOSE && !macintosh && windowCount === 1 ? ShutdownReason.QUIT : reason;
}

export async function confirmSessionShutdown(dialogService: IDialogService, reason: ShutdownReason): Promise<boolean> {
	let message: string;
	let detail: string;
	switch (reason) {
		case ShutdownReason.CLOSE:
			message = localize('closeTheWindow.message', "A session is in progress. Are you sure you want to close the window?");
			detail = localize('closeTheWindow.detail', "The session will stop if you close the window.");
			break;
		case ShutdownReason.LOAD:
			message = localize('changeWorkspace.message', "A session is in progress. Are you sure you want to change the workspace?");
			detail = localize('changeWorkspace.detail', "The session will stop if you change the workspace.");
			break;
		case ShutdownReason.RELOAD:
			message = localize('reloadTheWindow.message', "A session is in progress. Are you sure you want to reload the window?");
			detail = localize('reloadTheWindow.detail', "The session will stop if you reload the window.");
			break;
		default:
			message = isMacintosh ? localize('quit.message', "A session is in progress. Are you sure you want to quit?") : localize('exit.message', "A session is in progress. Are you sure you want to exit?");
			detail = isMacintosh ? localize('quit.detail', "The session will stop if you quit.") : localize('exit.detail', "The session will stop if you exit.");
			break;
	}

	return (await dialogService.confirm({ message, detail, custom: true })).confirmed;
}

export function shouldWarnForInFlightSessionShutdown(sessionTypes: readonly string[], reason: ShutdownReason): boolean {
	return reason === ShutdownReason.QUIT && sessionTypes.some(isLocalAgentHostTarget);
}

export function shouldWarnForSessionShutdown(session: ShutdownWarningSession, reason: ShutdownReason): boolean {
	if (!isSessionInProgressStatus(session.status) || session.providerType === AgentSessionProviders.Cloud || session.isArchived()) {
		return false;
	}

	if (isRemoteAgentHostTarget(session.providerType)) {
		return false;
	}

	if (isLocalAgentHostTarget(session.providerType)) {
		return reason === ShutdownReason.QUIT;
	}

	return true;
}
