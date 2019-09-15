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

export enum UserDataSyncStoreErrorCode {
	Rejected = 'Rejected',
	Unknown = 'Unknown'
}

export function markAsUserDataSyncStoreError(error: Error, code: UserDataSyncStoreErrorCode): Error {
	error.name = code ? `${code} (UserDataSyncStoreError)` : `UserDataSyncStoreError`;

	return error;
}

export function toUserDataSyncStoreErrorCode(error: Error | undefined | null): UserDataSyncStoreErrorCode {

	// Guard against abuse
	if (!error) {
		return UserDataSyncStoreErrorCode.Unknown;
	}

	// FileSystemProviderError comes with the code
	if (error instanceof UserDataSyncStoreError) {
		return error.code;
	}

	// Any other error, check for name match by assuming that the error
	// went through the markAsUserDataSyncStoreError() method
	const match = /^(.+) \(UserDataSyncStoreError\)$/.exec(error.name);
	if (!match) {
		return UserDataSyncStoreErrorCode.Unknown;
	}

	switch (match[1]) {
		case UserDataSyncStoreErrorCode.Rejected: return UserDataSyncStoreErrorCode.Rejected;
	}

	return UserDataSyncStoreErrorCode.Unknown;
}

export class UserDataSyncStoreError extends Error {

	constructor(message: string, public readonly code: UserDataSyncStoreErrorCode) {
		super(message);
	}

}

export interface IUserDataSyncStore {

	read(key: string): Promise<IUserData | null>;

	write(key: string, content: string, ref: string | null): Promise<string>;

}

export const IUserDataSyncStoreService = createDecorator<IUserDataSyncStoreService>('IUserDataSyncStoreService');

export interface IUserDataSyncStoreService {

	_serviceBrand: undefined;

	readonly onDidChangeEnablement: Event<boolean>;

	isEnabled(): boolean;

	registerUserDataSyncStore(name: string, userDataSyncStore: IUserDataSyncStore): void;

	deregisterUserDataSyncStore(): void;

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
	readonly onDidChangeLocal: Event<void>;
	sync(): Promise<boolean>;
	continueSync(): Promise<boolean>;
	handleConflicts(): boolean;
}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');

export interface IUserDataSyncService extends ISynchroniser {
	_serviceBrand: any;
}
