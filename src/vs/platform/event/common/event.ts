/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export const IEventService = createDecorator<IEventService>('eventService');

export interface IEventService {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Allows to add a listener to the platform event bus for all emitters that are known to the platform.
	 */
	addListener(eventType: string, listener: (event: any) => void): () => void;

	/**
	 * Allows to add a listener to the platform event bus for all emitters that are known to the platform.
	 */
	addListener2(eventType: string, listener: (event: any) => void): IDisposable;

	/**
	 * Allows to add a listener to an emitter on the platform event bus with the given type identifier.
	 */
	addEmitterTypeListener(eventType: string, emitterType: string, listener: (event: any) => void): () => void;

	/**
	 * Allows to add an event emitter to the platform bus such as Events from the emitter
	 * can be received from all listeners on the bus.
	 */
	addEmitter(eventEmitter: IEventEmitter, emitterType?: string): () => void;

	/**
	 * Emits an event of the given type into the platform event bus.
	 * Note: Instead of emitting directly to the platform bus, it is also possible to register
	 * as event emitter to the bus using addEmitter() with a emitterType specified. This
	 * makes it possible to scope Events on the bus to a specific namespace, depending on the
	 * emitter and avoids polluting the global namespace in the bus with Events.
	 */
	emit(eventType: string, e?: any): void;
}