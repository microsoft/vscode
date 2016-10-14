/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event } from 'vscode';

export interface IDisposable {
	dispose(): void;
}

export function dispose<T extends IDisposable>(disposables: T[]): T[] {
	disposables.forEach(d => d.dispose());
	return [];
}

export function combinedDisposable(disposables: IDisposable[]): IDisposable {
	return { dispose: () => dispose(disposables) };
}

export function mapEvent<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
	return (listener, thisArgs = null, disposables?) => event(i => listener.call(thisArgs, map(i)), null, disposables);
}

export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
	return (listener, thisArgs = null, disposables?) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}

export function any<T>(...events: Event<T>[]): Event<T> {
	return (listener, thisArgs = null, disposables?) => combinedDisposable(events.map(event => event(i => listener.call(thisArgs, i), disposables)));
}

interface IListener<T> {
	(e: T): any;
}

export class Emitter<T> {

	private listeners: IListener<T>[];

	get event(): Event<T> {
		return (listener: IListener<T>, thisArgs = null, disposables?: IDisposable[]) => {
			const _listener = thisArgs ? listener.bind(thisArgs) : listener;
			this.listeners.push(_listener);

			const dispose = () => { this.listeners = this.listeners.filter(l => l !== _listener); };
			const result = { dispose };

			if (disposables) {
				disposables.push(result);
			}

			return result;
		};
	}

	fire(e: T = null): void {

	}
}