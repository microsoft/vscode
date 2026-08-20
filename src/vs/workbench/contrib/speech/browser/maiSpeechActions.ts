/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { AccessibilityVoiceSettingId } from '../common/speechService.js';
import { IMaiSpeechCredentialsService } from './maiSpeechCredentials.js';

/**
 * Reading a response aloud is a chat feature, so setting it up is offered only
 * where chat is. Referenced by name because `contrib/chat` already depends on
 * this component, and importing it back would close the cycle.
 */
const ChatIsEnabled = ContextKeyExpr.has('chatIsEnabled');

/**
 * Asks for the endpoint and key of the speech service that reads text aloud.
 *
 * The key goes to secret storage rather than to a setting, so that it cannot
 * reach a settings file that is shared, synchronized or committed. The endpoint
 * is asked for here too, because its setting is deliberately not listed in the
 * settings editor.
 */
class SetUpReadAloudAction extends Action2 {

	static readonly ID = 'workbench.action.speech.setUpReadAloud';

	constructor() {
		super({
			id: SetUpReadAloudAction.ID,
			title: localize2('setUpReadAloud', "Set Up Read Aloud"),
			category: localize2('speechCategory', "Speech"),
			f1: true,
			precondition: ChatIsEnabled
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const credentialsService = accessor.get(IMaiSpeechCredentialsService);
		const configurationService = accessor.get(IConfigurationService);
		const notificationService = accessor.get(INotificationService);

		const endpoint = await quickInputService.input({
			ignoreFocusLost: true,
			value: configurationService.getValue<string>(AccessibilityVoiceSettingId.MaiSpeechEndpoint) ?? '',
			title: localize('setUpReadAloud.endpointTitle', "Set Up Read Aloud (1 of 2)"),
			prompt: localize('setUpReadAloud.endpointPrompt', "The endpoint of the speech service. The text being read is sent to it."),
			placeHolder: localize('setUpReadAloud.endpointPlaceholder', "https://<region>.tts.speech.microsoft.com"),
			validateInput: async value => {
				const trimmed = value.trim();
				if (!trimmed) {
					return undefined; // empty removes the endpoint again
				}

				try {
					const url = new URL(trimmed);
					const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

					return url.protocol === 'https:' || (isLocal && url.protocol === 'http:')
						? undefined
						: localize('setUpReadAloud.endpointNotHttps', "The endpoint must use HTTPS, because the key is sent with every request.");
				} catch {
					return localize('setUpReadAloud.endpointNotAUrl', "Enter a complete URL, for example https://eastus2.tts.speech.microsoft.com.");
				}
			}
		});

		if (endpoint === undefined) {
			return; // cancelled
		}

		try {
			await configurationService.updateValue(AccessibilityVoiceSettingId.MaiSpeechEndpoint, endpoint.trim() || undefined, ConfigurationTarget.APPLICATION);
		} catch (error) {
			notificationService.error(localize('setUpReadAloud.endpointFailed', "Could not save the endpoint: {0}", toErrorMessage(error)));

			return;
		}

		const key = await quickInputService.input({
			password: true,
			ignoreFocusLost: true,
			title: localize('setUpReadAloud.keyTitle', "Set Up Read Aloud (2 of 2)"),
			prompt: localize('setUpReadAloud.keyPrompt', "The key for that endpoint. It is stored securely and never written to your settings. Leave empty to remove it."),
			placeHolder: localize('setUpReadAloud.keyPlaceholder', "Speech service key")
		});

		if (key === undefined) {
			return; // cancelled
		}

		await credentialsService.setKey(key);
	}
}

registerAction2(SetUpReadAloudAction);
