/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function coerceImageBuffer(value: unknown): Uint8Array | undefined {
	if (value instanceof Uint8Array) {
		return value;
	}
	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort((a, b) => Number(a) - Number(b));
	if (keys.length === 0) {
		return undefined;
	}

	const result = new Uint8Array(keys.length);
	for (let index = 0; index < keys.length; index++) {
		const byte = record[keys[index]];
		if (keys[index] !== String(index) || typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255) {
			return undefined;
		}
		result[index] = byte;
	}
	return result;
}
