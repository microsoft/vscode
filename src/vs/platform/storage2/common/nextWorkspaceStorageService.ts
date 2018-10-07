/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export const ID = 'nextWorkspaceStorageService';

export const INextWorkspaceStorageService = createDecorator<INextWorkspaceStorageService>(ID);

// TODO
// - how fine grained can the storage change event be? Include more details like key/value? should it only fire for global events?
export interface INextWorkspaceStorageService {
	_serviceBrand: any;

	readonly onDidChangeStorage: Event<NextStorageScope>;

	set(key: string, value: any, scope?: NextStorageScope): void;

	get(key: string, scope?: NextStorageScope, fallbackValue?: string): string;
	getBoolean(key: string, scope?: NextStorageScope, fallbackValue?: boolean): boolean;
	getInteger(key: string, scope?: NextStorageScope, fallbackValue?: number): number;

	delete(key: string, scope?: NextStorageScope): void;
}

export const enum NextStorageScope {

	/**
	 * The stored data will be scoped to all workspaces globally.
	 */
	GLOBAL,

	/**
	 * The stored data will be scoped to the current workspace.
	 */
	WORKSPACE
}