/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../types/src';
import * as lsp from 'vscode-languageserver-protocol';
/**
 * Altered to have a void return type, so eslint can flag misused promises.
 */
export interface Event<T> {
	/**
	 *
	 * @param listener The listener function will be called when the event happens.
	 * @param thisArgs The 'this' which will be used when calling the event listener.
	 * @param disposables An array to which a {{Disposable}} will be added.
	 * @returns A disposable which unsubscribes the event listener.
	 */
	(listener: (e: T) => void, thisArgs?: unknown, disposables?: Disposable[]): Disposable;
}

/**
 * Altered to use the above Event interface.
 */
export class Emitter<T> extends lsp.Emitter<T> {
	override get event(): Event<T> {
		return super.event;
	}
}

/**
 * Transforms an event by applying a transformation function to the event's value.
 * Mostly useful for tranforming native VS Code events into our own.
 * If the transformation function returns `undefined`, the listener will not be called.
 */
export function transformEvent<T, R extends object>(event: Event<T>, transform: (value: T) => R | undefined): Event<R> {
	return (listener, thisArgs, disposables) => {
		if (thisArgs) { listener = listener.bind(thisArgs); }
		const wrappedListener = (value: T) => {
			const transformed = transform(value);
			if (transformed !== undefined) { listener(transformed); }
		};
		return event(wrappedListener, undefined, disposables);
	};
}
