/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IRemoteAgentHostService, parseRemoteAgentHostInput, RemoteAgentHostEntryType, RemoteAgentHostInputValidationError, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService, SSHAuthMethod, type ISSHAgentHostConfig, type ISSHAgentHostConnection, type ISSHResolvedConfig } from '../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX, type ITunnelInfo } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { SessionsCategories } from '../../../common/categories.js';
import { Menus } from '../../../browser/menus.js';
import { NewChatViewPane, SessionsViewId } from '../../chat/browser/newChatViewPane.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.remoteAgentHost.add',
			title: localize2('addRemoteAgentHost', "Add Remote Agent Host..."),
			category: SessionsCategories.Sessions,
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
				name: name.trim(),
				connectionToken: parsed.parsed.connectionToken,
				connection: {
					type: RemoteAgentHostEntryType.WebSocket,
					address: parsed.parsed.address,
				},
			});
		} catch {
			notificationService.error(localize('addRemoteFailed', "Failed to connect to remote agent host {0}.", parsed.parsed.address));
		}
	}
});

// ---- Connect via SSH -------------------------------------------------------

interface ISSHAuthMethodPickItem extends IQuickPickItem {
	readonly method: SSHAuthMethod;
}

interface ISSHHostPickItem extends IQuickPickItem {
	readonly hostAlias?: string;
}

async function promptToConnectViaSSH(
	accessor: ServicesAccessor,
): Promise<void> {
	const sshService = accessor.get(ISSHRemoteAgentHostService);
	const quickInputService = accessor.get(IQuickInputService);
	const notificationService = accessor.get(INotificationService);
	const instantiationService = accessor.get(IInstantiationService);

	let host: string;
	let username: string | undefined;
	let port: number | undefined;
	let resolvedConfig: ISSHResolvedConfig | undefined;
	let suggestedName: string | undefined;
	let defaultAuthMethod: SSHAuthMethod | undefined;
	let defaultKeyPath: string | undefined;

	const configHosts = await sshService.listSSHConfigHosts().catch(() => [] as string[]);
	if (configHosts.length > 0) {
		const hostPicks: ISSHHostPickItem[] = configHosts.map(h => ({
			label: h,
			hostAlias: h,
		}));
		hostPicks.push({
			label: localize('sshEnterManually', "Enter Manually..."),
			description: localize('sshEnterManuallyDesc', "Type in host, username, and port"),
		});

		const picked = await quickInputService.pick(hostPicks, {
			title: localize('sshHostTitle', "Connect via SSH"),
			placeHolder: localize('sshPickHostPlaceholder', "Select an SSH host or enter manually"),
		});
		if (!picked) {
			return;
		}

		if (picked.hostAlias) {
			try {
				resolvedConfig = await sshService.resolveSSHConfig(picked.hostAlias);
			} catch (err) {
				notificationService.error(localize('sshResolveConfigFailed', "Failed to resolve SSH config for {0}: {1}", picked.hostAlias, String(err)));
				return;
			}

			host = resolvedConfig.hostname;
			username = resolvedConfig.user;
			port = resolvedConfig.port !== 22 ? resolvedConfig.port : undefined;
			suggestedName = picked.hostAlias;

			// Determine auth method from resolved config.
			// Always prefer Agent auth (the SSH agent may already have the key
			// loaded). Record a non-default IdentityFile as a fallback path for
			// the manual picker only.
			if (resolvedConfig.identityFile.length > 0) {
				const firstKey = resolvedConfig.identityFile[0];
				const defaultKeys = ['~/.ssh/id_rsa', '~/.ssh/id_ecdsa', '~/.ssh/id_ed25519', '~/.ssh/id_dsa', '~/.ssh/id_xmss'];
				if (!defaultKeys.includes(firstKey)) {
					defaultKeyPath = firstKey;
				}
			}
			// Default to SSH agent
			if (!defaultAuthMethod) {
				defaultAuthMethod = SSHAuthMethod.Agent;
			}

			// Config host has enough info — connect directly, skip all prompts
			if (username) {
				const config: ISSHAgentHostConfig = {
					host,
					port,
					username,
					authMethod: defaultAuthMethod,
					privateKeyPath: defaultKeyPath,
					agentForward: resolvedConfig.forwardAgent || undefined,
					name: suggestedName,
					sshConfigHost: picked.hostAlias,
				};
				const connection = await instantiationService.invokeFunction(accessor =>
					connectWithProgress(accessor, config, suggestedName!)
				);
				if (connection) {
					await instantiationService.invokeFunction(accessor => promptForRemoteFolder(accessor, connection));
				}
				return;
			}
		} else {
			const manualResult = await promptForManualHost(quickInputService);
			if (!manualResult) {
				return;
			}
			host = manualResult.host;
			username = manualResult.username;
			port = manualResult.port;
		}
	} else {
		const manualResult = await promptForManualHost(quickInputService);
		if (!manualResult) {
			return;
		}
		host = manualResult.host;
		username = manualResult.username;
		port = manualResult.port;
	}

	if (!username) {
		const usernameInput = await quickInputService.input({
			title: localize('sshUsernameTitle', "SSH Username"),
			prompt: localize('sshUsernamePrompt', "Enter the username for {0}.", host),
			placeHolder: 'root',
			ignoreFocusLost: true,
			validateInput: async value => value.trim() ? undefined : localize('sshUsernameEmpty', "Enter a username."),
		});
		if (!usernameInput) {
			return;
		}
		username = usernameInput.trim();
	}

	const authPicks: ISSHAuthMethodPickItem[] = [
		{
			method: SSHAuthMethod.Agent,
			label: localize('sshAuthAgent', "SSH Agent"),
			description: localize('sshAuthAgentDesc', "Use the running SSH agent for authentication"),
		},
		{
			method: SSHAuthMethod.KeyFile,
			label: localize('sshAuthKey', "Private Key File"),
			description: localize('sshAuthKeyDesc', "Authenticate with a private key file"),
		},
		{
			method: SSHAuthMethod.Password,
			label: localize('sshAuthPassword', "Password"),
			description: localize('sshAuthPasswordDesc', "Authenticate with a password"),
		},
	];

	let authMethod: SSHAuthMethod;
	if (defaultAuthMethod) {
		authMethod = defaultAuthMethod;
	} else {
		const authPicked = await quickInputService.pick(authPicks, {
			title: localize('sshAuthTitle', "Authentication Method"),
			placeHolder: localize('sshAuthPlaceholder', "Choose how to authenticate with {0}", host),
		});
		if (!authPicked) {
			return;
		}
		authMethod = authPicked.method;
	}

	let privateKeyPath: string | undefined;
	let password: string | undefined;

	if (authMethod === SSHAuthMethod.KeyFile) {
		const keyPath = await quickInputService.input({
			title: localize('sshKeyTitle', "Private Key Path"),
			prompt: localize('sshKeyPrompt', "Enter the path to your SSH private key."),
			placeHolder: '~/.ssh/id_rsa',
			value: defaultKeyPath ?? '~/.ssh/id_rsa',
			ignoreFocusLost: true,
			validateInput: async value => value.trim() ? undefined : localize('sshKeyEmpty', "Enter a key file path."),
		});
		if (!keyPath) {
			return;
		}
		privateKeyPath = keyPath.trim();
	} else if (authMethod === SSHAuthMethod.Password) {
		const pw = await quickInputService.input({
			title: localize('sshPasswordTitle', "SSH Password"),
			prompt: localize('sshPasswordPrompt', "Enter the password for {0}@{1}.", username, host),
			password: true,
			ignoreFocusLost: true,
			validateInput: async value => value ? undefined : localize('sshPasswordEmpty', "Enter a password."),
		});
		if (!pw) {
			return;
		}
		password = pw;
	}

	const defaultName = suggestedName ?? `${username}@${host}`;
	const name = await quickInputService.input({
		title: localize('sshNameTitle', "Name Remote"),
		prompt: localize('sshNamePrompt', "Enter a display name for this SSH remote."),
		placeHolder: localize('sshNamePlaceholder', "My Remote"),
		value: defaultName,
		valueSelection: [0, defaultName.length],
		ignoreFocusLost: true,
		validateInput: async value => value.trim() ? undefined : localize('sshNameEmpty', "Enter a name."),
	});
	if (!name) {
		return;
	}

	const config: ISSHAgentHostConfig = {
		host,
		port,
		username,
		authMethod,
		privateKeyPath,
		password,
		name: name.trim(),
	};

	const connection = await instantiationService.invokeFunction(accessor =>
		connectWithProgress(accessor, config, host)
	);
	if (connection) {
		await instantiationService.invokeFunction(accessor => promptForRemoteFolder(accessor, connection));
	}
}

async function connectWithProgress(
	accessor: ServicesAccessor,
	config: ISSHAgentHostConfig,
	displayHost: string,
): Promise<ISSHAgentHostConnection | undefined> {
	const sshService = accessor.get(ISSHRemoteAgentHostService);
	const notificationService = accessor.get(INotificationService);

	const handle = notificationService.notify({
		severity: Severity.Info,
		message: localize('sshConnecting', "Connecting to {0} via SSH...", displayHost),
		progress: { infinite: true },
	});

	// Build the expected connection key to filter progress events.
	// Must match the key logic in the shared process service.
	const expectedKey = config.sshConfigHost
		? `ssh:${config.sshConfigHost}`
		: `${config.username}@${config.host}:${config.port ?? 22}`;

	const progressListener = sshService.onDidReportConnectProgress?.(progress => {
		if (progress.connectionKey === expectedKey) {
			handle.updateMessage(progress.message);
		}
	});

	try {
		const connection = await sshService.connect(config);
		handle.close();
		return connection;
	} catch (err) {
		handle.close();
		notificationService.error(localize('sshConnectFailed', "Failed to connect via SSH to {0}: {1}", displayHost, String(err)));
		return undefined;
	} finally {
		progressListener?.dispose();
	}
}

/**
 * After a successful SSH connection, show the remote folder picker and
 * pre-select the chosen folder in the workspace picker.
 */
async function promptForRemoteFolder(
	accessor: ServicesAccessor,
	connection: ISSHAgentHostConnection,
): Promise<void> {
	const viewsService = accessor.get(IViewsService);
	const sessionsProvidersService = accessor.get(ISessionsProvidersService);
	const sessionsManagementService = accessor.get(ISessionsManagementService);

	// The provider is created synchronously during addManagedConnection's
	// onDidChangeConnections event, so it should exist by now.
	const provider = sessionsProvidersService.getProviders().find((p): p is IAgentHostSessionsProvider => isAgentHostProvider(p) && p.remoteAddress === connection.localAddress);
	if (!provider) {
		return;
	}

	// Use the provider's existing browse action to show the folder picker
	const browseAction = provider.browseActions[0];
	if (!browseAction) {
		return;
	}

	const workspace = await browseAction.run();
	if (!workspace) {
		return;
	}

	sessionsManagementService.openNewSessionView();
	const view = await viewsService.openView<NewChatViewPane>(SessionsViewId, true);
	view?.selectWorkspace({ providerId: provider.id, workspace });
}

async function promptForManualHost(
	quickInputService: IQuickInputService,
): Promise<{ host: string; username: string | undefined; port: number | undefined } | undefined> {
	const validateSshHostInput = (value: string): string | undefined => {
		const v = value.trim();
		if (!v) {
			return localize('sshHostEmpty', "Enter an SSH host.");
		}
		const atIdx = v.indexOf('@');
		if (atIdx === 0) {
			return localize('sshUsernameMissingInHost', "Enter a username before '@'.");
		}
		if (atIdx === v.length - 1) {
			return localize('sshHostMissingAfterAt', "Enter a host name after '@'.");
		}
		const hostPart = atIdx !== -1 ? v.substring(atIdx + 1) : v;
		if (!hostPart) {
			return localize('sshHostMissingAfterAt', "Enter a host name after '@'.");
		}
		const colonIdx = hostPart.lastIndexOf(':');
		if (colonIdx !== -1) {
			const hostName = hostPart.substring(0, colonIdx);
			const portStr = hostPart.substring(colonIdx + 1);
			if (!hostName) {
				return localize('sshHostMissingAfterAt', "Enter a host name after '@'.");
			}
			if (portStr) {
				const portNum = Number(portStr);
				if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
					return localize('sshHostInvalidPort', "Enter a valid port number.");
				}
			}
		}
		return undefined;
	};

	const hostInput = await quickInputService.input({
		title: localize('sshManualHostTitle', "Connect via SSH"),
		prompt: localize('sshHostPrompt', "Enter the SSH host (e.g. user@hostname or user@hostname:port)."),
		placeHolder: 'user@myserver.example.com',
		ignoreFocusLost: true,
		validateInput: async value => validateSshHostInput(value),
	});
	if (!hostInput) {
		return undefined;
	}

	const trimmed = hostInput.trim();
	let username: string | undefined;
	let host: string;
	let port: number | undefined;
	const atIndex = trimmed.indexOf('@');

	let hostPart: string;
	if (atIndex !== -1) {
		username = trimmed.substring(0, atIndex);
		hostPart = trimmed.substring(atIndex + 1);
	} else {
		hostPart = trimmed;
	}

	const colonIndex = hostPart.lastIndexOf(':');
	if (colonIndex !== -1) {
		host = hostPart.substring(0, colonIndex);
		const portStr = hostPart.substring(colonIndex + 1);
		if (portStr) {
			port = Number(portStr);
		}
	} else {
		host = hostPart;
	}

	return { host, username, port };
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.sessions.connectViaSSH',
			title: localize2('connectViaSSH', "Connect to Remote Agent Host via SSH"),
			shortTitle: localize2('connectViaSSHShort', "SSH..."),
			category: SessionsCategories.Sessions,
			f1: true,
			icon: Codicon.remote,
			precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
			menu: {
				id: Menus.SessionWorkspaceManage,
				order: 20,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await promptToConnectViaSSH(accessor);
	}
});

// ---- Connect via Dev Tunnel -------------------------------------------------

interface ITunnelPickItem extends IQuickPickItem {
	readonly tunnel: ITunnelInfo;
}

interface IAuthProviderPickItem extends IQuickPickItem {
	readonly provider: 'github' | 'microsoft';
}

async function promptToConnectViaTunnel(
	accessor: ServicesAccessor,
): Promise<void> {
	const tunnelService = accessor.get(ITunnelAgentHostService);
	const quickInputService = accessor.get(IQuickInputService);
	const notificationService = accessor.get(INotificationService);
	const authenticationService = accessor.get(IAuthenticationService);
	const instantiationService = accessor.get(IInstantiationService);
	const productService = accessor.get(IProductService);

	// Step 1: Determine auth provider — try cached sessions first, then prompt
	let authProvider = await tunnelService.getAuthProvider({ silent: true });

	if (!authProvider) {
		// No cached session — prompt user to choose auth provider
		const authPicks: IAuthProviderPickItem[] = [
			{
				provider: 'github',
				label: localize('tunnelAuthGitHub', "GitHub"),
				description: localize('tunnelAuthGitHubDesc', "Sign in with your GitHub account"),
			},
			{
				provider: 'microsoft',
				label: localize('tunnelAuthMicrosoft', "Microsoft Account"),
				description: localize('tunnelAuthMicrosoftDesc', "Sign in with your Microsoft account"),
			},
		];

		const authPicked = await quickInputService.pick(authPicks, {
			title: localize('tunnelAuthTitle', "Sign In for Dev Tunnels"),
			placeHolder: localize('tunnelAuthPlaceholder', "Choose an authentication provider"),
		});
		if (!authPicked) {
			return;
		}
		authProvider = authPicked.provider;

		// Trigger interactive auth for the chosen provider
		const scopes = productService.tunnelApplicationConfig?.authenticationProviders?.[authProvider]?.scopes ?? [];
		try {
			if (!(await authenticationService.getSessions(authProvider, scopes)).length) {
				await authenticationService.createSession(authProvider, scopes, { activateImmediate: true });
			}
		} catch {
			notificationService.error(localize('tunnelAuthFailed', "Authentication failed. Please try again."));
			return;
		}
	}

	// Step 2: Show tunnel picker immediately in busy state while enumerating
	const tunnelPicker = quickInputService.createQuickPick<ITunnelPickItem>();
	tunnelPicker.title = localize('tunnelPickTitle', "Connect via Dev Tunnel");
	tunnelPicker.placeholder = localize('tunnelPickPlaceholder', "Select a dev tunnel to connect to");
	tunnelPicker.busy = true;
	tunnelPicker.show();

	let tunnels: ITunnelInfo[];
	try {
		tunnels = await tunnelService.listTunnels();
	} catch (err) {
		tunnelPicker.dispose();
		notificationService.error(localize('tunnelListFailed', "Failed to list dev tunnels: {0}", err instanceof Error ? err.message : String(err)));
		return;
	}

	if (tunnels.length === 0) {
		tunnelPicker.dispose();
		notificationService.info(localize('tunnelNoneFound', "No dev tunnels with agent host support were found. Start a tunnel with 'code tunnel' on another machine."));
		return;
	}

	tunnelPicker.items = tunnels.map(t => ({
		label: t.name,
		description: `${t.tunnelId} · protocol v${t.protocolVersion}`,
		tunnel: t,
	}));
	tunnelPicker.busy = false;

	// Step 3: Wait for user selection
	const picked = await new Promise<ITunnelPickItem | undefined>(resolve => {
		tunnelPicker.onDidAccept(() => {
			resolve(tunnelPicker.selectedItems[0]);
			tunnelPicker.dispose();
		});
		tunnelPicker.onDidHide(() => {
			resolve(undefined);
			tunnelPicker.dispose();
		});
	});
	if (!picked) {
		return;
	}

	// Step 4: Connect to the tunnel with progress notification
	const handle = notificationService.notify({
		severity: Severity.Info,
		message: localize('tunnelConnecting', "Connecting to tunnel '{0}'...", picked.tunnel.name),
		progress: { infinite: true },
	});

	try {
		await tunnelService.connect(picked.tunnel, authProvider);
		handle.close();
	} catch (err) {
		handle.close();
		notificationService.error(localize('tunnelConnectFailed', "Failed to connect to tunnel '{0}': {1}", picked.tunnel.name, err instanceof Error ? err.message : String(err)));
		return;
	}

	// Cache the tunnel for future reconnections
	tunnelService.cacheTunnel(picked.tunnel, authProvider);

	// Step 5: Open folder picker (same pattern as SSH)
	await instantiationService.invokeFunction(accessor => promptForTunnelFolder(accessor, picked.tunnel));
}

/**
 * After a successful tunnel connection, show the remote folder picker and
 * pre-select the chosen folder in the workspace picker.
 */
async function promptForTunnelFolder(
	accessor: ServicesAccessor,
	tunnel: ITunnelInfo,
): Promise<void> {
	const viewsService = accessor.get(IViewsService);
	const sessionsProvidersService = accessor.get(ISessionsProvidersService);
	const sessionsManagementService = accessor.get(ISessionsManagementService);

	const tunnelAddress = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;

	// The provider is created by TunnelAgentHostContribution when the
	// tunnel is cached (via onDidChangeTunnels / _reconcileProviders).
	const provider = sessionsProvidersService.getProviders().find((p): p is IAgentHostSessionsProvider => isAgentHostProvider(p) && p.remoteAddress === tunnelAddress);
	if (!provider) {
		return;
	}

	// Use the provider's existing browse action to show the folder picker
	const browseAction = provider.browseActions[0];
	if (!browseAction) {
		return;
	}

	const workspace = await browseAction.run();
	if (!workspace) {
		return;
	}

	sessionsManagementService.openNewSessionView();
	const view = await viewsService.openView<NewChatViewPane>(SessionsViewId, true);
	view?.selectWorkspace({ providerId: provider.id, workspace });
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.sessions.connectViaTunnel',
			title: localize2('connectViaTunnel', "Connect to Remote Agent Host via Dev Tunnel"),
			shortTitle: localize2('connectViaTunnelShort', "Tunnels..."),
			category: SessionsCategories.Sessions,
			f1: true,
			icon: Codicon.cloud,
			precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
			menu: {
				id: Menus.SessionWorkspaceManage,
				order: 10,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await promptToConnectViaTunnel(accessor);
	}
});
