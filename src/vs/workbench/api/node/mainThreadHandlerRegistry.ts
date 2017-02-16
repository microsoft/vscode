/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * MainThreadHandlerRegistry maintains a collection of objects by handle.
 */
export class MainThreadHandlerRegistry<T> {

	private _nextChildHandle: number = 0;
	private _registrations: { [handle: number]: { [childHandle: number]: T }; } = Object.create(null);

	/**
	 * registerChild registers a child object of handle.
	 * It returns the new handle assigned to the child.
	 */
	registerChild(handle: number, child: T): number {
		const childHandle = this._nextChildHandle;
		this._nextChildHandle++;
		if (!this._registrations[handle]) {
			this._registrations[handle] = Object.create(null);
		}
		this._registrations[handle][childHandle] = child;
		return childHandle;
	}

	/**
	 * getChild returns the object associated with handle and childHandle, if it exists.
	 */
	getChild(handle: number, childHandle: number): T | undefined {
		if (!this._registrations[handle]) {
			return undefined;
		}
		return this._registrations[handle][childHandle];
	}

	/**
	 * unregister unregisters all child objects of handle.
	 */
	unregister(handle: number): void {
		delete this._registrations[handle];
	}

	/**
	 * unregisterChild unregisters the object associated with handle and childHandle.
	 */
	unregisterChild(handle: number, childHandle: number): void {
		if (this._registrations[handle]) {
			delete this._registrations[handle][childHandle];
		}
	}
}
