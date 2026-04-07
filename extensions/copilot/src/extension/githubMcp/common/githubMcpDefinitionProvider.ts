/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { CancellationToken, McpHttpServerDefinition, McpServerDefinitionProvider } from 'vscode';
import { authProviderId, IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { AuthProviderId, ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';

const EnterpriseURLConfig = 'github-enterprise.uri';

export class GitHubMcpDefinitionProvider implements McpServerDefinitionProvider<McpHttpServerDefinition> {

	readonly onDidChangeMcpServerDefinitions: Event<void>;

	private _askedForAuth = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ILogService private readonly logService: ILogService
	) {
		const configurationEvent = Event.chain(configurationService.onDidChangeConfiguration, $ => $
			.filter(e => {
				// If they change the toolsets
				if (e.affectsConfiguration(ConfigKey.GitHubMcpToolsets.fullyQualifiedId)) {
					logService.debug('GitHubMcpDefinitionProvider: Configuration change affects GitHub MCP toolsets.');
					return true;
				}
				// If they change readonly mode
				if (e.affectsConfiguration(ConfigKey.GitHubMcpReadonly.fullyQualifiedId)) {
					logService.debug('GitHubMcpDefinitionProvider: Configuration change affects GitHub MCP readonly mode.');
					return true;
				}
				// If they change lockdown mode
				if (e.affectsConfiguration(ConfigKey.GitHubMcpLockdown.fullyQualifiedId)) {
					logService.debug('GitHubMcpDefinitionProvider: Configuration change affects GitHub MCP lockdown mode.');
					return true;
				}
				// If they change the channel
				if (e.affectsConfiguration(ConfigKey.GitHubMcpChannel.fullyQualifiedId)) {
					logService.debug('GitHubMcpDefinitionProvider: Configuration change affects GitHub MCP channel.');
					return true;
				}
				// If they change to GHE or GitHub.com
				if (e.affectsConfiguration(ConfigKey.Shared.AuthProvider.fullyQualifiedId)) {
					logService.debug('GitHubMcpDefinitionProvider: Configuration change affects GitHub auth provider.');
					return true;
				}
				// If they change the GHE URL
				if (e.affectsConfiguration(EnterpriseURLConfig)) {
					logService.debug('GitHubMcpDefinitionProvider: Configuration change affects GitHub Enterprise URL.');
					return true;
				}
				return false;
			})
			// void event
			.map(() => { })
		);
		let havePermissiveToken = !!this.authenticationService.permissiveGitHubSession;
		const authEvent = Event.chain(this.authenticationService.onDidAuthenticationChange, $ => $
			.filter(() => {
				const hadToken = havePermissiveToken;
				havePermissiveToken = !!this.authenticationService.permissiveGitHubSession;
				return hadToken !== havePermissiveToken;
			})
			.map(() => {
				this.logService.debug(`GitHubMcpDefinitionProvider: Permissive GitHub session availability changed: ${havePermissiveToken}`);
			})
		);
		this.onDidChangeMcpServerDefinitions = Event.any(configurationEvent, authEvent);
	}

	private get toolsets(): string[] {
		return this.configurationService.getConfig<string[]>(ConfigKey.GitHubMcpToolsets);
	}

	private get readonly(): boolean {
		return this.configurationService.getConfig<boolean>(ConfigKey.GitHubMcpReadonly);
	}

	private get lockdown(): boolean {
		return this.configurationService.getConfig<boolean>(ConfigKey.GitHubMcpLockdown);
	}

	private get channel(): ConfigKey.GitHubMcpChannelValue {
		return this.configurationService.getConfig<ConfigKey.GitHubMcpChannelValue>(ConfigKey.GitHubMcpChannel);
	}

	private get gheConfig(): string | undefined {
		return this.configurationService.getNonExtensionConfig<string>(EnterpriseURLConfig);
	}

	private getGheUri(): URI {
		const uri = this.gheConfig;
		if (!uri) {
			throw new Error('GitHub Enterprise URI is not configured.');
		}
		// Prefix with 'copilot-api.'
		const url = URI.parse(uri).with({ path: '/mcp/' });
		return url.with({ authority: `copilot-api.${url.authority}` });
	}

	provideMcpServerDefinitions(): McpHttpServerDefinition[] {
		const providerId = authProviderId(this.configurationService);
		const toolsets = this.toolsets.sort().join(',');
		const readonly = this.readonly;
		const lockdown = this.lockdown;
		const channel = this.channel;
		const isSignedIn = !!this.authenticationService.permissiveGitHubSession;

		const basics = providerId === AuthProviderId.GitHubEnterprise
			? { label: 'GitHub Enterprise', uri: this.getGheUri() }
			: { label: 'GitHub', uri: URI.parse('https://api.githubcopilot.com/mcp/') };

		// Build headers object conditionally
		const headers: Record<string, string> = {};
		// Build version string with toolsets and flags
		let version: string;
		if (isSignedIn) {
			version = toolsets.length ? toolsets : '0';
			if (toolsets.length > 0) {
				headers['X-MCP-Toolsets'] = toolsets;
			}
			if (readonly) {
				headers['X-MCP-Readonly'] = 'true';
				version += '|readonly';
			}
			if (lockdown) {
				headers['X-MCP-Lockdown'] = 'true';
				version += '|lockdown';
			}
			if (channel === 'insiders') {
				headers['X-MCP-Insiders'] = 'true';
				version += '|insiders';
			}
		} else {
			version = 'signedout';
		}
		return [
			{
				...basics,
				headers,
				version
			}
		];
	}

	async resolveMcpServerDefinition(server: McpHttpServerDefinition, token: CancellationToken): Promise<McpHttpServerDefinition> {
		const accessToken = this.authenticationService.permissiveGitHubSession?.accessToken;
		if (accessToken) {
			server.headers['Authorization'] = `Bearer ${accessToken}`;
			return server;
		}

		if (this._askedForAuth) {
			throw new Error('User denied authentication. Cannot connect to GitHub MCP Server.');
		}

		try {
			const session = await this.authenticationService.getGitHubSession('permissive', {
				createIfNone: {
					detail: l10n.t('Additional permissions are required to use GitHub MCP Server'),
				},
			});
			server.headers['Authorization'] = `Bearer ${session.accessToken}`;
			return server;
		} finally {
			this._askedForAuth = true;
		}
	}
}
