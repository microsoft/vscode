/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IClaudeConfigurationService } from './claudeConfigurationService.js';
import { IClaudeApiClient } from '../common/claudeApiClient.js';
import { Categories } from '../../../common/actions.js';

class ConfigureClaudeApiKeyAction extends Action2 {
	static readonly ID = 'claude.configureApiKey';
	static readonly LABEL = localize('claude.configureApiKey', 'Configure Claude API Key');

	constructor() {
		super({
			id: ConfigureClaudeApiKeyAction.ID,
			title: ConfigureClaudeApiKeyAction.LABEL,
			category: Categories.Help,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const claudeConfigService = accessor.get(IClaudeConfigurationService);

		const currentConfig = claudeConfigService.getConfiguration();

		const apiKey = await quickInputService.input({
			title: localize('claude.enterApiKey', 'Enter Claude API Key'),
			prompt: localize('claude.apiKeyPrompt', 'Enter your Claude API key from console.anthropic.com'),
			value: currentConfig.apiKey ? '••••••••••••••••' : '',
			password: true,
			validateInput: (value) => {
				if (!value || value === '••••••••••••••••') {
					return localize('claude.apiKeyRequired', 'API key is required');
				}
				if (!value.startsWith('sk-ant-')) {
					return localize('claude.invalidApiKey', 'Invalid API key format. Claude API keys start with "sk-ant-"');
				}
				return undefined;
			}
		});

		if (apiKey && apiKey !== '••••••••••••••••') {
			try {
				await claudeConfigService.updateConfiguration({ apiKey });
				notificationService.info(localize('claude.apiKeyConfigured', 'Claude API key configured successfully'));
			} catch (error) {
				notificationService.error(localize('claude.configurationError', 'Failed to configure Claude API key: {0}', String(error)));
			}
		}
	}
}

class TestClaudeConnectionAction extends Action2 {
	static readonly ID = 'claude.testConnection';
	static readonly LABEL = localize('claude.testConnection', 'Test Claude Connection');

	constructor() {
		super({
			id: TestClaudeConnectionAction.ID,
			title: TestClaudeConnectionAction.LABEL,
			category: Categories.Help,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		const claudeApiClient = accessor.get(IClaudeApiClient);

		if (!claudeApiClient.isConfigured()) {
			notificationService.warn(localize('claude.notConfigured', 'Claude is not configured. Please set your API key first.'));
			return;
		}

		try {
			const notification = notificationService.notify({
				severity: 'info',
				message: localize('claude.testingConnection', 'Testing Claude connection...'),
				progress: {
					infinite: true
				}
			});

			const isConnected = await claudeApiClient.testConnection();
			notification.close();

			if (isConnected) {
				notificationService.info(localize('claude.connectionSuccess', 'Claude connection test successful!'));
			} else {
				notificationService.error(localize('claude.connectionFailed', 'Claude connection test failed. Please check your API key and internet connection.'));
			}
		} catch (error) {
			notificationService.error(localize('claude.connectionError', 'Error testing Claude connection: {0}', String(error)));
		}
	}
}

registerAction2(ConfigureClaudeApiKeyAction);
registerAction2(TestClaudeConnectionAction);
