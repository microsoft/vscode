/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { AuthenticationSession, CancellationToken, McpHttpServerDefinition, McpServerDefinitionProvider } from 'vscode';
import { authProviderId, IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { resolveGitHubSessionUri } from '../../../platform/authentication/common/enterprise';
import { AuthProviderId, ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';

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
				return false;
			})
			// void event
			.map(() => { })
		);
		let havePermissiveToken = !!this.authenticationService.permissiveGitHubSession;
		let authorizationServer = this.authenticationService.anyGitHubSession?.authorizationServer?.toString();
		const authEvent = Event.chain(this.authenticationService.onDidAuthenticationChange, $ => $
			.filter(() => {
				const hadToken = havePermissiveToken;
				const previousAuthorizationServer = authorizationServer;
				havePermissiveToken = !!this.authenticationService.permissiveGitHubSession;
				authorizationServer = this.authenticationService.anyGitHubSession?.authorizationServer?.toString();
				return hadToken !== havePermissiveToken
					|| (authProviderId(this.configurationService) === AuthProviderId.GitHubEnterprise && previousAuthorizationServer !== authorizationServer);
			})
			.map(() => {
				this.logService.debug('GitHubMcpDefinitionProvider: GitHub authorization server or permissions changed.');
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

	private getServerUri(session: AuthenticationSession | undefined): URI {
		const providerId = authProviderId(this.configurationService);
		const uri = session ? resolveGitHubSessionUri(session, providerId) : undefined;
		if (providerId === AuthProviderId.GitHub) {
			return URI.parse('https://api.githubcopilot.com/mcp/');
		}
		if (!uri) {
			throw new Error(l10n.t('GitHub Enterprise authentication has not selected a server.'));
		}
		return uri.with({ authority: `copilot-api.${uri.authority}`, path: '/mcp/' });
	}

	provideMcpServerDefinitions(): McpHttpServerDefinition[] {
		const providerId = authProviderId(this.configurationService);
		const toolsets = this.toolsets.sort().join(',');
		const readonly = this.readonly;
		const lockdown = this.lockdown;
		const channel = this.channel;
		const isSignedIn = !!this.authenticationService.permissiveGitHubSession;
		const session = this.authenticationService.anyGitHubSession;
		if (providerId === AuthProviderId.GitHubEnterprise && !session) {
			return [];
		}

		const basics = {
			label: providerId === AuthProviderId.GitHubEnterprise ? 'GitHub Enterprise' : 'GitHub',
			uri: this.getServerUri(session),
		};

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
		if (providerId === AuthProviderId.GitHubEnterprise && session?.authorizationServer) {
			version += `|issuer=${encodeURIComponent(session.authorizationServer.toString())}`;
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
		const selected = this.authenticationService.anyGitHubSession;
		this.assertCurrentDefinition(server, selected);
		let session = this.authenticationService.permissiveGitHubSession;
		if (selected && session && selected.authorizationServer?.toString() !== session.authorizationServer?.toString()) {
			session = undefined;
		}

		if (!session) {
			if (this._askedForAuth) {
				throw new Error('User denied authentication. Cannot connect to GitHub MCP Server.');
			}
			try {
				session = await this.authenticationService.getGitHubSession('permissive', {
					createIfNone: {
						detail: l10n.t('Additional permissions are required to use GitHub MCP Server'),
					},
					authorizationServer: selected?.authorizationServer,
				});
			} finally {
				this._askedForAuth = true;
			}
		}
		this.assertCurrentDefinition(server, session);
		this.assertCurrentDefinition(server, this.authenticationService.anyGitHubSession);
		server.headers['Authorization'] = `Bearer ${session.accessToken}`;
		return server;
	}

	private assertCurrentDefinition(server: McpHttpServerDefinition, session: AuthenticationSession | undefined): void {
		const enterprise = authProviderId(this.configurationService) === AuthProviderId.GitHubEnterprise;
		const uri = this.getServerUri(session);
		const issuer = session?.authorizationServer;
		if (server.uri.toString() !== uri.toString() || (enterprise && (!issuer || !server.version?.endsWith(`|issuer=${encodeURIComponent(issuer.toString())}`)))) {
			throw new Error(l10n.t('The GitHub authorization server changed. Refresh the GitHub MCP server definition.'));
		}
	}
}
