/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Codicon } from '../../../base/common/codicons.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../base/common/htmlContent.js';
import Severity from '../../../base/common/severity.js';
import { localize } from '../../../nls.js';
import { IDialogService } from '../../dialogs/common/dialogs.js';
import { RemoteAgentHostLocationPreference } from './remoteAgentHostLocationPreference.js';

/**
 * Id of the `Chat: Change Preferred Remote Agent Location` command, which
 * lets the user revisit the choice made in {@link promptRemoteAgentHostLocationPreference}.
 *
 * The command itself is registered in the sessions layer (which platform
 * code cannot import), so its id is declared here — the one common module
 * both layers can reach — and the sessions-layer registration should import
 * and reuse this constant instead of duplicating the literal.
 */
export const ChangeRemoteAgentHostLocationPreferenceCommandId = 'workbench.action.sessions.changeRemoteAgentHostLocationPreference';

interface IRemoteAgentHostLocationOption {
	readonly preference: RemoteAgentHostLocationPreference;
	readonly label: string;
	readonly detail: string;
}

/**
 * Appends a localized "(Current)" marker to `detail` when `preference`
 * matches `currentPreference`, so the saved choice is visible and announced
 * regardless of button order (order alone has no accessible "current"
 * semantics). No marker is added when there is no current preference.
 */
function withCurrentPreferenceMarker(detail: string, preference: RemoteAgentHostLocationPreference, currentPreference: RemoteAgentHostLocationPreference | undefined): string {
	return preference === currentPreference
		? detail + localize('remoteAgentHostLocation.current', " (Current)")
		: detail;
}

function remoteAgentHostLocationOptions(productName: string, currentPreference: RemoteAgentHostLocationPreference | undefined): IRemoteAgentHostLocationOption[] {
	return [
		{
			preference: 'dedicated',
			label: localize('remoteAgentHostLocation.dedicated', "Keep My Agents Running in a Dedicated Process"),
			detail: withCurrentPreferenceMarker(localize('remoteAgentHostLocation.dedicated.detail', "Agents continue after you close {0} and stop when their work finishes.", productName), 'dedicated', currentPreference),
		},
		{
			preference: 'editor',
			label: localize('remoteAgentHostLocation.editor', "Stop My Agents if I Close {0}", productName),
			detail: withCurrentPreferenceMarker(localize('remoteAgentHostLocation.editor.detail', "Agents are available only while the remote {0} window is open.", productName), 'editor', currentPreference),
		},
	];
}

/**
 * Order the location options so the host's current preference, if any, is
 * offered first, and mark that option's detail with a localized "(Current)"
 * suffix. Ordering alone communicates nothing to screen readers, so the
 * marker (not position) is what actually conveys the saved preference.
 */
export function orderRemoteAgentHostLocationOptions(productName: string, currentPreference: RemoteAgentHostLocationPreference | undefined): IRemoteAgentHostLocationOption[] {
	const options = remoteAgentHostLocationOptions(productName, currentPreference);
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
 * `productName` (typically {@link IProductService.nameShort}) is substituted
 * into the option copy.
 *
 * `token`, when provided, is forwarded as the dialog's cancellation token so
 * a caller (e.g. an SSH connection cancelled from the main process) can
 * dismiss an open modal programmatically.
 */
export async function promptRemoteAgentHostLocationPreference(
	dialogService: IDialogService,
	hostLabel: string,
	productName: string,
	currentPreference?: RemoteAgentHostLocationPreference,
	token?: CancellationToken,
): Promise<RemoteAgentHostLocationPreference | undefined> {
	const options = orderRemoteAgentHostLocationOptions(productName, currentPreference);

	// The command label is duplicated as a literal (rather than imported)
	// because the command itself is registered in the sessions layer, which
	// this platform module cannot depend on. Bold and linked so the
	// discoverable "you can change this later" reminder stands out; trust is
	// scoped to only this one command via `enabledCommands`.
	const changeCommandLabel = localize('remoteAgentHostLocation.changeCommandLabel', "Chat: Change Preferred Remote Agent Location");
	const changeCommandLink = createMarkdownCommandLink({
		text: changeCommandLabel,
		id: ChangeRemoteAgentHostLocationPreferenceCommandId,
		tooltip: changeCommandLabel,
	});

	const { result } = await dialogService.prompt<RemoteAgentHostLocationPreference>({
		type: Severity.Info,
		message: localize('remoteAgentHostLocation.message', "How long should agents keep running on {0}?", hostLabel),
		detail: new MarkdownString(
			localize('remoteAgentHostLocation.reminder', "You can change this later with the **{0}** command.", changeCommandLink),
			{ isTrusted: { enabledCommands: [ChangeRemoteAgentHostLocationPreferenceCommandId] } },
		),
		cancelButton: true,
		buttons: options.map(option => ({
			label: option.label,
			run: () => option.preference,
		})),
		custom: {
			icon: Codicon.remote,
			buttonDetails: options.map(option => option.detail),
			// Full-width stacked buttons read better for these longer,
			// descriptive two-choice options than the default side-by-side layout.
			alignment: 'vertical',
		},
		token,
	});

	return result;
}
