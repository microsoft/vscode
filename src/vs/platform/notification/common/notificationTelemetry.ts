/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../base/common/actions.js';
import { EXTENSION_IDENTIFIER_REGEX } from '../../extensionManagement/common/extensionManagement.js';

/** Audited, content-independent types. These IDs must not be used for notification deduplication. */
export enum NotificationTelemetryId {
	AgentHostProgress = 'agentHost.progress',
	AuthenticationSignIn = 'authentication.signIn',
	AuthenticationContinue = 'authentication.continue',
	ExtensionsActivation = 'extensions.activation',
	ExtensionInstall = 'extensions.install',
	ExtensionDownload = 'extensions.downloadVsix',
	ExtensionDownloadComplete = 'extensions.downloadVsix.complete',
	ExtensionDownloadError = 'extensions.downloadVsix.error',
	ExtensionsDisabled = 'extensions.disabled',
	ExtensionDependencyLoop = 'extensions.dependencyLoop',
	ExtensionsAutoRestart = 'extensions.autoRestart',
	ExtensionHostUnresponsive = 'extensions.host.unresponsive',
	ExtensionHostVersionMismatch = 'extensions.host.versionMismatch',
	ExtensionHostCrashRepeated = 'extensions.host.crashRepeated',
	RemoteExtensionHostCrashRepeated = 'extensions.remoteHost.crashRepeated',
	RemoteReconnect = 'remote.reconnect',
	RemoteAgentHostSSHConnect = 'remoteAgentHost.ssh.connect',
	RemoteAgentHostSSHConnectError = 'remoteAgentHost.ssh.connectError',
	RemoteAgentHostTunnelConnect = 'remoteAgentHost.tunnel.connect',
	RemoteAgentHostTunnelConnectError = 'remoteAgentHost.tunnel.connectError',
	RemoteAgentHostTunnelAuthenticationError = 'remoteAgentHost.tunnel.authenticationError',
	RemoteAgentHostWSLConnect = 'remoteAgentHost.wsl.connect',
	RemoteAgentHostWSLConnectError = 'remoteAgentHost.wsl.connectError',
	RemoteAgentHostUpdate = 'remoteAgentHost.update',
	RemoteAgentHostReconnect = 'remoteAgentHost.reconnect',
	PluginPackageOperation = 'plugins.packageOperation',
	PluginUpdate = 'plugins.update',
	PluginRepositoryClone = 'plugins.repository.clone',
	PluginRepositoryUpdate = 'plugins.repository.update',
	PluginRepositoryRepair = 'plugins.repository.repair',
	DictationModelPrepare = 'dictation.model.prepare',
	DictationModelImport = 'dictation.model.import',
	FileSaveParticipants = 'files.saveParticipants',
	WorkingCopySaveParticipants = 'files.workingCopySaveParticipants',
	FileOperationParticipants = 'files.operationParticipants',
}

export enum NotificationActionTelemetryId {
	ProgressCancel = 'progress.cancel',
	ManageExtension = 'manageExtension',
	NeverShowAgain = 'neverShowAgain',
	Reload = 'reload',
	Relaunch = 'relaunch',
	RestartExtensionHost = 'restartExtensionHost',
	Continue = 'continue',
	Decline = 'decline',
	Copy = 'copy',
	Configure = 'configure',
}

const extensionTelemetryBrand = Symbol('extensionNotificationTelemetry');

export interface IExtensionNotificationTelemetry {
	readonly [extensionTelemetryBrand]: true;
}

export type NotificationTelemetry = NotificationTelemetryId | IExtensionNotificationTelemetry;

export interface INotificationTelemetrySource {
	readonly origin: 'core' | 'extension' | 'unknown';
	readonly notificationId: NotificationTelemetryId | 'extension.message' | 'extension.progress' | 'unknown';
	readonly extensionId: string;
}

const notificationIds = new Set<string>(Object.values(NotificationTelemetryId));
const actionIds = new Set<string>(Object.values(NotificationActionTelemetryId));
const extensionSources = new WeakMap<IExtensionNotificationTelemetry, INotificationTelemetrySource>();
const unknownSource: INotificationTelemetrySource = Object.freeze({ origin: 'unknown', notificationId: 'unknown', extensionId: 'unknown' });

/** Only call from extension bridges with an identifier from the extension description, never a display source. */
export function extensionNotificationTelemetry(extensionId: string | undefined, kind: 'message' | 'progress'): IExtensionNotificationTelemetry {
	const telemetry = Object.freeze({ [extensionTelemetryBrand]: true } as const);
	extensionSources.set(telemetry, Object.freeze({
		origin: 'extension',
		notificationId: kind === 'message' ? 'extension.message' : 'extension.progress',
		extensionId: typeof extensionId === 'string' && extensionId.length <= 255 && EXTENSION_IDENTIFIER_REGEX.test(extensionId) ? extensionId.toLowerCase() : 'unknown'
	}));
	return telemetry;
}

export function getNotificationTelemetrySource(telemetry: NotificationTelemetry | undefined): INotificationTelemetrySource {
	if (typeof telemetry === 'string' && notificationIds.has(telemetry)) {
		return Object.freeze({ origin: 'core', notificationId: telemetry, extensionId: 'none' });
	}
	if (typeof telemetry === 'object' && telemetry !== null) {
		return extensionSources.get(telemetry) ?? unknownSource;
	}
	return unknownSource;
}

export type NotificationActionTelemetry = NotificationActionTelemetryId | { readonly extensionButtonIndex: number };

const actionTelemetry = new WeakMap<IAction, NotificationActionTelemetry>();

/** Associates audited metadata with an action without changing its execution or existing command ID. */
export function withNotificationActionTelemetry<T extends IAction>(action: T, telemetry: NotificationActionTelemetry | undefined): T {
	if (typeof telemetry === 'string' && actionIds.has(telemetry)) {
		actionTelemetry.set(action, telemetry);
	} else if (typeof telemetry === 'object' && telemetry !== null && Number.isSafeInteger(telemetry.extensionButtonIndex) && telemetry.extensionButtonIndex >= 0 && telemetry.extensionButtonIndex <= 1000) {
		actionTelemetry.set(action, Object.freeze({ extensionButtonIndex: telemetry.extensionButtonIndex }));
	}
	return action;
}

export function getNotificationActionTelemetry(action: IAction): NotificationActionTelemetry | undefined {
	return actionTelemetry.get(action);
}
