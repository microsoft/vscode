/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { escapeRegExpCharacters } from '../../../../../../base/common/strings.js';
import { IAgentHostBuild } from '../../../../../../platform/agentHost/common/meta/agentHostUpgradeMeta.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { formatSSHProxyCommandExit } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { WSL_INSTALL_SERVER_LIBRARIES_COMMAND, WSL_MUSL_SERVER_LIBRARIES } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { canConnectToRemote, ICustomizationRemote, IRemoteTroubleshootingInfo } from './remotesModel.js';

/** Actions the Troubleshoot Connection page can offer. */
export type RemoteTroubleshootingAction =
	| 'connect' | 'retry' | 'updateServer' | 'signIn' | 'connectHost' | 'newSession' | 'disconnect'
	| 'openSSHConfig' | 'forgetHostKey' | 'connectViaSSH' | 'restartDistribution' | 'refresh' | 'deleteTunnel'
	| 'openEnvironmentSettings' | 'removeEnvironment' | 'showExtension' | 'reportExtensionIssue' | 'showLog' | 'deleteDevContainer';

export interface IRemoteTroubleshootingGuide {
	/** Facts specific to the connection type, shown with the environment's identity. */
	readonly facts: readonly { readonly label: string; readonly value: string }[];
	/** What went wrong and what to do next, in plain words. */
	readonly guidance: readonly string[];
	/** A command the user can run in a terminal to investigate further. */
	readonly command?: { readonly label: string; readonly value: string };
	readonly primary?: RemoteTroubleshootingAction;
	readonly actions: readonly RemoteTroubleshootingAction[];
	readonly documentation: { readonly label: string; readonly href: string };
}

const destructiveActions: ReadonlySet<RemoteTroubleshootingAction> = new Set(['deleteTunnel', 'removeEnvironment', 'deleteDevContainer']);

const troubleshootingDocumentation = {
	label: localize('remotes.troubleshootingGuide', "Remote agent sessions troubleshooting"),
	href: 'https://code.visualstudio.com/docs/agents/run/remote-agent-sessions#_troubleshoot-remote-sessions',
};

const documentation: Record<ICustomizationRemote['kind'], { readonly label: string; readonly href: string }> = {
	ssh: { label: localize('remotes.connectionHelp.ssh', "SSH connection guide"), href: 'https://code.visualstudio.com/docs/agents/run/remote-agent-sessions#_connect-via-ssh' },
	wsl: { label: localize('remotes.connectionHelp.wsl', "WSL troubleshooting"), href: 'https://learn.microsoft.com/en-us/windows/wsl/troubleshooting' },
	tunnel: { label: localize('remotes.connectionHelp.tunnel', "Dev Tunnel connection guide"), href: 'https://code.visualstudio.com/docs/agents/run/remote-agent-sessions#_connect-via-dev-tunnel' },
	environment: { label: localize('remotes.connectionHelp.environment', "GitHub environment troubleshooting"), href: 'https://code.visualstudio.com/docs/agents/run/remote-agent-sessions#_troubleshoot-github-environments' },
	extension: troubleshootingDocumentation,
	devContainer: troubleshootingDocumentation,
};

/**
 * The exit status and error output of a ProxyCommand that ended the connection. They're read from the message
 * {@link formatSSHProxyCommandExit} localized where the connection runs, in the same language as this window.
 */
function getSSHProxyCommandExit(error: string): { readonly status: string; readonly stderr: string } | undefined {
	const pattern = escapeRegExpCharacters(formatSSHProxyCommandExit('\u0000', '\u0001'))
		.replace('\u0000', '(?<status>[^\\s()]+)')
		.replace('\u0001', '(?<stderr>[\\s\\S]*)');
	const groups = new RegExp(pattern).exec(error)?.groups;
	return groups ? { status: groups.status, stderr: groups.stderr } : undefined;
}

/** A regular expression, or an object with the same test method where a pattern isn't enough. */
interface IErrorMatcher {
	test(error: string): boolean;
}

/** Shells exit with 127 (POSIX) or 9009 (cmd) when they can't find the command, whatever the language of their message. */
const sshProxyCommandNotStarted: IErrorMatcher = {
	test: error => {
		const exit = getSSHProxyCommandExit(error);
		return !!exit && (exit.status === '127' || exit.status === '9009'
			|| /is not recognized as an internal or external command|command not found|: not found|No such file or directory|cannot find the path/i.test(exit.stderr));
	},
};

const sshProxyFailed: IErrorMatcher = {
	test: error => /ProxyJump|ProxyCommand|SSH jump process/i.test(error) || !!getSSHProxyCommandExit(error),
};

/** Explains SSH errors from their messages; the first matching pattern wins, so sign-in rejections precede network errors. */
const sshErrors: readonly (readonly [IErrorMatcher, () => string, RemoteTroubleshootingAction[]])[] = [
	[/All configured authentication methods failed|SSH authentication failed|Permission denied \((?:publickey|password|keyboard-interactive)|Jump host authentication failed/i,
		() => localize('remotes.sshCheckAuthentication', "The SSH server rejected the sign-in. Check the user name and credentials used to connect. If you use an SSH key, its public key must be authorized for that user on the remote computer."), ['connectViaSSH']],
	[/host key.*(?:changed|mismatch|rejected)|host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i,
		() => localize('remotes.sshHostKey', "The remote computer's host key doesn't match the saved key. Verify the new key with the computer's administrator before you forget the saved key."), ['forgetHostKey']],
	[/ECONNREFUSED/i,
		() => localize('remotes.sshRefused', "The remote computer refused the connection. Check the host and port in your SSH configuration, and that an SSH server is running on the remote computer."), []],
	[/ENOTFOUND|EAI_AGAIN|jump host name could not be resolved/i,
		() => localize('remotes.sshNameResolution', "The host name couldn't be resolved. Check HostName in your SSH configuration and this computer's network or DNS settings."), []],
	[/ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|jump host could not be reached|Timed out while waiting for handshake/i,
		() => localize('remotes.sshNetwork', "The remote computer couldn't be reached from this network. Check the host, the port, and any VPN connection it requires."), []],
	[sshProxyCommandNotStarted,
		() => localize('remotes.sshProxyNotFound', "The ProxyCommand program couldn't be started. Check its path in your SSH configuration, and put the path in quotes if it contains spaces."), []],
	[sshProxyFailed,
		() => localize('remotes.sshProxy', "The ProxyJump or ProxyCommand configuration failed. Make sure OpenSSH is installed on this computer and that each jump host accepts a sign-in without prompts."), []],
	[/passphrase|private key/i,
		() => localize('remotes.sshKey', "The SSH key couldn't be used. Check that the key file exists and that its passphrase is correct."), []],
];

/** Errors after signing in, while installing or starting the agent host on the remote computer. */
const sshRemoteSetupError = /agent host to register|remote CLI|VS Code CLI|download/i;

function getQualityName(quality: string): string {
	switch (quality) {
		case 'stable': return localize('remotes.qualityStable', "Stable");
		case 'insider': return localize('remotes.qualityInsiders', "Insiders");
		case 'exploration': return localize('remotes.qualityExploration', "Exploration");
		default: return quality;
	}
}

function formatVersion(name: string, version: string | undefined, build: IAgentHostBuild | undefined): string {
	const named = version ? localize('remotes.namedVersion', "{0} {1}", name, version) : name;
	return build
		? localize('remotes.versionWithBuild', "{0}, {1} build {2} from {3}", named, getQualityName(build.quality), build.commit.slice(0, 7), new Date(build.date).toLocaleDateString())
		: named;
}

/** The server's and this client's versions, which explain incompatible servers and available updates. */
function getVersionFacts(versions: IRemoteTroubleshootingInfo['versions']): { label: string; value: string }[] {
	if (!versions) {
		return [];
	}
	const facts: { label: string; value: string }[] = [];
	const { server, client, update } = versions;
	if (server) {
		const value = formatVersion(server.name, server.version, server.build);
		facts.push({ label: localize('remotes.serverVersion', "Server version"), value: server.current ? value : localize('remotes.lastKnownVersion', "{0} (as of the last connection)", value) });
	}
	facts.push({ label: localize('remotes.clientVersion', "Client version"), value: formatVersion(client.name, client.version, client.build) });
	if (update) {
		facts.push({ label: localize('remotes.serverUpdate', "Server update"), value: getUpdateLabel(update, server?.build, client.build) });
	}
	return facts;
}

function getUpdateLabel(update: NonNullable<NonNullable<IRemoteTroubleshootingInfo['versions']>['update']>, server: IAgentHostBuild | undefined, client: IAgentHostBuild | undefined): string {
	switch (update) {
		case 'available': return localize('remotes.serverUpdateAvailableFact', "A newer version is available");
		case 'upToDate': return localize('remotes.serverUpToDate', "Up to date");
		case 'unavailable': return localize('remotes.serverUpdateUnavailable', "Not available over this connection");
		case 'otherQuality': return server && client
			? localize('remotes.serverOtherQuality', "Not compared: the server's build is {0}, this client's is {1}", getQualityName(server.quality), getQualityName(client.quality))
			: localize('remotes.serverOtherQualityGeneric', "Not compared: the server and this client are different kinds of builds");
	}
}

/**
 * The `ssh` arguments that select the connection's host, offered only when they mean the same in POSIX shells,
 * PowerShell and cmd, so pasting a command with them can't run anything else. `--` keeps the destination from being read as an option.
 */
function getSSHDestinationArguments(ssh: IRemoteTroubleshootingInfo['ssh'], address: string): string | undefined {
	const destination = ssh?.alias ?? `${ssh?.user ? `${ssh.user}@` : ''}${ssh?.host ?? ssh?.hostName ?? address}`;
	const port = !ssh?.alias && ssh?.port !== undefined && ssh.port !== 22 ? ssh.port : undefined;
	if (!/^\w[\w.@:-]*$/.test(destination) || port !== undefined && !Number.isSafeInteger(port)) {
		return undefined;
	}
	return `${port !== undefined ? `-p ${port} ` : ''}-- ${destination}`;
}

/**
 * Shows the end of the remote agent host log. The path is relative to the home folder, where SSH commands start,
 * so no shell on this computer expands it.
 */
function getSSHRemoteLogCommand(destination: string | undefined, remoteLog: string | undefined): string | undefined {
	return destination && remoteLog && /^[\w.-]+(?:\/[\w.-]+)*$/.test(remoteLog) ? `ssh ${destination} tail -n 50 ${remoteLog}` : undefined;
}

/** The remote's state and connection error, explained per connection type with the actions that may unblock it. */
export function getRemoteTroubleshootingGuide(remote: ICustomizationRemote, info: IRemoteTroubleshootingInfo, error: string | undefined): IRemoteTroubleshootingGuide {
	const status = remote.connectionStatus;
	const connected = RemoteAgentHostConnectionStatus.isConnected(status);
	const pending = RemoteAgentHostConnectionStatus.isConnecting(status) || RemoteAgentHostConnectionStatus.isReconnecting(status);
	const incompatible = RemoteAgentHostConnectionStatus.isIncompatible(status);
	const upgradeMethod = RemoteAgentHostConnectionStatus.isIncompatible(status) ? status.vscodeUpgradeMethod : undefined;
	// Incompatible servers are explained per type, not by the error they report.
	const failed = !connected && !pending && !incompatible && !!error;
	const facts: { label: string; value: string }[] = [];
	const guidance: string[] = [];
	const actions: RemoteTroubleshootingAction[] = [];
	let command: IRemoteTroubleshootingGuide['command'];
	let primary: RemoteTroubleshootingAction | undefined;
	if (connected) {
		primary = remote.pickerUnavailableReason ? undefined : 'newSession';
		if (!remote.connectsWithHost) {
			actions.push('disconnect');
		}
		if (remote.canUpdateServer) {
			actions.push('updateServer');
			guidance.push(localize('remotes.serverUpdateGuidance', "Update Server installs the newer server version, which restarts the server and interrupts sessions running on it."));
		}
	} else if (pending) {
		guidance.push(RemoteAgentHostConnectionStatus.isReconnecting(status)
			? localize('remotes.troubleshootReconnecting', "The connection was lost and is reconnecting automatically.")
			: localize('remotes.troubleshootConnecting', "Connecting. This page updates when the connection succeeds or fails."));
	} else if (upgradeMethod) {
		primary = 'updateServer';
		guidance.push(localize('remotes.recoveryUpdateServer', "The server on this environment needs an update before you can connect. Select Update Server to update it and connect again."));
	} else if (remote.requiresTunnelSignIn) {
		primary = 'signIn';
	} else if (!remote.connectsWithHost && canConnectToRemote(remote)) {
		primary = failed || incompatible ? 'retry' : 'connect';
	}
	facts.push(...getVersionFacts(info.versions));
	if (RemoteAgentHostConnectionStatus.isIncompatible(status)) {
		facts.push({
			label: localize('remotes.protocolVersions', "Protocol versions"),
			value: localize('remotes.protocolVersionsValue', "This computer supports {0}. The server offers {1}.",
				status.supportedByClient.join(', '), status.offeredByServer?.length ? status.offeredByServer.join(', ') : localize('remotes.protocolUnknown', "unknown")),
		});
	}

	switch (remote.kind) {
		case 'ssh': {
			const ssh = info.ssh;
			if (ssh?.hostName) {
				facts.push({ label: localize('remotes.resolvedHost', "Resolved host"), value: ssh.port !== undefined && ssh.port !== 22 ? `${ssh.hostName}:${ssh.port}` : ssh.hostName });
			}
			if (ssh?.user) {
				facts.push({ label: localize('remotes.sshUser', "User"), value: ssh.user });
			}
			if (ssh?.identityFiles?.length) {
				facts.push({ label: localize('remotes.identityFiles', "Identity files"), value: ssh.identityFiles.join(', ') });
			}
			if (ssh?.proxyCommand) {
				facts.push({ label: localize('remotes.proxyCommand', "Proxy command"), value: ssh.proxyCommand });
			}
			if (!connected && !pending) {
				if (incompatible) {
					if (!upgradeMethod) {
						guidance.push(localize('remotes.sshIncompatible', "The agent host on the remote computer doesn't support this version of VS Code. Stop it on the remote computer, then connect again to start a compatible one."));
					}
				} else if (failed) {
					const match = sshErrors.find(([pattern]) => pattern.test(error));
					const destination = getSSHDestinationArguments(ssh, remote.detail);
					const remoteSetup = !match && sshRemoteSetupError.test(error);
					const logCommand = remoteSetup ? getSSHRemoteLogCommand(destination, ssh?.remoteLog) : undefined;
					if (match) {
						guidance.push(match[1]());
					} else if (remoteSetup) {
						guidance.push(localize('remotes.sshRemoteSetup', "Signing in worked, but starting the agent host on the remote computer failed. The remote computer needs internet access to download VS Code. If it reaches the internet through a proxy, set http_proxy and https_proxy in its shell startup file."));
						if (ssh?.remoteLog) {
							guidance.push(localize('remotes.sshRemoteLog', "The agent host log on the remote computer, ~/{0}, explains the failure.", ssh.remoteLog));
						}
					} else {
						guidance.push(destination
							? localize('remotes.sshGeneric', "Run the command below in a terminal to see where the connection fails.")
							: localize('remotes.sshGenericNoCommand', "Check the host, user, and port in your SSH configuration, and that the remote computer can be reached from this network."));
					}
					for (const action of match?.[2] ?? []) {
						if (action !== 'forgetHostKey' || ssh?.hasSavedHostKey) {
							actions.push(action);
						}
					}
					if (logCommand) {
						command = { label: localize('remotes.sshRemoteLogCommand', "Show the end of the remote agent host log in a terminal"), value: logCommand };
					} else if (destination) {
						command = { label: localize('remotes.sshTestCommand', "Test the connection in a terminal"), value: `ssh -v ${destination}` };
					}
				}
				actions.push('openSSHConfig');
			}
			break;
		}
		case 'wsl': {
			const notInstalled = remote.availability === 'offline' && !remote.startsOnConnect;
			facts.push({
				label: localize('remotes.distributionState', "Distribution state"),
				value: connected || remote.availability === 'online' ? localize('remotes.wslRunning', "Running")
					: remote.startsOnConnect ? localize('remotes.wslStopped', "Stopped")
						: notInstalled ? localize('remotes.wslNotInstalled', "Not installed")
							: localize('remotes.wslUnknown', "Unknown"),
			});
			if (!connected && !pending) {
				if (notInstalled) {
					guidance.push(localize('remotes.recoveryWSLInstalled', "This distribution isn't installed anymore. Check the installed distributions in PowerShell, or install it again."));
					command = { label: localize('remotes.wslListCommand', "List installed distributions in PowerShell"), value: 'wsl --list --verbose' };
				} else if (failed && /Unsupported WSL distro platform/i.test(error)) {
					guidance.push(localize('remotes.wslUnsupportedPlatform', "This distribution's platform isn't supported. Use an x64 or Arm64 Linux distribution."));
				} else if (failed && WSL_MUSL_SERVER_LIBRARIES.some(library => error.includes(library))) {
					// The library names and install command stay untranslated in the localized connection error.
					guidance.push(localize('remotes.wslMissingLibraries', "The VS Code server needs the libstdc++ and libgcc libraries, which Alpine and other musl-based distributions don't install by default. Install them in the distribution as root, then retry."));
					if (error.includes(WSL_INSTALL_SERVER_LIBRARIES_COMMAND) && /^[\w.-]+$/.test(remote.detail)) {
						command = { label: localize('remotes.wslInstallLibrariesCommand', "Install libstdc++ in the distribution from PowerShell"), value: `wsl -d ${remote.detail} -u root ${WSL_INSTALL_SERVER_LIBRARIES_COMMAND}` };
					}
				} else if (failed && /download|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|certificate/i.test(error)) {
					guidance.push(localize('remotes.wslDownload', "The VS Code CLI or server couldn't be downloaded. This computer downloads the CLI and the distribution downloads the server, so check the internet connection and proxy settings of both, then retry."));
				} else if (incompatible && !upgradeMethod || failed) {
					guidance.push(localize('remotes.wslRestart', "Restart the distribution to stop its agent host, then connect again to start a new one."));
				} else if (remote.startsOnConnect) {
					guidance.push(localize('remotes.recoveryWSLConnect', "This distribution isn't running. Connect starts it."));
				}
			}
			if (info.canRestartDistribution && !notInstalled && !pending && (connected || remote.availability === 'online' || failed || incompatible)) {
				actions.push('restartDistribution');
			}
			break;
		}
		case 'tunnel': {
			const tunnel = info.tunnel;
			if (tunnel?.authProvider) {
				facts.push({ label: localize('remotes.tunnelAccount', "Account"), value: tunnel.authProvider === 'github' ? localize('remotes.githubAccount', "GitHub") : localize('remotes.microsoftAccount', "Microsoft") });
			}
			if (tunnel?.inLastDiscovery !== undefined) {
				facts.push({ label: localize('remotes.tunnelDiscovered', "Found in last discovery"), value: tunnel.inLastDiscovery ? localize('remotes.yes', "Yes") : localize('remotes.no', "No") });
			}
			if (tunnel?.hostConnectionCount !== undefined) {
				facts.push({ label: localize('remotes.tunnelHosts', "Computers sharing it"), value: String(tunnel.hostConnectionCount) });
			}
			if (!connected && !pending) {
				if (remote.requiresTunnelSignIn) {
					guidance.push(localize('remotes.tunnelSignIn', "Sign in with the GitHub or Microsoft account that shares this tunnel."));
				} else if (tunnel?.inLastDiscovery === false) {
					guidance.push(localize('remotes.tunnelNotFound', "This tunnel wasn't found when tunnels were last listed. It may have been deleted, or it's shared with a different account."));
					actions.push('refresh');
				} else if (tunnel?.hostConnectionCount === 0 || remote.availability === 'offline') {
					guidance.push(localize('remotes.tunnelNoHost', "No computer is sharing this tunnel right now. On that computer, turn on Remote Tunnel Access in VS Code, or run the command below."));
					command = { label: localize('remotes.tunnelHostCommand', "Share the computer from a terminal on it"), value: 'code tunnel' };
					actions.push('refresh');
				} else if (incompatible && !upgradeMethod) {
					guidance.push(localize('remotes.tunnelIncompatible', "Update VS Code or the VS Code CLI on the computer that shares this tunnel, then retry."));
				} else if (failed && /relay|timed out|gateway/i.test(error)) {
					guidance.push(localize('remotes.tunnelRelay', "The tunnel relay didn't respond in time. Check this computer's network connection and retry. If it keeps failing, restart sharing on the other computer."));
				} else if (failed) {
					guidance.push(localize('remotes.tunnelGeneric', "Check that the computer sharing this tunnel is turned on and connected to the internet, and that it still shares the tunnel with Remote Tunnel Access or the code tunnel command. Then retry."));
				}
				if (remote.canDelete && (tunnel?.inLastDiscovery === false || remote.availability === 'offline')) {
					actions.push('deleteTunnel');
				}
			}
			break;
		}
		case 'environment': {
			if (remote.reportedSessionCount !== undefined) {
				facts.push({ label: localize('remotes.reportedSessions', "Reported sessions"), value: String(remote.reportedSessionCount) });
			}
			if (!connected && !pending) {
				if (failed && /different GitHub account|did not allow|denied/i.test(error)) {
					guidance.push(localize('remotes.environmentAccount', "GitHub didn't allow this connection. Check that you're signed in with the account that shares this environment, and your organization's settings."));
				} else if (remote.availability === 'offline') {
					guidance.push(localize('remotes.environmentOffline', "This environment is offline. Start the application that shares it on that computer, then retry. Connecting doesn't start that computer."));
				} else if (failed && /timed out/i.test(error)) {
					guidance.push(localize('remotes.environmentTimeout', "Connecting timed out. Make sure the application that shares this environment is running on that computer, then retry."));
				} else if (incompatible && !upgradeMethod) {
					guidance.push(localize('remotes.environmentIncompatible', "Update the application that shares this environment, then retry."));
				} else if (failed) {
					guidance.push(localize('remotes.environmentGeneric', "Check that the application that shares this environment is running on that computer, and that you're signed in to GitHub with an account that can use it. Then retry."));
				}
				actions.push('refresh', 'openEnvironmentSettings');
				if (remote.canRemove && remote.availability === 'offline') {
					actions.push('removeEnvironment');
				}
			}
			break;
		}
		case 'extension': {
			const extension = remote.contributedBy;
			if (extension) {
				facts.push({ label: localize('remotes.providedBy', "Provided by"), value: info.extension?.version ? localize('remotes.extensionVersion', "{0} {1}", extension.displayName, info.extension.version) : extension.displayName });
				if (!connected && !pending) {
					guidance.push(incompatible && !upgradeMethod
						? localize('remotes.extensionIncompatible', "Update the {0} extension, then retry.", extension.displayName)
						: localize('remotes.extensionGuidance', "The {0} extension provides this environment and manages its connection. Check that the extension is enabled and up to date.", extension.displayName));
				}
				actions.push('showExtension');
				if (info.extension?.issuesUrl) {
					actions.push('reportExtensionIssue');
				}
			}
			break;
		}
		case 'devContainer': {
			const container = info.devContainer;
			if (container) {
				facts.push({ label: localize('remotes.containerHost', "Host"), value: container.hostName });
				if (container.dockerAvailable) {
					facts.push({ label: localize('remotes.docker', "Docker"), value: localize('remotes.dockerAvailable', "Available") });
				}
			}
			if (!connected && !pending) {
				if (container && !container.hostConnected) {
					primary = 'connectHost';
					guidance.push(localize('remotes.containerHostDisconnected', "This Dev Container runs on {0}, which isn't connected. Connect {0} first.", container.hostName));
				} else if (failed && /Docker is not available/i.test(error)) {
					guidance.push(localize('remotes.containerDocker', "Docker isn't available on {0}. Start Docker Desktop or the Docker service, then retry.", container?.hostName ?? remote.detail));
				} else if (failed && /was deleted/i.test(error)) {
					guidance.push(localize('remotes.containerDeleted', "The container was deleted outside VS Code. Delete this Dev Container and create a new one."));
					actions.push('deleteDevContainer');
				} else if (failed && /is stopped/i.test(error)) {
					guidance.push(remote.connectsWithHost
						? localize('remotes.containerStoppedOnHost', "The container is stopped.")
						: localize('remotes.containerStopped', "The container is stopped. Connect starts it again."));
				} else if (failed && /lifecycle commands failed/i.test(error)) {
					guidance.push(localize('remotes.containerLifecycle', "The container's setup commands failed. Show the log for details."));
				} else if (failed && /timed out/i.test(error)) {
					guidance.push(localize('remotes.containerTimeout', "The agent host in the container didn't start in time. Show the log for details, then retry."));
				} else if (failed) {
					guidance.push(info.canShowLog
						? localize('remotes.containerGeneric', "Show the log to see where connecting to the container failed, then retry.")
						: localize('remotes.containerGenericNoLog', "Check that Docker is running on {0}, then retry.", container?.hostName ?? remote.detail));
				}
			}
			break;
		}
	}
	if (info.canShowLog) {
		actions.push('showLog');
	}
	// Destructive actions come last.
	actions.sort((a, b) => Number(destructiveActions.has(a)) - Number(destructiveActions.has(b)));
	return {
		facts, guidance, actions, ...(command ? { command } : {}), ...(primary ? { primary } : {}),
		documentation: incompatible ? troubleshootingDocumentation : documentation[remote.kind],
	};
}
