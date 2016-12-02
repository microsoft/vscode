/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as getmac from 'getmac';
import * as crypto from 'crypto';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import * as uuid from 'vs/base/common/uuid';
import { networkInterfaces } from 'os';


const mac = new class {

	private _value: string;

	get value(): string {
		if (this._value === void 0) {
			this._initValue();
		}
		return this._value;
	}

	private _initValue(): void {
		this._value = null;
		const interfaces = networkInterfaces();
		for (let key in interfaces) {
			for (const i of interfaces[key]) {
				if (!i.internal) {
					this._value = crypto.createHash('sha256').update(i.mac, 'utf8').digest('hex');
					return;
				}
			}
		}
		this._value = `missing-${uuid.generateUuid()}`;
	}
};

export function _futureMachineIdExperiment(): string {
	return mac.value;
}

export function getMachineId(): TPromise<string> {
	return new TPromise<string>(resolve => {
		try {
			getmac.getMac((error, macAddress) => {
				if (!error) {
					resolve(crypto.createHash('sha256').update(macAddress, 'utf8').digest('hex'));
				} else {
					resolve(uuid.generateUuid()); // fallback, generate a UUID
				}
			});
		} catch (err) {
			errors.onUnexpectedError(err);
			resolve(uuid.generateUuid()); // fallback, generate a UUID
		}
	});
}
