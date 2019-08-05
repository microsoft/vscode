/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IRemoteAuthorityResolverService = createDecorator<IRemoteAuthorityResolverService>('remoteAuthorityResolverService');

export interface ResolvedAuthority {
	readonly authority: string;
	readonly host: string;
	readonly port: number;
}

export interface ResolvedOptions {
	readonly extensionHostEnv?: { [key: string]: string | null };
}

export interface ResolverResult {
	authority: ResolvedAuthority;
	options?: ResolvedOptions;
}

export enum RemoteAuthorityResolverErrorCode {
	Unknown = 'Unknown',
	NotAvailable = 'NotAvailable',
	TemporarilyNotAvailable = 'TemporarilyNotAvailable',
}

export class RemoteAuthorityResolverError extends Error {

	public static isHandledNotAvailable(err: any): boolean {
		if (err instanceof RemoteAuthorityResolverError) {
			if (err._code === RemoteAuthorityResolverErrorCode.NotAvailable && err._detail === true) {
				return true;
			}
		}

		return this.isTemporarilyNotAvailable(err);
	}

	public static isTemporarilyNotAvailable(err: any): boolean {
		if (err instanceof RemoteAuthorityResolverError) {
			return err._code === RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable;
		}
		return false;
	}

	public readonly _message: string | undefined;
	public readonly _code: RemoteAuthorityResolverErrorCode;
	public readonly _detail: any;

	constructor(message?: string, code: RemoteAuthorityResolverErrorCode = RemoteAuthorityResolverErrorCode.Unknown, detail?: any) {
		super(message);

		this._message = message;
		this._code = code;
		this._detail = detail;

		// workaround when extending builtin objects and when compiling to ES5, see:
		// https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
		if (typeof (<any>Object).setPrototypeOf === 'function') {
			(<any>Object).setPrototypeOf(this, RemoteAuthorityResolverError.prototype);
		}
	}
}

export interface IRemoteAuthorityResolverService {

	_serviceBrand: any;

	resolveAuthority(authority: string): Promise<ResolverResult>;

	clearResolvedAuthority(authority: string): void;
	setResolvedAuthority(resolvedAuthority: ResolvedAuthority, resolvedOptions?: ResolvedOptions): void;
	setResolvedAuthorityError(authority: string, err: any): void;
}
