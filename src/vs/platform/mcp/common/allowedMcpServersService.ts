/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';
import { createCommandUri, IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { hasConfigurationVariable } from '../../configuration/common/configurationVariables.js';
import { Emitter } from '../../../base/common/event.js';
import { hasKey, isString } from '../../../base/common/types.js';
import { checkMcpServerAllowed, getMcpServerMatchers, IMcpServerIdentity, IMcpServerMatcher, McpServerAllowResult } from './allowedMcpServers.js';
import { IAllowedMcpServersService, IGalleryMcpServer, IInstallableMcpServer, ILocalMcpServer, mcpAccessConfig, mcpAllowedServersConfig, mcpDeniedServersConfig, McpAccessValue, replaceMcpServerVariableReferences } from './mcpManagement.js';
import { McpServerType } from './mcpPlatformTypes.js';
import { COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG } from '../../policy/common/copilotManagedSettings.js';

export class AllowedMcpServersService extends Disposable implements IAllowedMcpServersService {

	_serviceBrand: undefined;

	private _onDidChangeAllowedMcpServers = this._register(new Emitter<void>());
	readonly onDidChangeAllowedMcpServers = this._onDidChangeAllowedMcpServers.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpAccessConfig) || e.affectsConfiguration(mcpAllowedServersConfig) || e.affectsConfiguration(mcpDeniedServersConfig) || e.affectsConfiguration(COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG)) {
				this._onDidChangeAllowedMcpServers.fire();
			}
		}));
	}

	isAllowed(mcpServer: IGalleryMcpServer | ILocalMcpServer | IInstallableMcpServer): true | IMarkdownString {
		return this.isServerAllowedBeforeResolution(this.toIdentity(mcpServer));
	}

	isServerAllowedBeforeResolution(identity: IMcpServerIdentity): true | IMarkdownString {
		return this.checkServerAllowed(identity, 'definition');
	}

	isServerAllowed(identity: IMcpServerIdentity): true | IMarkdownString {
		return this.checkServerAllowed(identity, 'resolved');
	}

	private checkServerAllowed(identity: IMcpServerIdentity, phase: 'definition' | 'resolved'): true | IMarkdownString {
		if (this.configurationService.getValue(mcpAccessConfig) === McpAccessValue.None) {
			const settingsCommandLink = createCommandUri('workbench.action.openSettings', { query: `@id:${mcpAccessConfig}` }).toString();
			return new MarkdownString(nls.localize('mcp servers are not allowed', "Model Context Protocol servers are disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink));
		}

		const managedOnly = this.configurationService.getValue<boolean>(COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG) === true;
		const allowlist = managedOnly
			? getMcpServerMatchers(this.configurationService.inspect<readonly IMcpServerMatcher[]>(mcpAllowedServersConfig).policyValue) ?? []
			: getMcpServerMatchers(this.configurationService.getValue(mcpAllowedServersConfig));
		const denylist = managedOnly
			? this.getAllConfiguredMatchers(mcpDeniedServersConfig)
			: getMcpServerMatchers(this.configurationService.getValue(mcpDeniedServersConfig));
		const result = phase === 'definition'
			? this.checkServerAllowedBeforeResolution(allowlist, denylist, identity)
			: checkMcpServerAllowed(allowlist, denylist, identity);
		switch (result) {
			case McpServerAllowResult.Denied:
				return new MarkdownString(nls.localize('mcp server is denied', "This Model Context Protocol server is blocked by your organization's policy. Please contact your administrator for more information."));
			case McpServerAllowResult.NotAllowed:
				return new MarkdownString(nls.localize('mcp server not in allowlist', "This Model Context Protocol server is not in the list of servers allowed by your organization. Please contact your administrator for more information."));
		}

		return true;
	}

	private checkServerAllowedBeforeResolution(allowlist: readonly IMcpServerMatcher[] | undefined, denylist: readonly IMcpServerMatcher[] | undefined, identity: IMcpServerIdentity): McpServerAllowResult {
		const unresolvedUrl = identity.url !== undefined && hasConfigurationVariable(identity.url);
		const unresolvedCommand = identity.command?.some(hasConfigurationVariable) ?? false;
		if (!unresolvedUrl && !unresolvedCommand) {
			return checkMcpServerAllowed(allowlist, denylist, identity);
		}

		const knownIdentity: IMcpServerIdentity = {
			name: identity.name,
			url: unresolvedUrl ? undefined : identity.url,
			command: unresolvedCommand ? undefined : identity.command,
		};
		if (checkMcpServerAllowed(undefined, denylist, knownIdentity) === McpServerAllowResult.Denied) {
			return McpServerAllowResult.Denied;
		}
		if (allowlist === undefined || checkMcpServerAllowed(allowlist, undefined, knownIdentity) === McpServerAllowResult.Allowed) {
			return McpServerAllowResult.Allowed;
		}

		return allowlist.some(matcher =>
			(unresolvedUrl && isString(matcher.serverUrl)) || (unresolvedCommand && Array.isArray(matcher.serverCommand)))
			? McpServerAllowResult.Allowed
			: McpServerAllowResult.NotAllowed;
	}

	private getAllConfiguredMatchers(key: string): IMcpServerMatcher[] {
		const inspected = this.configurationService.inspect<readonly IMcpServerMatcher[]>(key);
		return [
			inspected.applicationValue,
			inspected.userValue,
			inspected.userLocalValue,
			inspected.userRemoteValue,
			inspected.workspaceValue,
			inspected.workspaceFolderValue,
			inspected.memoryValue,
			inspected.policyValue,
		].flatMap(value => getMcpServerMatchers(value) ?? []);
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
		const remote = mcpServer.configuration.remotes?.[0];
		return { name: mcpServer.name, url: remote ? replaceMcpServerVariableReferences(remote.url, remote.variables) : undefined };
	}
}
