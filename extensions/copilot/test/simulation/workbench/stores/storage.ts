/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from 'react';
import * as simulationStorage from './simulationStorage';

/**
 * A hook that returns a stateful value, and a function to update it.
 * The state is persisted to localStorage under the given key.
 * If the key is not found in localStorage, the default value is used.
 * @param key - The key to use for storing the state in localStorage.
 * @param initialVal - The initial state value, or a function that returns the initial state value.
 * @param defaultValue - The default value to use if the key is not found in localStorage.
 * @returns A tuple containing the current state value, and a function to update it.
 */
export function useLocalStorageState<S>(key: string, initialVal: S | (() => S) | undefined, defaultValue: S): [S, (newV: S | ((oldV: S | undefined) => S)) => void] {

	let initVal = initialVal;

	if (initVal === undefined) {
		initVal = getLocalStorageValue(key, defaultValue);
	}

	const [v, setV] = useState(initVal);

	const setVWithLocalStorageBacking = (newV: S | ((oldV: S | undefined) => S)) => {
		let valueToSet: S;
		if (typeof newV === 'function') {
			valueToSet = (newV as Function)(v);
		} else {
			valueToSet = newV;
		}
		setLocalStorageValue(key, valueToSet);
		setV(valueToSet);
	};

	return [v, setVWithLocalStorageBacking];
}


export function getLocalStorageValue<T>(key: string, defaultValue: T): T {
	const item = localStorage.getItem(simulationStorage.PREFIX + key);
	if (item) {
		return JSON.parse(item) as T;
	} else {
		return defaultValue;
	}
}

export function setLocalStorageValue<T>(key: string, valueToSet: T): void {
	localStorage.setItem(simulationStorage.PREFIX + key, JSON.stringify(valueToSet));
}
