/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IRemoteAgentHostService, parseRemoteAgentHostInput, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionsViewId } from '../../chat/browser/newChatViewPane.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
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
    async run(accessor) {
        const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
        const quickInputService = accessor.get(IQuickInputService);
        const notificationService = accessor.get(INotificationService);
        // Prompt for address
        const address = await quickInputService.input({
            title: localize('addRemoteTitle', "Add Remote Agent Host"),
            prompt: localize('addRemotePrompt', "Paste a host, host:port, or WebSocket URL. Example: {0}", 'ws://127.0.0.1:8089'),
            placeHolder: 'ws://127.0.0.1:8080?tkn=abc-123',
            ignoreFocusLost: true,
            validateInput: async (value) => {
                const result = parseRemoteAgentHostInput(value);
                if (result.error === "empty" /* RemoteAgentHostInputValidationError.Empty */) {
                    return localize('addRemoteValidationEmpty', "Enter a remote agent host address.");
                }
                if (result.error === "invalid" /* RemoteAgentHostInputValidationError.Invalid */) {
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
            validateInput: async (value) => value.trim() ? undefined : localize('nameRemoteValidationEmpty', "Enter a name for this remote agent host."),
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
        }
        catch {
            notificationService.error(localize('addRemoteFailed', "Failed to connect to remote agent host {0}.", parsed.parsed.address));
        }
    }
});
async function promptToConnectViaSSH(accessor) {
    const sshService = accessor.get(ISSHRemoteAgentHostService);
    const quickInputService = accessor.get(IQuickInputService);
    const notificationService = accessor.get(INotificationService);
    const instantiationService = accessor.get(IInstantiationService);
    let host;
    let username;
    let port;
    let resolvedConfig;
    let suggestedName;
    let defaultAuthMethod;
    let defaultKeyPath;
    const configHosts = await sshService.listSSHConfigHosts().catch(() => []);
    if (configHosts.length > 0) {
        const hostPicks = configHosts.map(h => ({
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
            }
            catch (err) {
                notificationService.error(localize('sshResolveConfigFailed', "Failed to resolve SSH config for {0}: {1}", picked.hostAlias, String(err)));
                return;
            }
            host = resolvedConfig.hostname;
            username = resolvedConfig.user;
            port = resolvedConfig.port !== 22 ? resolvedConfig.port : undefined;
            suggestedName = picked.hostAlias;
            // Determine auth method from resolved config
            if (resolvedConfig.identityFile.length > 0) {
                const firstKey = resolvedConfig.identityFile[0];
                const defaultKeys = ['~/.ssh/id_rsa', '~/.ssh/id_ecdsa', '~/.ssh/id_ed25519', '~/.ssh/id_dsa', '~/.ssh/id_xmss'];
                if (!defaultKeys.includes(firstKey)) {
                    defaultAuthMethod = "keyFile" /* SSHAuthMethod.KeyFile */;
                    defaultKeyPath = firstKey;
                }
            }
            // If no explicit key, default to SSH agent
            if (!defaultAuthMethod) {
                defaultAuthMethod = "agent" /* SSHAuthMethod.Agent */;
            }
            // Config host has enough info — connect directly, skip all prompts
            if (username) {
                const config = {
                    host,
                    port,
                    username,
                    authMethod: defaultAuthMethod,
                    privateKeyPath: defaultKeyPath,
                    name: suggestedName,
                    sshConfigHost: picked.hostAlias,
                };
                const connection = await instantiationService.invokeFunction(accessor => connectWithProgress(accessor, config, suggestedName));
                if (connection) {
                    await instantiationService.invokeFunction(accessor => promptForRemoteFolder(accessor, connection));
                }
                return;
            }
        }
        else {
            const manualResult = await promptForManualHost(quickInputService);
            if (!manualResult) {
                return;
            }
            host = manualResult.host;
            username = manualResult.username;
            port = manualResult.port;
        }
    }
    else {
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
            validateInput: async (value) => value.trim() ? undefined : localize('sshUsernameEmpty', "Enter a username."),
        });
        if (!usernameInput) {
            return;
        }
        username = usernameInput.trim();
    }
    const authPicks = [
        {
            method: "agent" /* SSHAuthMethod.Agent */,
            label: localize('sshAuthAgent', "SSH Agent"),
            description: localize('sshAuthAgentDesc', "Use the running SSH agent for authentication"),
        },
        {
            method: "keyFile" /* SSHAuthMethod.KeyFile */,
            label: localize('sshAuthKey', "Private Key File"),
            description: localize('sshAuthKeyDesc', "Authenticate with a private key file"),
        },
        {
            method: "password" /* SSHAuthMethod.Password */,
            label: localize('sshAuthPassword', "Password"),
            description: localize('sshAuthPasswordDesc', "Authenticate with a password"),
        },
    ];
    let authMethod;
    if (defaultAuthMethod) {
        authMethod = defaultAuthMethod;
    }
    else {
        const authPicked = await quickInputService.pick(authPicks, {
            title: localize('sshAuthTitle', "Authentication Method"),
            placeHolder: localize('sshAuthPlaceholder', "Choose how to authenticate with {0}", host),
        });
        if (!authPicked) {
            return;
        }
        authMethod = authPicked.method;
    }
    let privateKeyPath;
    let password;
    if (authMethod === "keyFile" /* SSHAuthMethod.KeyFile */) {
        const keyPath = await quickInputService.input({
            title: localize('sshKeyTitle', "Private Key Path"),
            prompt: localize('sshKeyPrompt', "Enter the path to your SSH private key."),
            placeHolder: '~/.ssh/id_rsa',
            value: defaultKeyPath ?? '~/.ssh/id_rsa',
            ignoreFocusLost: true,
            validateInput: async (value) => value.trim() ? undefined : localize('sshKeyEmpty', "Enter a key file path."),
        });
        if (!keyPath) {
            return;
        }
        privateKeyPath = keyPath.trim();
    }
    else if (authMethod === "password" /* SSHAuthMethod.Password */) {
        const pw = await quickInputService.input({
            title: localize('sshPasswordTitle', "SSH Password"),
            prompt: localize('sshPasswordPrompt', "Enter the password for {0}@{1}.", username, host),
            password: true,
            ignoreFocusLost: true,
            validateInput: async (value) => value ? undefined : localize('sshPasswordEmpty', "Enter a password."),
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
        validateInput: async (value) => value.trim() ? undefined : localize('sshNameEmpty', "Enter a name."),
    });
    if (!name) {
        return;
    }
    const config = {
        host,
        port,
        username,
        authMethod,
        privateKeyPath,
        password,
        name: name.trim(),
    };
    const connection = await instantiationService.invokeFunction(accessor => connectWithProgress(accessor, config, host));
    if (connection) {
        await instantiationService.invokeFunction(accessor => promptForRemoteFolder(accessor, connection));
    }
}
async function connectWithProgress(accessor, config, displayHost) {
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
    }
    catch (err) {
        handle.close();
        notificationService.error(localize('sshConnectFailed', "Failed to connect via SSH to {0}: {1}", displayHost, String(err)));
        return undefined;
    }
    finally {
        progressListener?.dispose();
    }
}
/**
 * After a successful SSH connection, show the remote folder picker and
 * pre-select the chosen folder in the workspace picker.
 */
async function promptForRemoteFolder(accessor, connection) {
    const viewsService = accessor.get(IViewsService);
    const sessionsProvidersService = accessor.get(ISessionsProvidersService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    // The provider is created synchronously during addSSHConnection's
    // onDidChangeConnections event, so it should exist by now.
    const provider = sessionsProvidersService.getProviders().find(p => p.remoteAddress === connection.localAddress);
    if (!provider) {
        return;
    }
    // Use the provider's existing browse action to show the folder picker
    const browseAction = provider.browseActions[0];
    if (!browseAction) {
        return;
    }
    const workspace = await browseAction.execute();
    if (!workspace) {
        return;
    }
    sessionsManagementService.openNewSessionView();
    const view = await viewsService.openView(SessionsViewId, true);
    view?.selectWorkspace({ providerId: provider.id, workspace });
}
async function promptForManualHost(quickInputService) {
    const validateSshHostInput = (value) => {
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
        validateInput: async (value) => validateSshHostInput(value),
    });
    if (!hostInput) {
        return undefined;
    }
    const trimmed = hostInput.trim();
    let username;
    let host;
    let port;
    const atIndex = trimmed.indexOf('@');
    let hostPart;
    if (atIndex !== -1) {
        username = trimmed.substring(0, atIndex);
        hostPart = trimmed.substring(atIndex + 1);
    }
    else {
        hostPart = trimmed;
    }
    const colonIndex = hostPart.lastIndexOf(':');
    if (colonIndex !== -1) {
        host = hostPart.substring(0, colonIndex);
        const portStr = hostPart.substring(colonIndex + 1);
        if (portStr) {
            port = Number(portStr);
        }
    }
    else {
        host = hostPart;
    }
    return { host, username, port };
}
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.sessions.connectViaSSH',
            title: localize2('connectViaSSH', "Connect to Remote Agent Host via SSH"),
            category: SessionsCategories.Sessions,
            f1: true,
            precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
        });
    }
    async run(accessor) {
        await promptToConnectViaSSH(accessor);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvcmVtb3RlQWdlbnRIb3N0L2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLHlCQUF5QixFQUF1QyxnQ0FBZ0MsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzVNLE9BQU8sRUFBRSwwQkFBMEIsRUFBa0csTUFBTSw2REFBNkQsQ0FBQztBQUN6TSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsa0JBQWtCLEVBQWtCLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ25FLE9BQU8sRUFBbUIsY0FBYyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDeEYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFL0YsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPO0lBQ3BDO1FBQ0Ms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