/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Represents a UUID as defined by rfc4122.
 */
export interface UUID {

	/**
	 * @returns the canonical representation in sets of hexadecimal numbers separated by dashes.
	 */
	asHex(): string;

	equals(other: UUID): boolean;
}

class ValueUUID implements UUID {

	constructor(public _value: string) {
		// empty
	}

	public asHex(): string {
		return this._value;
	}

	public equals(other: UUID): boolean {
		return this.asHex() === other.asHex();
	}
}

class V4UUID extends ValueUUID {

	private static _chars = ['0', '1', '2', '3', '4', '5', '6', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

	private static _timeHighBits = ['8', '9', 'a', 'b'];

	private static _oneOf(array: string[]): string {
		return array[Math.floor(array.length * Math.random())];
	}

	private static _randomHex(): string {
		return V4UUID._oneOf(V4UUID._chars);
	}

	constructor() {
		super([
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			'-',
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			'-',
			'4',
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			'-',
			V4UUID._oneOf(V4UUID._timeHighBits),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			'-',
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
			V4UUID._randomHex(),
		].join(''));
	}
}

export function v4(): UUID {
	return new V4UUID();
}

const _UUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
	return _UUIDPattern.test(value);
}

/**
 * Parses a UUID that is of the format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.
 * @param value A uuid string.
 */
export function parse(value: string): UUID {
	if (!isUUID(value)) {
		throw new Error('invalid uuid');
	}

	return new ValueUUID(value);
}

export function generateUuid(): string {
	return v4().asHex();
}
