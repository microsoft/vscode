/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import * as nls from '../../../nls.js';
import { createCommandUri, IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { hasConfigurationVariable } from '../../configuration/common/configurationVariables.js';
import { Emitter } from '../../../base/common/event.js';
import { hasKey, isString } from '../../../base/common/types.js';
import { checkMcpServerAllowed, getMcpServerMatchers, IMcpServerIdentity, IMcpServerMatcher, McpServerAllowResult } from './allowedMcpServers.js';
import { IAllowedMcpServersService, IGalleryMcpServer, IInstallableMcpServer, ILocalMcpServer, mcpAccessConfig, mcpAllowedServersConfig, mcpDeniedServersConfig, McpAccessValue, McpServerConfigurationParseResult, RegistryType } from './mcpManagement.js';
import { McpServerType } from './mcpPlatformTypes.js';
import { COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG } from '../../policy/common/copilotManagedSettings.js';
import { McpServerManifestParser } from './mcpManagementService.js';
import { hasEnvVarReferences } from './envVarResolution.js';

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
		if (hasKey(mcpServer, { config: true })) {
			const config = mcpServer.config;
			return this.isServerAllowedBeforeResolution(config.type === McpServerType.REMOTE
				? { name: mcpServer.name, url: config.url }
				: { name: mcpServer.name, command: [config.command, ...(config.args ?? [])] });
		}

		const parser = new McpServerManifestParser();
		let candidates: McpServerConfigurationParseResult[];
		try {
			candidates = [
				...(mcpServer.configuration.remotes ?? []).map(remote => parser.getMcpServerConfigurationFromManifest({ remotes: [remote] }, RegistryType.REMOTE)),
				...(mcpServer.configuration.packages ?? [])
					.filter(p => [RegistryType.NODE, RegistryType.PYTHON, RegistryType.DOCKER, RegistryType.NUGET].includes(p.registryType))
					.map(p => parser.getMcpServerConfigurationFromManifest({ packages: [p] }, p.registryType)),
			];
		} catch (error) {
			return new MarkdownString().appendText(nls.localize('mcp gallery configuration invalid', "This Model Context Protocol server cannot be installed because its gallery configuration is invalid: {0}", toErrorMessage(error)));
		}
		let result = this.isServerAllowedBeforeResolution({ name: mcpServer.name });
		for (const candidate of candidates) {
			const allowed = this.isAllowed({ name: mcpServer.name, config: candidate.mcpServerConfiguration.config });
			if (allowed === true) {
				return true;
			}
			result = allowed;
		}
		return result;
	}

	isServerAllowedBeforeResolution(identity: IMcpServerIdentity): true | IMarkdownString {
		return this.checkServerAllowed(identity, 'definition');
	}

	isServerAllowed(identity: IMcpServerIdentity): true | IMarkdownString {
		return this.checkServerAllowed(identity, 'resolved');
	}

	getServerPolicyVariableValues(): readonly string[] {
		const { allowlist, denylist } = this.getPolicyLists();
		return [...new Set([...(allowlist ?? []), ...(denylist ?? [])].flatMap(matcher =>
			[...(matcher.serverCommand ?? []), ...(matcher.serverUrl !== undefined ? [matcher.serverUrl] : [])]
				.filter(value => hasEnvVarReferences(value))))];
	}

	private getPolicyLists(): { allowlist: readonly IMcpServerMatcher[] | undefined; denylist: readonly IMcpServerMatcher[] | undefined } {
		const managedOnly = this.configurationService.getValue<boolean>(COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG) === true;
		return {
			allowlist: managedOnly
				? getMcpServerMatchers(this.configurationService.inspect<readonly IMcpServerMatcher[]>(mcpAllowedServersConfig).policyValue) ?? []
				: getMcpServerMatchers(this.configurationService.getValue(mcpAllowedServersConfig)),
			denylist: managedOnly
				? this.getAllConfiguredMatchers(mcpDeniedServersConfig)
				: getMcpServerMatchers(this.configurationService.getValue(mcpDeniedServersConfig)),
		};
	}

	private checkServerAllowed(identity: IMcpServerIdentity, phase: 'definition' | 'resolved'): true | IMarkdownString {
		if (this.configurationService.getValue(mcpAccessConfig) === McpAccessValue.None) {
			const settingsCommandLink = createCommandUri('workbench.action.openSettings', { query: `@id:${mcpAccessConfig}` }).toString();
			return new MarkdownString(nls.localize('mcp servers are not allowed', "Model Context Protocol servers are disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink));
		}

		const { allowlist, denylist } = this.getPolicyLists();
		const unresolvedPolicy = [...(allowlist ?? []), ...(denylist ?? [])].some(matcher =>
			[...(matcher.serverCommand ?? []), ...(matcher.serverUrl !== undefined ? [matcher.serverUrl] : [])]
				.some(value => hasEnvVarReferences(value) && identity.policyValues?.[value] === undefined));
		if (phase === 'resolved' && unresolvedPolicy) {
			return new MarkdownString(nls.localize('mcp policy environment unresolved', "This Model Context Protocol server cannot run because its policy environment variables have not been resolved on the server host. Restart the server to try again."));
		}
		const result = phase === 'definition'
			? this.checkServerAllowedBeforeResolution(allowlist, denylist, identity, unresolvedPolicy)
			: checkMcpServerAllowed(allowlist, denylist, identity);
		switch (result) {
			case McpServerAllowResult.Denied:
				return new MarkdownString(nls.localize('mcp server is denied', "This Model Context Protocol server is blocked by your organization's policy. Please contact your administrator for more information."));
			case McpServerAllowResult.NotAllowed:
				if (allowlist?.some(matcher => matcher.serverName === identity.name)) {
					if (identity.url !== undefined) {
						return new MarkdownString(nls.localize('mcp server name overridden by url', "This Model Context Protocol server is not in the list of servers allowed by your organization. A name entry matches, but this allowlist contains URL entries, so the server must match an allowed URL. Please contact your administrator for more information."));
					}
					if (identity.command !== undefined) {
						return new MarkdownString(nls.localize('mcp server name overridden by command', "This Model Context Protocol server is not in the list of servers allowed by your organization. A name entry matches, but this allowlist contains command entries, so the server must match an allowed command and arguments. Please contact your administrator for more information."));
					}
				}
				return new MarkdownString(nls.localize('mcp server not in allowlist', "This Model Context Protocol server is not in the list of servers allowed by your organization. Please contact your administrator for more information."));
		}

		return true;
	}

	private checkServerAllowedBeforeResolution(allowlist: readonly IMcpServerMatcher[] | undefined, denylist: readonly IMcpServerMatcher[] | undefined, identity: IMcpServerIdentity, unresolvedPolicy: boolean): McpServerAllowResult {
		const unresolvedUrl = identity.url !== undefined && (hasConfigurationVariable(identity.url) || unresolvedPolicy);
		const unresolvedCommand = identity.command !== undefined && (identity.command.some(hasConfigurationVariable) || unresolvedPolicy);
		if (!unresolvedUrl && !unresolvedCommand) {
			return checkMcpServerAllowed(allowlist, denylist, identity);
		}

		const knownIdentity: IMcpServerIdentity = {
			name: identity.name,
			url: unresolvedUrl ? undefined : identity.url,
			command: unresolvedCommand ? undefined : identity.command,
			policyValues: identity.policyValues,
		};
		if (checkMcpServerAllowed(undefined, denylist, knownIdentity) === McpServerAllowResult.Denied) {
			return McpServerAllowResult.Denied;
		}
		if (allowlist?.some(matcher =>
			(unresolvedUrl && isString(matcher.serverUrl)) || (unresolvedCommand && Array.isArray(matcher.serverCommand)))) {
			return McpServerAllowResult.Allowed;
		}
		return checkMcpServerAllowed(allowlist, undefined, knownIdentity);
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

}
