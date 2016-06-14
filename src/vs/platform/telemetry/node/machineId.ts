/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as getmac from 'getmac';
import * as crypto from 'crypto';
import {TPromise} from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import * as uuid from 'vs/base/common/uuid';

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
