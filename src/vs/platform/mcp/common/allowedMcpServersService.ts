/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';
import { createCommandUri, IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Emitter } from '../../../base/common/event.js';
import { hasKey } from '../../../base/common/types.js';
import { checkMcpServerAllowed, getMcpServerMatchers, IMcpServerIdentity, McpServerAllowResult } from './allowedMcpServers.js';
import { IAllowedMcpServersService, IGalleryMcpServer, IInstallableMcpServer, ILocalMcpServer, mcpAccessConfig, mcpAllowedServersConfig, mcpDeniedServersConfig, McpAccessValue } from './mcpManagement.js';
import { McpServerType } from './mcpPlatformTypes.js';

export class AllowedMcpServersService extends Disposable implements IAllowedMcpServersService {

	_serviceBrand: undefined;

	private _onDidChangeAllowedMcpServers = this._register(new Emitter<void>());
	readonly onDidChangeAllowedMcpServers = this._onDidChangeAllowedMcpServers.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpAccessConfig) || e.affectsConfiguration(mcpAllowedServersConfig) || e.affectsConfiguration(mcpDeniedServersConfig)) {
				this._onDidChangeAllowedMcpServers.fire();
			}
		}));
	}

	isAllowed(mcpServer: IGalleryMcpServer | ILocalMcpServer | IInstallableMcpServer): true | IMarkdownString {
		return this.isServerAllowed(this.toIdentity(mcpServer));
	}

	isServerAllowed(identity: IMcpServerIdentity): true | IMarkdownString {
		if (this.configurationService.getValue(mcpAccessConfig) === McpAccessValue.None) {
			const settingsCommandLink = createCommandUri('workbench.action.openSettings', { query: `@id:${mcpAccessConfig}` }).toString();
			return new MarkdownString(nls.localize('mcp servers are not allowed', "Model Context Protocol servers are disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink));
		}

		const allowlist = getMcpServerMatchers(this.configurationService.getValue(mcpAllowedServersConfig));
		const denylist = getMcpServerMatchers(this.configurationService.getValue(mcpDeniedServersConfig));
		switch (checkMcpServerAllowed(allowlist, denylist, identity)) {
			case McpServerAllowResult.Denied:
				return new MarkdownString(nls.localize('mcp server is denied', "This Model Context Protocol server is blocked by your organization's policy. Please contact your administrator for more information."));
			case McpServerAllowResult.NotAllowed:
				return new MarkdownString(nls.localize('mcp server not in allowlist', "This Model Context Protocol server is not in the list of servers allowed by your organization. Please contact your administrator for more information."));
		}

		return true;
	}

	private toIdentity(mcpServer: IGalleryMcpServer | ILocalMcpServer | IInstallableMcpServer): IMcpServerIdentity {
		if (hasKey(mcpServer, { config: true })) {
			const config = mcpServer.config;
			if (config.type === McpServerType.REMOTE) {
				return { name: mcpServer.name, url: config.url };
			}
			return { name: mcpServer.name, command: [config.command, ...(config.args ?? [])] };
		}

		// Gallery server: match by name or a remote URL; the local command invocation is only
		// known once the server is installed with a resolved configuration.
		return { name: mcpServer.name, url: mcpServer.configuration.remotes?.[0]?.url };
	}
}
