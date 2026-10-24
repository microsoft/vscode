/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';

/** What opening a chat window has set up so far, which a failure has to take down again. */
export interface IChatWindowOpening {
	readonly disposables: DisposableStore;
	/** Closes the part of the window, once it is created. */
	close?: () => boolean;
}

/** Runs `open`, and when it fails, disposes what it set up and closes the part it created, before rethrowing. */
export async function openCleaningUpOnFailure<T>(open: (opening: IChatWindowOpening) => Promise<T>): Promise<T> {
	const opening: IChatWindowOpening = { disposables: new DisposableStore() };
	try {
		return await open(opening);
	} catch (error) {
		opening.disposables.dispose();
		opening.close?.();
		throw error;
	}
}

/** Gives the same promise to everyone who asks for the same key while it is pending. */
export class InFlightOperations<T> {

	private readonly _pending = new Map<string, Promise<T>>();

	run(key: string, operation: () => Promise<T>): Promise<T> {
		const pending = this._pending.get(key);
		if (pending) {
			return pending;
		}
		const promise = operation().finally(() => this._pending.delete(key));
		this._pending.set(key, promise);
		return promise;
	}
}

/**
 * Holds the loaded model of a chat while it moves between views, such as from the main window's grid to a chat window:
 * the model is released when its last view lets go, so without it the view that takes over loads the history again.
 * `acquire` gives a reference to the model if it is loaded.
 */
export function holdLoadedChat(acquire: () => IDisposable | undefined): IDisposable {
	return acquire() ?? { dispose: () => { } };
}
