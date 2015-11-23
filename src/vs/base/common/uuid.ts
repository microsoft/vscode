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
	asHex():string;

	equals(other:UUID):boolean;
}

class ValueUUID implements UUID {

	constructor(public _value:string) {
		// empty
	}

	public asHex():string {
		return this._value;
	}

	public equals(other:UUID):boolean {
		return this.asHex() === other.asHex();
	}
}

class V4UUID extends ValueUUID {

	private static _chars = ['0', '1', '2', '3', '4', '5', '6', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

	private static _timeHighBits = ['8', '9', 'a', 'b'];

	private static _oneOf(array:string[]):string {
		var idx = Math.floor(array.length * Math.random());
		return array[idx];
	}

	private static _randomHex():string {
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

/**
 * An empty UUID that contains only zeros.
 */
export var empty:UUID = new ValueUUID('00000000-0000-0000-0000-000000000000');

export function v4():UUID {
	return new V4UUID();
}

var _UUIDPattern = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

/**
 * Parses a UUID that is of the format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.
 * @param value A uuid string.
 */
export function parse(value:string):UUID {
	if(!_UUIDPattern.test(value)) {
		throw new Error('invalid uuid');
	}
	return new ValueUUID(value);
}

export function generateUuid():string {
	return v4().asHex();
}