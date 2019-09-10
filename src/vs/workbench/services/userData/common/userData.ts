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
	InvalidVersion = 'InvalidVersion'
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
	Syncing = 1,
	SyncDone
}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');

export interface IUserDataSyncService {

	_serviceBrand: any;

	readonly syncStatus: SyncStatus;

	readonly onDidChangeSyncStatus: Event<SyncStatus>;

	synchronise(): Promise<void>;

}
