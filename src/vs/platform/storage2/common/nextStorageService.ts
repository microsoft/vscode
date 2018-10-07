/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export const ID = 'nextStorageService';

export const INextStorageService = createDecorator<INextStorageService>(ID);

export type WorkspaceIdentifier = string;

export interface INextStorageServiceChangeEvent {
	workspace?: WorkspaceIdentifier;
}

// TODO
// - how fine grained can the storage change event be? Include more details like key/value? should it only fire for global events?
export interface INextStorageService {
	_serviceBrand: any;

	readonly onDidChangeStorage: Event<INextStorageServiceChangeEvent>;

	set(key: string, value: string, workspace?: WorkspaceIdentifier): void;

	get(key: string, workspace?: WorkspaceIdentifier): string;

	delete(key: string, workspace?: WorkspaceIdentifier): void;
}