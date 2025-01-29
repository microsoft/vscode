/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorNoTelemetry } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IRemoteAuthorityResolverService = createDecorator<IRemoteAuthorityResolverService>('remoteAuthorityResolverService');

export const enum RemoteConnectionType {
	WebSocket,
	Managed
}

export class ManagedRemoteConnection {
	public readonly type = RemoteConnectionType.Managed;

	constructor(
		public readonly id: number
	) { }

	public toString(): string {
		return `Managed(${this.id})`;
	}
}

export class WebSocketRemoteConnection {
	public readonly type = RemoteConnectionType.WebSocket;

	constructor(
		public readonly host: string,
		public readonly port: number,
	) { }

	public toString(): string {
		return `WebSocket(${this.host}:${this.port})`;
	}
}

export type RemoteConnection = WebSocketRemoteConnection | ManagedRemoteConnection;

export type RemoteConnectionOfType<T extends RemoteConnectionType> = RemoteConnection & { type: T };

export interface ResolvedAuthority {
	readonly authority: string;
	readonly connectTo: RemoteConnection;
	readonly connectionToken: string | undefined;
}

export interface ResolvedOptions {
	readonly extensionHostEnv?: { [key: string]: string | null };
	readonly isTrusted?: boolean;
	readonly authenticationSession?: { id: string; providerId: string };
}

export interface TunnelDescription {
	remoteAddress: { port: number; host: string };
	localAddress: { port: number; host: string } | string;
	privacy?: string;
	protocol?: string;
}
export interface TunnelPrivacy {
	themeIcon: string;
	id: string;
	label: string;
}
export interface TunnelInformation {
	environmentTunnels?: TunnelDescription[];
	features?: {
		elevation: boolean;
		public?: boolean;
		privacyOptions: TunnelPrivacy[];
		protocol: boolean;
	};
}

export interface ResolverResult {
	authority: ResolvedAuthority;
	options?: ResolvedOptions;
	tunnelInformation?: TunnelInformation;
}

export interface IRemoteConnectionData {
	connectTo: RemoteConnection;
	connectionToken: string | undefined;
}

export enum RemoteAuthorityResolverErrorCode {
	Unknown = 'Unknown',
	NotAvailable = 'NotAvailable',
	TemporarilyNotAvailable = 'TemporarilyNotAvailable',
	NoResolverFound = 'NoResolverFound',
	InvalidAuthority = 'InvalidAuthority'
}

export class RemoteAuthorityResolverError extends ErrorNoTelemetry {

	public static isNotAvailable(err: any): boolean {
		return (err instanceof RemoteAuthorityResolverError) && err._code === RemoteAuthorityResolverErrorCode.NotAvailable;
	}

	public static isTemporarilyNotAvailable(err: any): boolean {
		return (err instanceof RemoteAuthorityResolverError) && err._code === RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable;
	}

	public static isNoResolverFound(err: any): err is RemoteAuthorityResolverError {
		return (err instanceof RemoteAuthorityResolverError) && err._code === RemoteAuthorityResolverErrorCode.NoResolverFound;
	}

	public static isInvalidAuthority(err: any): boolean {
		return (err instanceof RemoteAuthorityResolverError) && err._code === RemoteAuthorityResolverErrorCode.InvalidAuthority;
	}

	public static isHandled(err: any): boolean {
		return (err instanceof RemoteAuthorityResolverError) && err.isHandled;
	}

	public readonly _message: string | undefined;
	public readonly _code: RemoteAuthorityResolverErrorCode;
	public readonly _detail: any;

	public isHandled: boolean;

	constructor(message?: string, code: RemoteAuthorityResolverErrorCode = RemoteAuthorityResolverErrorCode.Unknown, detail?: any) {
		super(message);

		this._message = message;
		this._code = code;
		this._detail = detail;

		this.isHandled = (code === RemoteAuthorityResolverErrorCode.NotAvailable) && detail === true;

		// workaround when extending builtin objects and when compiling to ES5, see:
		// https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, RemoteAuthorityResolverError.prototype);
	}
}

export interface IRemoteAuthorityResolverService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeConnectionData: Event<void>;

	resolveAuthority(authority: string): Promise<ResolverResult>;
	getConnectionData(authority: string): IRemoteConnectionData | null;
	/**
	 * Get the canonical URI for a `vscode-remote://` URI.
	 *
	 * **NOTE**: This can throw e.g. in cases where there is no resolver installed for the specific remote authority.
	 *
	 * @param uri The `vscode-remote://` URI
	 */
	getCanonicalURI(uri: URI): Promise<URI>;

	_clearResolvedAuthority(authority: string): void;
	_setResolvedAuthority(resolvedAuthority: ResolvedAuthority, resolvedOptions?: ResolvedOptions): void;
	_setResolvedAuthorityError(authority: string, err: any): void;
	_setAuthorityConnectionToken(authority: string, connectionToken: string): void;
	_setCanonicalURIProvider(provider: (uri: URI) => Promise<URI>): void;
}

export function getRemoteAuthorityPrefix(remoteAuthority: string): string {
	const plusIndex = remoteAuthority.indexOf('+');
	if (plusIndex === -1) {
		return remoteAuthority;
	}
	return remoteAuthority.substring(0, plusIndex);
}
