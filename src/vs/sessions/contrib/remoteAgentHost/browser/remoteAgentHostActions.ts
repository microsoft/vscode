/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EndOfLinePreference } from '../../../../editor/common/model.js';
import { Range } from '../../../../editor/common/core/range.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
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

/** Action / command IDs registered by this file. */
export const RemoteAgentHostCommandIds = {
	addRemoteAgentHost: 'sessions.remoteAgentHost.add',
	connectViaSSH: 'workbench.action.sessions.connectViaSSH',
	addNewSSHHost: 'workbench.action.sessions.addNewSSHHost',
	configureSSHHosts: 'workbench.action.sessions.configureSSHHosts',
	connectViaTunnel: 'workbench.action.sessions.connectViaTunnel',
	manageRemoteAgentHosts: 'workbench.action.sessions.manageRemoteAgentHosts',
} as const;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RemoteAgentHostCommandIds.addRemoteAgentHost,
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

/**
 * Parse a free-form SSH connection string of the form `[user@]host[:port]`.
 * Returns `undefined` for empty or invalid input.
 */
export function parseSSHHostInput(value: string): { host: string; username?: string; port?: number } | undefined {
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}
	const atIdx = trimmed.indexOf('@');
	if (atIdx === 0 || atIdx === trimmed.length - 1) {
		return undefined;
	}
	let username: string | undefined;
	let hostPart: string;
	if (atIdx !== -1) {
		username = trimmed.substring(0, atIdx);
		hostPart = trimmed.substring(atIdx + 1);
	} else {
		hostPart = trimmed;
	}
	if (!hostPart) {
		return undefined;
	}
	let host: string;
	let port: number | undefined;
	const colonIdx = hostPart.lastIndexOf(':');
	if (colonIdx !== -1) {
		host = hostPart.substring(0, colonIdx);
		const portStr = hostPart.substring(colonIdx + 1);
		if (!host) {
			return undefined;
		}
		if (portStr) {
			const portNum = Number(portStr);
			if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
				return undefined;
			}
			port = portNum;
		}
	} else {
		host = hostPart;
	}
	if (!host) {
		return undefined;
	}
	return { host, username, port };
}

function validateSSHHostInput(value: string): string | undefined {
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
}

interface ISSHAliasPickItem extends IQuickPickItem {
	readonly kind: 'alias';
	readonly hostAlias: string;
}

interface ISSHNewHostPickItem extends IQuickPickItem {
	kind: 'new-host';
	hostInput: string;
}

interface ISSHFooterPickItem extends IQuickPickItem {
	readonly kind: 'add-config' | 'configure';
}

type SSHHostPickerItem = ISSHAliasPickItem | ISSHNewHostPickItem | ISSHFooterPickItem;

async function promptToConnectViaSSH(
	accessor: ServicesAccessor,
	options: { showBackButton?: boolean } = {},
): Promise<'back' | void> {
	const sshService = accessor.get(ISSHRemoteAgentHostService);
	const quickInputService = accessor.get(IQuickInputService);
	const notificationService = accessor.get(INotificationService);
	const instantiationService = accessor.get(IInstantiationService);
	const commandService = accessor.get(ICommandService);

	const configHosts = await sshService.listSSHConfigHosts().catch(() => [] as string[]);

	const aliasItems: ISSHAliasPickItem[] = configHosts.map(h => ({
		kind: 'alias',
		hostAlias: h,
		label: h,
	}));
	const addHostItem: ISSHFooterPickItem = {
		kind: 'add-config',
		label: '$(plus) ' + localize('sshAddNewHost', "Add New SSH Host..."),
		alwaysShow: true,
	};
	const configureHostsItem: ISSHFooterPickItem = {
		kind: 'configure',
		label: localize('sshConfigureHosts', "Configure SSH Hosts..."),
		alwaysShow: true,
	};
	const newHostItem: ISSHNewHostPickItem = {
		kind: 'new-host',
		hostInput: '',
		label: '',
		alwaysShow: true,
	};

	const result = await new Promise<'back' | SSHHostPickerItem | undefined>((resolve) => {
		const store = new DisposableStore();
		const picker = store.add(quickInputService.createQuickPick<SSHHostPickerItem>());
		picker.title = localize('sshHostTitle', "Connect via SSH");
		picker.placeholder = localize('sshHostPickerPlaceholder', "Select configured SSH host or enter user@host");
		picker.ignoreFocusOut = true;
		picker.matchOnDescription = true;
		if (options.showBackButton) {
			picker.buttons = [quickInputService.backButton];
		}

		let newHostVisible = false;
		const updateItems = () => {
			const items: SSHHostPickerItem[] = [...aliasItems];
			if (newHostVisible) {
				items.push(newHostItem);
			}
			items.push(addHostItem);
			items.push(configureHostsItem);
			picker.items = items;
		};
		updateItems();

		store.add(picker.onDidChangeValue(value => {
			const parsed = parseSSHHostInput(value);
			if (parsed) {
				newHostItem.hostInput = value.trim();
				newHostItem.label = `\u27a4 ${value.trim()}`;
				if (!newHostVisible) {
					newHostVisible = true;
					updateItems();
				} else {
					// Force item refresh so the label updates
					picker.items = picker.items;
				}
			} else if (newHostVisible) {
				newHostVisible = false;
				updateItems();
			}
		}));

		store.add(picker.onDidTriggerButton(button => {
			if (button === quickInputService.backButton) {
				resolve('back');
				picker.hide();
			}
		}));
		store.add(picker.onDidAccept(() => {
			const selected = picker.selectedItems[0];
			resolve(selected);
			picker.hide();
		}));
		store.add(picker.onDidHide(() => {
			resolve(undefined);
			store.dispose();
		}));
		picker.show();
	});

	if (result === 'back') {
		return 'back';
	}

	if (!result) {
		return;
	}

	if (result.kind === 'add-config' || result.kind === 'configure') {
		const cmdId = result.kind === 'add-config'
			? RemoteAgentHostCommandIds.addNewSSHHost
			: RemoteAgentHostCommandIds.configureSSHHosts;
		// Pass back callback so sub-picker can navigate back to this SSH picker
		const onBackToSSH = () => instantiationService.invokeFunction(a => promptToConnectViaSSH(a, options));
		await commandService.executeCommand(cmdId, onBackToSSH);
		return;
	}

	if (result.kind === 'alias') {
		await instantiationService.invokeFunction(accessor =>
			connectToConfiguredSSHHost(accessor, result.hostAlias)
		);
		return;
	}

	// kind === 'new-host'
	const newHost = result as ISSHNewHostPickItem;
	const parsed = parseSSHHostInput(newHost.hostInput);
	if (!parsed) {
		notificationService.error(validateSSHHostInput(newHost.hostInput) ?? localize('sshHostInvalid', "Invalid SSH host."));
		return;
	}
	await instantiationService.invokeFunction(accessor =>
		promptForCredentialsAndConnect(accessor, parsed.host, parsed.username, parsed.port)
	);
}

async function connectToConfiguredSSHHost(
	accessor: ServicesAccessor,
	hostAlias: string,
): Promise<void> {
	const sshService = accessor.get(ISSHRemoteAgentHostService);
	const notificationService = accessor.get(INotificationService);
	const instantiationService = accessor.get(IInstantiationService);

	let resolvedConfig: ISSHResolvedConfig;
	try {
		resolvedConfig = await sshService.resolveSSHConfig(hostAlias);
	} catch (err) {
		notificationService.error(localize('sshResolveConfigFailed', "Failed to resolve SSH config for {0}: {1}", hostAlias, String(err)));
		return;
	}

	const host = resolvedConfig.hostname;
	const username = resolvedConfig.user;
	const port = resolvedConfig.port !== 22 ? resolvedConfig.port : undefined;
	const suggestedName = hostAlias;

	let defaultKeyPath: string | undefined;
	if (resolvedConfig.identityFile.length > 0) {
		const firstKey = resolvedConfig.identityFile[0];
		const defaultKeys = ['~/.ssh/id_rsa', '~/.ssh/id_ecdsa', '~/.ssh/id_ed25519', '~/.ssh/id_dsa', '~/.ssh/id_xmss'];
		if (!defaultKeys.includes(firstKey)) {
			defaultKeyPath = firstKey;
		}
	}

	if (username) {
		const config: ISSHAgentHostConfig = {
			host,
			port,
			username,
			authMethod: SSHAuthMethod.Agent,
			privateKeyPath: defaultKeyPath,
			agentForward: resolvedConfig.forwardAgent || undefined,
			name: suggestedName,
			sshConfigHost: hostAlias,
		};
		const connection = await instantiationService.invokeFunction(accessor =>
			connectWithProgress(accessor, config, suggestedName)
		);
		if (connection) {
			await instantiationService.invokeFunction(accessor => promptForRemoteFolder(accessor, connection));
		}
		return;
	}

	// Fallback: alias resolved without a user — fall through to manual flow
	await instantiationService.invokeFunction(accessor =>
		promptForCredentialsAndConnect(accessor, host, undefined, port, suggestedName, defaultKeyPath)
	);
}

async function promptForCredentialsAndConnect(
	accessor: ServicesAccessor,
	host: string,
	username: string | undefined,
	port: number | undefined,
	suggestedName?: string,
	defaultKeyPath?: string,
): Promise<void> {
	const quickInputService = accessor.get(IQuickInputService);
	const instantiationService = accessor.get(IInstantiationService);

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

	const authPicked = await quickInputService.pick(authPicks, {
		title: localize('sshAuthTitle', "Authentication Method"),
		placeHolder: localize('sshAuthPlaceholder', "Choose how to authenticate with {0}", host),
	});
	if (!authPicked) {
		return;
	}
	const authMethod = authPicked.method;

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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RemoteAgentHostCommandIds.connectViaSSH,
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

	override async run(accessor: ServicesAccessor, onBack?: () => void): Promise<void> {
		const result = await promptToConnectViaSSH(accessor, { showBackButton: !!onBack });
		if (result === 'back') {
			onBack?.();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RemoteAgentHostCommandIds.addNewSSHHost,
			title: localize2('addNewSSHHost', "Add New SSH Host..."),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sshService = accessor.get(ISSHRemoteAgentHostService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);

		let configUri;
		try {
			configUri = await sshService.ensureUserSSHConfig();
		} catch (err) {
			notificationService.error(localize('sshConfigCreateFailed', "Failed to create SSH config file: {0}", String(err)));
			return;
		}

		const editorPane = await editorService.openEditor({ resource: configUri, options: { pinned: true } satisfies ITextEditorOptions });
		if (!editorPane) {
			return;
		}
		const control = editorPane.getControl();
		if (!isCodeEditor(control) || !control.hasModel()) {
			return;
		}
		const editor = control as ICodeEditor;
		const model = editor.getModel();
		if (!model) {
			return;
		}

		// Append a snippet at end of document. Read file content for length;
		// fall back to model length to avoid races.
		let appendNewline = false;
		try {
			const stat = await fileService.stat(configUri);
			if (stat.size > 0) {
				const content = model.getValueInRange(model.getFullModelRange(), EndOfLinePreference.LF);
				appendNewline = content.length > 0 && !content.endsWith('\n');
			}
		} catch {
			// ignore
		}
		const lastLine = model.getLineCount();
		const lastCol = model.getLineMaxColumn(lastLine);
		editor.setSelection(new Range(lastLine, lastCol, lastLine, lastCol));

		const snippet = (appendNewline ? '\n' : '') + 'Host ${1:alias}\n    HostName ${2:hostname}\n    User ${3:user}\n';
		SnippetController2.get(editor)?.insert(snippet);
		editor.focus();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RemoteAgentHostCommandIds.configureSSHHosts,
			title: localize2('configureSSHHosts', "Configure SSH Hosts..."),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
		});
	}

	override async run(accessor: ServicesAccessor, onBack?: () => void): Promise<void> {
		const sshService = accessor.get(ISSHRemoteAgentHostService);
		const editorService = accessor.get(IEditorService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		let configFiles: URI[];
		try {
			configFiles = await sshService.listSSHConfigFiles();
		} catch (err) {
			notificationService.error(localize('sshConfigListFailed', "Failed to list SSH config files: {0}", String(err)));
			return;
		}

		// Always offer the user-config fallback so we have something openable.
		if (configFiles.length === 0) {
			try {
				const uri = await sshService.ensureUserSSHConfig();
				await editorService.openEditor({ resource: uri, options: { pinned: true } satisfies ITextEditorOptions });
			} catch (err) {
				notificationService.error(localize('sshConfigOpenFailed', "Failed to open SSH config file: {0}", String(err)));
			}
			return;
		}

		interface ISSHConfigFilePickItem extends IQuickPickItem {
			readonly uri: URI;
			readonly isUserConfig: boolean;
		}
		const userConfigUri = configFiles[0];
		const items: ISSHConfigFilePickItem[] = configFiles.map((uri, index) => ({
			label: uri.fsPath,
			uri,
			isUserConfig: index === 0,
		}));

		// If there's only one file, skip the picker and open it directly.
		// If onBack is provided we still need to show the picker to offer navigation.
		if (items.length === 1 && !onBack) {
			const picked = items[0];
			try {
				const uri = picked.isUserConfig
					? await sshService.ensureUserSSHConfig().catch(() => userConfigUri)
					: picked.uri;
				await editorService.openEditor({ resource: uri, options: { pinned: true } satisfies ITextEditorOptions });
			} catch (err) {
				notificationService.error(localize('sshConfigOpenFailed', "Failed to open SSH config file: {0}", String(err)));
			}
			return;
		}

		const picked = await new Promise<'back' | ISSHConfigFilePickItem | undefined>(resolve => {
			const store = new DisposableStore();
			const picker = store.add(quickInputService.createQuickPick<ISSHConfigFilePickItem>());
			picker.title = localize('sshConfigPickTitle', "Select SSH configuration file to edit");
			picker.placeholder = localize('sshConfigPickPlaceholder', "Select an SSH configuration file");
			picker.items = items;
			if (onBack) {
				picker.buttons = [quickInputService.backButton];
			}
			store.add(picker.onDidTriggerButton(button => {
				if (button === quickInputService.backButton) {
					resolve('back');
					picker.hide();
				}
			}));
			store.add(picker.onDidAccept(() => {
				resolve(picker.selectedItems[0]);
				picker.hide();
			}));
			store.add(picker.onDidHide(() => {
				resolve(undefined);
				store.dispose();
			}));
			picker.show();
		});

		if (picked === 'back') {
			onBack?.();
			return;
		}
		if (!picked) {
			return;
		}

		try {
			// If the user picked the user config, ensure it exists (creating it on demand)
			// before opening so we don't try to open a file that's not there yet.
			const uri = picked.isUserConfig
				? await sshService.ensureUserSSHConfig().catch(() => userConfigUri)
				: picked.uri;
			await editorService.openEditor({ resource: uri, options: { pinned: true } satisfies ITextEditorOptions });
		} catch (err) {
			notificationService.error(localize('sshConfigOpenFailed', "Failed to open SSH config file: {0}", String(err)));
		}
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
	options: { showBackButton?: boolean } = {},
): Promise<'back' | void> {
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
	const store = new DisposableStore();
	const tunnelPicker = store.add(quickInputService.createQuickPick<ITunnelPickItem>());
	tunnelPicker.title = localize('tunnelPickTitle', "Connect via Dev Tunnel");
	tunnelPicker.placeholder = localize('tunnelPickPlaceholder', "Select a dev tunnel to connect to");
	tunnelPicker.busy = true;
	if (options.showBackButton) {
		tunnelPicker.buttons = [quickInputService.backButton];
	}
	tunnelPicker.show();

	let tunnels: ITunnelInfo[];
	try {
		tunnels = await tunnelService.listTunnels();
	} catch (err) {
		store.dispose();
		notificationService.error(localize('tunnelListFailed', "Failed to list dev tunnels: {0}", err instanceof Error ? err.message : String(err)));
		return;
	}

	if (tunnels.length === 0) {
		store.dispose();
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
	const picked = await new Promise<'back' | ITunnelPickItem | undefined>(resolve => {
		store.add(tunnelPicker.onDidTriggerButton(button => {
			if (button === quickInputService.backButton) {
				resolve('back');
				tunnelPicker.hide();
			}
		}));
		store.add(tunnelPicker.onDidAccept(() => {
			resolve(tunnelPicker.selectedItems[0]);
			tunnelPicker.hide();
		}));
		store.add(tunnelPicker.onDidHide(() => {
			resolve(undefined);
			store.dispose();
		}));
	});

	if (picked === 'back') {
		return 'back';
	}
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
			id: RemoteAgentHostCommandIds.connectViaTunnel,
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

	override async run(accessor: ServicesAccessor, onBack?: () => void): Promise<void> {
		const result = await promptToConnectViaTunnel(accessor, { showBackButton: !!onBack });
		if (result === 'back') {
			onBack?.();
		}
	}
});
