/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, env, Uri } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../../../platform/extContext/common/extensionContext';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsNotificationSender } from '../../../lib/src/notificationSender';
import { OutputPaneShowCommand } from '../../../lib/src/snippy/constants';
import { matchNotificationTelemetry, TelemetryActor } from '../../../lib/src/snippy/telemetryHandlers';

const matchCodeMessage =
	'We found a reference to public code in a recent suggestion. To learn more about public code references, review the [documentation](https://aka.ms/github-copilot-match-public-code).';
const MatchAction = 'View reference';
const SettingAction = 'Change setting';
const CodeReferenceKey = 'codeReference.notified';

/**
 * Displays a toast notification when the first code reference is found.
 * The user will only ever see a single notification of this behavior.
 * Displays the output panel on notification ack.
 */
export function notify(accessor: ServicesAccessor) {
	const extension = accessor.get(IVSCodeExtensionContext);
	const instantiationService = accessor.get(IInstantiationService);
	const didNotify = extension.globalState.get<boolean>(CodeReferenceKey);

	if (didNotify) {
		return;
	}

	const notificationSender = accessor.get(ICompletionsNotificationSender);

	const messageItems = [{ title: MatchAction }, { title: SettingAction }];

	void notificationSender.showWarningMessage(matchCodeMessage, ...messageItems).then(async action => {
		const event = { instantiationService, actor: 'user' as TelemetryActor };

		switch (action?.title) {
			case MatchAction: {
				matchNotificationTelemetry.handleDoAction(event);
				await commands.executeCommand(OutputPaneShowCommand);
				break;
			}
			case SettingAction: {
				await env.openExternal(Uri.parse('https://aka.ms/github-copilot-settings'));
				break;
			}
			case undefined: {
				matchNotificationTelemetry.handleDismiss(event);
				break;
			}
		}
	});

	return extension.globalState.update(CodeReferenceKey, true);
}
