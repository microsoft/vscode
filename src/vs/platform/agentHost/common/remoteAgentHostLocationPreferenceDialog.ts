/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Codicon } from '../../../base/common/codicons.js';
import Severity from '../../../base/common/severity.js';
import { localize } from '../../../nls.js';
import { IDialogService } from '../../dialogs/common/dialogs.js';
import { RemoteAgentHostLocationPreference } from './remoteAgentHostLocationPreference.js';

interface IRemoteAgentHostLocationOption {
	readonly preference: RemoteAgentHostLocationPreference;
	readonly label: string;
	readonly detail: string;
}

function remoteAgentHostLocationOptions(): IRemoteAgentHostLocationOption[] {
	return [
		{
			preference: 'dedicated',
			label: localize('remoteAgentHostLocation.dedicated', "Dedicated Agent Host"),
			detail: localize('remoteAgentHostLocation.dedicated.detail', "Runs independently and stays available while agents are active."),
		},
		{
			preference: 'editor',
			label: localize('remoteAgentHostLocation.editor', "VS Code Editor"),
			detail: localize('remoteAgentHostLocation.editor.detail', "Runs in a remote VS Code window and stops when that window closes."),
		},
	];
}

/**
 * Order the location options so the host's current preference, if any, is
 * offered first. This is the only supported way to surface the current
 * preference in the modal — the shared dialog primitive has no separate
 * "selected" affordance.
 */
export function orderRemoteAgentHostLocationOptions(currentPreference: RemoteAgentHostLocationPreference | undefined): IRemoteAgentHostLocationOption[] {
	const options = remoteAgentHostLocationOptions();
	const current = options.find(option => option.preference === currentPreference);
	if (!current) {
		return options;
	}
	return [current, ...options.filter(option => option !== current)];
}

/**
 * Prompt the user to choose where agents should run on `hostLabel` using the
 * standard two-choice custom dialog pattern. Returns the chosen preference,
 * or `undefined` if the user cancels. Does not persist the choice or affect
 * any running connection.
 *
 * `token`, when provided, is forwarded as the dialog's cancellation token so
 * a caller (e.g. an SSH connection cancelled from the main process) can
 * dismiss an open modal programmatically.
 */
export async function promptRemoteAgentHostLocationPreference(
	dialogService: IDialogService,
	hostLabel: string,
	currentPreference?: RemoteAgentHostLocationPreference,
	token?: CancellationToken,
): Promise<RemoteAgentHostLocationPreference | undefined> {
	const options = orderRemoteAgentHostLocationOptions(currentPreference);

	const { result } = await dialogService.prompt<RemoteAgentHostLocationPreference>({
		type: Severity.Info,
		message: localize('remoteAgentHostLocation.message', "Where should agents run on {0}?", hostLabel),
		detail: localize('remoteAgentHostLocation.reminder', "You can change this later with the Chat: Change Preferred Remote Agent Location command."),
		cancelButton: true,
		buttons: options.map(option => ({
			label: option.label,
			run: () => option.preference,
		})),
		custom: {
			icon: Codicon.remote,
			buttonDetails: options.map(option => option.detail),
		},
		token,
	});

	return result;
}
