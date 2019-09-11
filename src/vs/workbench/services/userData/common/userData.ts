/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export interface IUserData {
	version: number;
	content: string;
}

export enum RemoteUserDataErrorCode {
	VersionExists = 'VersionExists',
	Unknown = 'Unknown'
}

export function markAsUserDataError(error: Error, code: RemoteUserDataErrorCode): Error {
	error.name = code ? `${code} (UserDataError)` : `UserDataError`;

	return error;
}

export function toUserDataErrorCode(error: Error | undefined | null): RemoteUserDataErrorCode {

	// Guard against abuse
	if (!error) {
		return RemoteUserDataErrorCode.Unknown;
	}

	// FileSystemProviderError comes with the code
	if (error instanceof RemoteUserDataError) {
		return error.code;
	}

	// Any other error, check for name match by assuming that the error
	// went through the markAsFileSystemProviderError() method
	const match = /^(.+) \(UserDataError\)$/.exec(error.name);
	if (!match) {
		return RemoteUserDataErrorCode.Unknown;
	}

	switch (match[1]) {
		case RemoteUserDataErrorCode.VersionExists: return RemoteUserDataErrorCode.VersionExists;
	}

	return RemoteUserDataErrorCode.Unknown;
}

export class RemoteUserDataError extends Error {

	constructor(message: string, public readonly code: RemoteUserDataErrorCode) {
		super(message);
	}

}

export interface IRemoteUserDataProvider {

	read(key: string): Promise<IUserData | null>;

	write(key: string, version: number, content: string): Promise<void>;

}

export const IRemoteUserDataService = createDecorator<IRemoteUserDataService>('IRemoteUserDataService');

export interface IRemoteUserDataService {

	_serviceBrand: undefined;

	readonly onDidChangeEnablement: Event<boolean>;

	isEnabled(): boolean;

	registerRemoteUserDataProvider(name: string, remoteUserDataProvider: IRemoteUserDataProvider): void;

	deregisterRemoteUserDataProvider(): void;

	getName(): string | null;

	read(key: string): Promise<IUserData | null>;

	write(key: string, version: number, content: string): Promise<void>;

}

export enum SyncStatus {
	Uninitialized = 'uninitialized',
	Idle = 'idle',
	Syncing = 'syncing',
	HasConflicts = 'hasConflicts',
}

export interface ISynchroniser {
	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;
	sync(): Promise<boolean>;
	resolveConflicts(): void;
	apply(): void;
}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');

export interface IUserDataSyncService {
	_serviceBrand: any;
	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;
	sync(): Promise<void>;
	resolveConflicts(): void;
}
