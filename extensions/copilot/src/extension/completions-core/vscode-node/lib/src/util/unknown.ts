/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Type guard to check if an unknown value is an object with a given key. */
function hasKey<K extends PropertyKey, R = unknown>(value: unknown, key: K): value is { [key in K]: R } {
	return value !== null && typeof value === 'object' && key in value;
}

/**
 * Attempts to index an unknown value as an object.
 * Returns undefined if the key does not exist on the object.
 */
export function getKey<K extends PropertyKey, R = unknown>(value: unknown, key: K): R | undefined {
	return hasKey<K, R>(value, key) ? value[key] : undefined;
}
