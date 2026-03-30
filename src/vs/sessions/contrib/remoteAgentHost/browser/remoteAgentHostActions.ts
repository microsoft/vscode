/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IRemoteAgentHostService, parseRemoteAgentHostInput, RemoteAgentHostInputValidationError, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService, SSHAuthMethod, type ISSHAgentHostConfig } from '../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.remoteAgentHost.add',
			title: localize2('addRemoteAgentHost', "Add Remote Agent Host..."),
			category: CHAT_CATEGORY,
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
				address: parsed.parsed.address,
				name: name.trim(),
				connectionToken: parsed.parsed.connectionToken,
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
 * Multi-step quick input flow for connecting to a remote agent host via SSH.
 * Prompts for host, username, auth method, and display name.
 */
async function promptToConnectViaSSH(
	accessor: ServicesAccessor,
): Promise<void> {
	const sshService = accessor.get(ISSHRemoteAgentHostService);
	const quickInputService = accessor.get(IQuickInputService);
	const notificationService = accessor.get(INotificationService);

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
				const port = Number(portStr);
				if (!Number.isInteger(port) || port <= 0 || port > 65535) {
					return localize('sshHostInvalidPort', "Enter a valid port number.");
				}
			}
		}
		return undefined;
	};

	// Step 1: SSH host
	const hostInput = await quickInputService.input({
		title: localize('sshHostTitle', "Connect via SSH"),
		prompt: localize('sshHostPrompt', "Enter the SSH host (e.g. user@hostname or user@hostname:port)."),
		placeHolder: 'user@myserver.example.com',
		ignoreFocusLost: true,
		validateInput: async value => validateSshHostInput(value),
	});
	if (!hostInput) {
		return;
	}

	// Parse user@host[:port] format
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

	if (atIndex === -1) {
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

	if (!username) {
		return;
	}

	// Step 3: Auth method
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

	let privateKeyPath: string | undefined;
	let password: string | undefined;

	if (authPicked.method === SSHAuthMethod.KeyFile) {
		const keyPath = await quickInputService.input({
			title: localize('sshKeyTitle', "Private Key Path"),
			prompt: localize('sshKeyPrompt', "Enter the path to your SSH private key."),
			placeHolder: '~/.ssh/id_rsa',
			value: '~/.ssh/id_rsa',
			ignoreFocusLost: true,
			validateInput: async value => value.trim() ? undefined : localize('sshKeyEmpty', "Enter a key file path."),
		});
		if (!keyPath) {
			return;
		}
		privateKeyPath = keyPath.trim();
	} else if (authPicked.method === SSHAuthMethod.Password) {
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

	// Step 4: Display name
	const suggestedName = `${username}@${host}`;
	const name = await quickInputService.input({
		title: localize('sshNameTitle', "Name Remote"),
		prompt: localize('sshNamePrompt', "Enter a display name for this SSH remote."),
		placeHolder: localize('sshNamePlaceholder', "My Remote"),
		value: suggestedName,
		valueSelection: [0, suggestedName.length],
		ignoreFocusLost: true,
		validateInput: async value => value.trim() ? undefined : localize('sshNameEmpty', "Enter a name."),
	});
	if (!name) {
		return;
	}

	// Connect via SSH
	const config: ISSHAgentHostConfig = {
		host,
		port,
		username,
		authMethod: authPicked.method,
		privateKeyPath,
		password,
		name: name.trim(),
	};

	try {
		await sshService.connect(config);
	} catch (err) {
		notificationService.error(localize('sshConnectFailed', "Failed to connect via SSH to {0}: {1}", host, String(err)));
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.sessions.connectViaSSH',
			title: localize2('connectViaSSH', "Connect to Remote Agent Host via SSH"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await promptToConnectViaSSH(accessor);
	}
});
