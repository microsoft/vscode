/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IUserDataSyncStore, IUserData } from 'vs/platform/userDataSync/common/userDataSync';

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
