/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ProxyChannel, type IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import type { IAgentHostManagementService } from './agentService.js';

/** VS Code IPC on the authenticated host endpoint, separate from AHP. */
export const agentHostManagementProtocol = 'vscode-agent-host-management';
export const agentHostCustomizationManagementChannelName = 'agentHostCustomizationManagement';
export const agentHostPluginManagementHeader = 'x-vscode-agent-host-plugin-management';

export type IAgentHostCustomizationManagementService = Pick<IAgentHostManagementService,
	| 'installPlugin'
	| 'listPluginInstallations'
	| 'uninstallPlugin'
	| 'setPluginEnabled'
	| 'listPluginMarketplaces'
	| 'addPluginMarketplace'
	| 'browsePluginMarketplace'
	| 'removePluginMarketplace'
	| 'refreshPluginMarketplaces'
>;

export function isAgentHostCustomizationManagementCommand(command: string): command is keyof IAgentHostCustomizationManagementService {
	switch (command) {
		case 'installPlugin':
		case 'listPluginInstallations':
		case 'uninstallPlugin':
		case 'setPluginEnabled':
		case 'listPluginMarketplaces':
		case 'addPluginMarketplace':
		case 'browsePluginMarketplace':
		case 'removePluginMarketplace':
		case 'refreshPluginMarketplaces':
			return true;
		default:
			return false;
	}
}

export function createAgentHostCustomizationManagementChannel(service: IAgentHostCustomizationManagementService, store: DisposableStore): IServerChannel {
	const channel = ProxyChannel.fromService(service, store);
	return {
		call: (context, command, args: unknown) => {
			if (!isAgentHostCustomizationManagementCommand(command) || !Array.isArray(args)) {
				throw new Error(`Invalid customization management call: ${command}`);
			}
			return channel.call(context, command, args);
		},
		listen: (_context, event) => {
			throw new Error(`Invalid customization management event: ${event}`);
		},
	};
}
