/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI, UriComponents, UriDto } from '../../../../base/common/uri.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { ILoggerResource, LogLevel } from '../../../../platform/log/common/log.js';
import { IRemoteConnectionData } from '../../../../platform/remote/common/remoteAuthorityResolver.js';

export interface IExtensionDescriptionSnapshot {
	readonly versionId: number;
	readonly allExtensions: IExtensionDescription[];
	readonly activationEvents: { [extensionId: string]: string[] };
	readonly myExtensions: ExtensionIdentifier[];
}

export interface IExtensionDescriptionDelta {
	readonly versionId: number;
	readonly toRemove: ExtensionIdentifier[];
	readonly toAdd: IExtensionDescription[];
	readonly addActivationEvents: { [extensionId: string]: string[] };
	readonly myToRemove: ExtensionIdentifier[];
	readonly myToAdd: ExtensionIdentifier[];
}

export interface IExtensionHostInitData {
	version: string;
	quality: string | undefined;
	commit?: string;
	date?: string;
	/**
	 * When set to `0`, no polling for the parent process still running will happen.
	 */
	parentPid: number | 0;
	environment: IEnvironment;
	workspace?: IStaticWorkspaceData | null;
	extensions: IExtensionDescriptionSnapshot;
	nlsBaseUrl?: URI;
	telemetryInfo: {
		readonly sessionId: string;
		readonly machineId: string;
		readonly sqmId: string;
		readonly devDeviceId: string;
		readonly firstSessionDate: string;
		readonly msftInternal?: boolean;
	};
	logLevel: LogLevel;
	loggers: UriDto<ILoggerResource>[];
	logsLocation: URI;
	autoStart: boolean;
	remote: { isRemote: boolean; authority: string | undefined; connectionData: IRemoteConnectionData | null };
	consoleForward: { includeStack: boolean; logNative: boolean };
	uiKind: UIKind;
	messagePorts?: ReadonlyMap<string, MessagePortLike>;
	handle?: string;
}

export interface IEnvironment {
	isExtensionDevelopmentDebug: boolean;
	appName: string;
	appHost: string;
	appRoot?: URI;
	appLanguage: string;
	isExtensionTelemetryLoggingOnly: boolean;
	appUriScheme: string;
	extensionDevelopmentLocationURI?: URI[];
	extensionTestsLocationURI?: URI;
	globalStorageHome: URI;
	workspaceStorageHome: URI;
	useHostProxy?: boolean;
	skipWorkspaceStorageLock?: boolean;
	extensionLogLevel?: [string, LogLevel][];
}

export interface IStaticWorkspaceData {
	id: string;
	name: string;
	transient?: boolean;
	configuration?: UriComponents | null;
	isUntitled?: boolean | null;
}

export interface MessagePortLike {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	addEventListener(type: 'message', listener: (e: MessageEvent<unknown>) => unknown): void;
	removeEventListener(type: 'message', listener: (e: MessageEvent<unknown>) => unknown): void;
	start(): void;
}

export enum UIKind {
	Desktop = 1,
	Web = 2
}

export const enum ExtensionHostExitCode {
	// nodejs uses codes 1-13 and exit codes >128 are signal exits
	VersionMismatch = 55,
	UnexpectedError = 81,
}

export interface IExtHostReadyMessage {
	type: 'VSCODE_EXTHOST_IPC_READY';
}

export interface IExtHostSocketMessage {
	type: 'VSCODE_EXTHOST_IPC_SOCKET';
	initialDataChunk: string;
	skipWebSocketFrames: boolean;
	permessageDeflate: boolean;
	inflateBytes: string;
}

export interface IExtHostReduceGraceTimeMessage {
	type: 'VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME';
}

export const enum MessageType {
	Initialized,
	Ready,
	Terminate
}

export function createMessageOfType(type: MessageType): VSBuffer {
	const result = VSBuffer.alloc(1);

	switch (type) {
		case MessageType.Initialized: result.writeUInt8(1, 0); break;
		case MessageType.Ready: result.writeUInt8(2, 0); break;
		case MessageType.Terminate: result.writeUInt8(3, 0); break;
	}

	return result;
}

export function isMessageOfType(message: VSBuffer, type: MessageType): boolean {
	if (message.byteLength !== 1) {
		return false;
	}

	switch (message.readUInt8(0)) {
		case 1: return type === MessageType.Initialized;
		case 2: return type === MessageType.Ready;
		case 3: return type === MessageType.Terminate;
		default: return false;
	}
}

export const enum NativeLogMarkers {
	Start = 'START_NATIVE_LOG',
	End = 'END_NATIVE_LOG',
}
