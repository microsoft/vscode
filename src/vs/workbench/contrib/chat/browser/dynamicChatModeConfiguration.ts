/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { IConfigurationNode, IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatModeService } from '../common/chatModes.js';
import { ChatConfiguration, ChatModeKind } from '../common/constants.js';

export class DynamicChatModeConfiguration extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.dynamicChatModeConfiguration';

	private readonly configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	private currentConfigurationNode: IConfigurationNode | undefined;

	constructor(
		@IChatModeService private readonly chatModeService: IChatModeService
	) {
		super();

		// Initial configuration setup
		this.updateConfiguration();

		// Listen for chat mode changes and update configuration
		this._register(this.chatModeService.onDidChangeChatModes(() => {
			this.updateConfiguration();
		}));
	}

	private updateConfiguration(): void {
		// Remove the existing configuration if it exists
		if (this.currentConfigurationNode) {
			this.configurationRegistry.deregisterConfigurations([this.currentConfigurationNode]);
		}

		// Generate new enum values and descriptions
		const modes = this.chatModeService.getModes();
		const enumValues: string[] = [];
		const enumDescriptions: string[] = [];

		// Add built-in modes
		for (const mode of modes.builtin) {
			enumValues.push(mode.id);
			enumDescriptions.push(mode.description.get());
		}

		// Add custom modes
		for (const mode of modes.custom) {
			enumValues.push(mode.id);
			enumDescriptions.push(mode.description.get());
		}

		// Create new configuration node
		this.currentConfigurationNode = {
			id: 'chatDefaultMode',
			title: nls.localize('chatDefaultModeConfigurationTitle', "Chat Default Mode"),
			type: 'object',
			properties: {
				[ChatConfiguration.DefaultChatMode]: {
					type: 'string',
					description: nls.localize('chat.defaultMode', "Controls the default chat mode for new chat sessions. If the configured mode becomes unavailable, the chat will fall back to Ask mode."),
					default: ChatModeKind.Ask,
					enum: enumValues,
					enumDescriptions: enumDescriptions,
					scope: 'application'
				}
			}
		};

		// Register the new configuration
		this.configurationRegistry.registerConfiguration(this.currentConfigurationNode);
	}

	override dispose(): void {
		if (this.currentConfigurationNode) {
			this.configurationRegistry.deregisterConfigurations([this.currentConfigurationNode]);
			this.currentConfigurationNode = undefined;
		}
		super.dispose();
	}
}