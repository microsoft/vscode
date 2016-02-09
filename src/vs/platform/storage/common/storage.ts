/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {PropertyChangeEvent} from 'vs/base/common/events';
import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export const ID = 'storageService';

export const IStorageService = createDecorator<IStorageService>(ID);

export interface IStorageService extends IEventEmitter {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Store a string value under the given key to local storage.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	store(key: string, value: any, scope?: StorageScope): void;

	/**
	 * Swap the value of a stored element to one of the two provided
	 * values and use the defaultValue if no element with the given key
	 * exists.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	swap(key: string, valueA: any, valueB: any, scope?: StorageScope, defaultValue?: any): void;

	/**
	 * Delete an element stored under the provided key from local storage.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	remove(key: string, scope?: StorageScope): void;

	/**
	 * Retrieve an element stored with the given key from local storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	get(key: string, scope?: StorageScope, defaultValue?: string): string;

	/**
	 * Retrieve an element stored with the given key from local storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	getInteger(key: string, scope?: StorageScope, defaultValue?: number): number;

	/**
	 * Retrieve an element stored with the given key from local storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	getBoolean(key: string, scope?: StorageScope, defaultValue?: boolean): boolean;
}

export namespace StorageEventType {

	/**
	 * Event type for when a storage value is changed.
	 */
	export const STORAGE = 'storage';
}

/**
 * Storage events are being emitted when user settings change which are persisted to local storage.
 */
export class StorageEvent extends PropertyChangeEvent {

	constructor(key: string, before: any, after: any, originalEvent?: any) {
		super(key, before, after, originalEvent);
	}

	/**
	 * Returns true if the storage change has occurred from this browser window and false if its coming from a different window.
	 */
	public isLocal(): boolean {

		// By the spec a storage event is only ever emitted if it occurs from a different browser tab or window
		// so we can use the check for originalEvent being set or not as a way to find out if the event is local or not.
		return !this.originalEvent;
	}
}

export enum StorageScope {

	/**
	 * The stored data will be scoped to all workspaces of this domain.
	 */
	GLOBAL,

	/**
	 * The stored data will be scoped to the current workspace.
	 */
	WORKSPACE
}