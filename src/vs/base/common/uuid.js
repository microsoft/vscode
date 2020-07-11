/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

//@ts-check

function factory() {

	const _UUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	/**
	 * @param {string} value
	 * @returns {boolean}
	 */
	function isUUID(value) {
		return _UUIDPattern.test(value);
	}

	// prep-work
	const _data = new Uint8Array(16);
	const _hex = [];
	for (let i = 0; i < 256; i++) {
		_hex.push(i.toString(16).padStart(2, '0'));
	}

	// todo@joh node nodejs use `crypto#randomBytes`, see: https://nodejs.org/docs/latest/api/crypto.html#crypto_crypto_randombytes_size_callback
	// todo@joh use browser-crypto
	/**
	 * @param {Uint8Array} bucket
	 * @returns {Uint8Array}
	 */
	const _fillRandomValues = function (bucket) {
		for (let i = 0; i < bucket.length; i++) {
			bucket[i] = Math.floor(Math.random() * 256);
		}
		return bucket;
	};

	/**
	 * @returns {string}
	 */
	function generateUuid() {
		// get data
		_fillRandomValues(_data);

		// set version bits
		_data[6] = (_data[6] & 0x0f) | 0x40;
		_data[8] = (_data[8] & 0x3f) | 0x80;

		// print as string
		let i = 0;
		let result = '';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += '-';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += '-';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += '-';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += '-';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		return result;
	}

	return {
		isUUID,
		generateUuid
	};
}

if (typeof define === 'function') {
	// amd
	define([], function () { return factory(); });
} else if (typeof module === 'object' && typeof module.exports === 'object') {
	module.exports = factory();
} else {
	throw new Error('Unknown context');
}
