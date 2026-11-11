/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { StorageValue } from '../../../../base/parts/storage/common/storage.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IApplicationSharedStorageValueChangeEvent, IApplicationStorageValueChangeEvent, IProfileStorageValueChangeEvent, IStorageEntry, IStorageService, IStorageTargetChangeEvent, IStorageValueChangeEvent, IWillSaveStateEvent, IWorkspaceStorageValueChangeEvent, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

/**
 * The storage the sessions list and the services behind it keep their state in, such as its grouping, filters and
 * groups. It is the window's storage, unless the window shares that state with another window: an editor window with
 * the Sessions view keeps the profile state of the list in the profile of the Agents window, so both show the same list.
 */
export const ISessionsStorageService = createDecorator<IStorageService>('sessionsStorageService');

/** The window's storage, as {@link ISessionsStorageService}. */
export class SessionsStorageService implements IStorageService {

	declare readonly _serviceBrand: undefined;

	constructor(@IStorageService protected readonly storageService: IStorageService) { }

	get onDidChangeTarget(): Event<IStorageTargetChangeEvent> { return this.storageService.onDidChangeTarget; }
	get onWillSaveState(): Event<IWillSaveStateEvent> { return this.storageService.onWillSaveState; }

	onDidChangeValue(scope: StorageScope.WORKSPACE, key: string | undefined, disposable: DisposableStore): Event<IWorkspaceStorageValueChangeEvent>;
	onDidChangeValue(scope: StorageScope.PROFILE, key: string | undefined, disposable: DisposableStore): Event<IProfileStorageValueChangeEvent>;
	onDidChangeValue(scope: StorageScope.APPLICATION, key: string | undefined, disposable: DisposableStore): Event<IApplicationStorageValueChangeEvent>;
	onDidChangeValue(scope: StorageScope.APPLICATION_SHARED, key: string | undefined, disposable: DisposableStore): Event<IApplicationSharedStorageValueChangeEvent>;
	onDidChangeValue(scope: StorageScope, key: string | undefined, disposable: DisposableStore): Event<IStorageValueChangeEvent>;
	onDidChangeValue(scope: StorageScope, key: string | undefined, disposable: DisposableStore): Event<IStorageValueChangeEvent> {
		return this.storageService.onDidChangeValue(scope, key, disposable);
	}

	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		return this.storageService.get(key, scope, fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		return this.storageService.getBoolean(key, scope, fallbackValue);
	}

	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		return this.storageService.getNumber(key, scope, fallbackValue);
	}

	getObject<T extends object>(key: string, scope: StorageScope, fallbackValue: T): T;
	getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined;
	getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined {
		return this.storageService.getObject(key, scope, fallbackValue);
	}

	readApplicationSharedValue(key: string): Promise<string | undefined> {
		return this.storageService.readApplicationSharedValue(key);
	}

	compareAndSwapApplicationSharedValue(key: string, expectedValue: string | undefined, newValue: string): Promise<{ swapped: boolean; currentValue: string | undefined }> {
		return this.storageService.compareAndSwapApplicationSharedValue(key, expectedValue, newValue);
	}

	store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget): void {
		this.storageService.store(key, value, scope, target);
	}

	storeAll(entries: Array<IStorageEntry>, external: boolean): void {
		this.storageService.storeAll(entries, external);
	}

	remove(key: string, scope: StorageScope): void {
		this.storageService.remove(key, scope);
	}

	keys(scope: StorageScope, target: StorageTarget): string[] {
		return this.storageService.keys(scope, target);
	}

	log(): void {
		this.storageService.log();
	}

	hasScope(scope: IAnyWorkspaceIdentifier | IUserDataProfile): boolean {
		return this.storageService.hasScope(scope);
	}

	switch(to: IAnyWorkspaceIdentifier | IUserDataProfile, preserveData: boolean): Promise<void> {
		return this.storageService.switch(to, preserveData);
	}

	isNew(scope: StorageScope): boolean {
		return this.storageService.isNew(scope);
	}

	optimize(scope: StorageScope): Promise<void> {
		return this.storageService.optimize(scope);
	}

	flush(reason?: WillSaveStateReason): Promise<void> {
		return this.storageService.flush(reason);
	}
}
