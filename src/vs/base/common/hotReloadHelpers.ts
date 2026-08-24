/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHotReloadEnabled, registerHotReloadHandler } from './hotReload.js';
import { constObservable, IObservable, IReader, ISettableObservable, observableSignalFromEvent, observableValue } from './observable.js';

export function readHotReloadableExport<T>(value: T, reader: IReader | undefined): T {
	observeHotReloadableExports([value], reader);
	return value;
}

export function observeHotReloadableExports(values: any[], reader: IReader | undefined): void {
	if (isHotReloadEnabled()) {
		const o = observableSignalFromEvent(
			'reload',
			event => registerHotReloadHandler(({ oldExports }) => {
				if (![...Object.values(oldExports)].some(v => values.includes(v))) {
					return undefined;
				}
				return (_newExports) => {
					event(undefined);
					return true;
				};
			})
		);
		o.read(reader);
	}
}

const classes = new Map<string, ISettableObservable<unknown>>();

export function createHotClass<T>(clazz: T): IObservable<T> {
	if (!isHotReloadEnabled()) {
		return constObservable(clazz);
	}

	// eslint-disable-next-line local/code-no-any-casts
	const id = (clazz as any).name;

	let existing = classes.get(id);
	if (!existing) {
		existing = observableValue(id, clazz);
		classes.set(id, existing);
	} else {
		setTimeout(() => {
			existing!.set(clazz, undefined);
		}, 0);
	}
	return existing as IObservable<T>;
}
