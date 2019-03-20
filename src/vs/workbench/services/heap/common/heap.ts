/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IHeapService = createDecorator<IHeapService>('heapService');

export interface ObjectIdentifier {
	$ident?: number;
}

export interface IHeapService {
	_serviceBrand: any;

	readonly onGarbageCollection: Event<number[]>;

	/**
	 * Track gc-collection for the given object
	 */
	trackObject(obj: ObjectIdentifier | undefined): void;
}



export class NullHeapService implements IHeapService {
	_serviceBrand: any;
	onGarbageCollection = Event.None;
	trackObject() { }
}
