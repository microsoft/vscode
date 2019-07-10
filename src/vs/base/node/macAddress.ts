/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { isWindows } from 'vs/base/common/platform';

const cmdline = {
	windows: 'getmac.exe',
	unix: '/sbin/ifconfig -a || /sbin/ip link'
};

const invalidMacAddresses = [
	'00:00:00:00:00:00',
	'ff:ff:ff:ff:ff:ff',
	'ac:de:48:00:11:22'
];

function validateMacAddress(candidate: string): boolean {
	let tempCandidate = candidate.replace(/\-/g, ':').toLowerCase();
	for (let invalidMacAddress of invalidMacAddresses) {
		if (invalidMacAddress === tempCandidate) {
			return false;
		}
	}

	return true;
}

export function getMac(): Promise<string> {
	return new Promise((resolve, reject) => {
		try {
			exec(isWindows ? cmdline.windows : cmdline.unix, { timeout: 10000 }, (err, stdout, stdin) => {
				if (err) {
					reject(err);
				} else {
					const regex = /(?:[a-f\d]{2}[:\-]){5}[a-f\d]{2}/gi;

					let match;
					while ((match = regex.exec(stdout)) !== null) {
						const macAddressCandidate = match[0];
						if (validateMacAddress(macAddressCandidate)) {
							resolve(macAddressCandidate);
							return;
						}
					}

					reject('Unable to retrieve mac address.');
				}
			});

			setTimeout(() => reject('Unable to retrieve mac address'), 10000);
		} catch (err) {
			reject(err);
		}
	});
}