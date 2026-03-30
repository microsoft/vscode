/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IRemoteAgentHostService, parseRemoteAgentHostInput, RemoteAgentHostInputValidationError, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.remoteAgentHost.add',
			title: localize2('addRemoteAgentHost', "Add Remote Agent Host..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		// Prompt for address
		const address = await quickInputService.input({
			title: localize('addRemoteTitle', "Add Remote Agent Host"),
			prompt: localize('addRemotePrompt', "Paste a host, host:port, or WebSocket URL. Example: {0}", 'ws://127.0.0.1:8089'),
			placeHolder: 'ws://127.0.0.1:8080?tkn=abc-123',
			ignoreFocusLost: true,
			validateInput: async value => {
				const result = parseRemoteAgentHostInput(value);
				if (result.error === RemoteAgentHostInputValidationError.Empty) {
					return localize('addRemoteValidationEmpty', "Enter a remote agent host address.");
				}
				if (result.error === RemoteAgentHostInputValidationError.Invalid) {
					return localize('addRemoteValidationInvalid', "Enter a valid host, host:port, or WebSocket URL.");
				}
				return undefined;
			},
		});
		if (!address) {
			return;
		}
		const parsed = parseRemoteAgentHostInput(address);
		if (!parsed.parsed) {
			return;
		}

		// Prompt for display name
		const defaultName = parsed.parsed.suggestedName;
		const name = await quickInputService.input({
			title: localize('nameRemoteTitle', "Name Remote Agent Host"),
			prompt: localize('nameRemotePrompt', "Enter a display name for this remote agent host."),
			placeHolder: localize('nameRemotePlaceholder', "My Remote"),
			value: defaultName,
			valueSelection: [0, defaultName.length],
			ignoreFocusLost: true,
			validateInput: async value => value.trim() ? undefined : localize('nameRemoteValidationEmpty', "Enter a name for this remote agent host."),
		});
		if (!name?.trim()) {
			return;
		}

		// Connect
		try {
			await remoteAgentHostService.addRemoteAgentHost({
				address: parsed.parsed.address,
				name: name.trim(),
				connectionToken: parsed.parsed.connectionToken,
			});
		} catch {
			notificationService.error(localize('addRemoteFailed', "Failed to connect to remote agent host {0}.", parsed.parsed.address));
		}
	}
});
