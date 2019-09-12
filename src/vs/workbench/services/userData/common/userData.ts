/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

export interface IUserData {
	ref: string;
	content: string;
}

export enum RemoteUserDataErrorCode {
	Rejected = 'Rejected',
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
		case RemoteUserDataErrorCode.Rejected: return RemoteUserDataErrorCode.Rejected;
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

	write(key: string, content: string, ref: string | null): Promise<string>;

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

	write(key: string, content: string, ref: string | null): Promise<string>;

}

export enum SyncStatus {
	Uninitialized = 'uninitialized',
	Idle = 'idle',
	Syncing = 'syncing',
	HasConflicts = 'hasConflicts',
}

export const USER_DATA_PREVIEW_SCHEME = 'vscode-userdata-preview';
export const SETTINGS_PREVIEW_RESOURCE = URI.file('Settings-Preview').with({ scheme: USER_DATA_PREVIEW_SCHEME });

export interface ISynchroniser {
	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;
	sync(): Promise<boolean>;
	handleConflicts(): boolean;
	apply(previewResource: URI): Promise<boolean>;
}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');

export interface IUserDataSyncService extends ISynchroniser {
	_serviceBrand: any;
}
