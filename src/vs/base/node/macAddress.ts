/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { networkInterfaces } from 'os';

const invalidMacAddresses = new Set([
	'00:00:00:00:00:00',
	'ff:ff:ff:ff:ff:ff',
	'ac:de:48:00:11:22'
]);

function validateMacAddress(candidate: string): boolean {
	const tempCandidate = candidate.replace(/\-/g, ':').toLowerCase();
	return !invalidMacAddresses.has(tempCandidate);
}

export function getMac(): string {
	const ifaces = networkInterfaces();
	for (const name in ifaces) {
		const networkInterface = ifaces[name];
		if (networkInterface) {
			for (const { mac } of networkInterface) {
				if (validateMacAddress(mac)) {
					return mac;
				}
			}
		}
	}

	throw new Error('Unable to retrieve mac address (unexpected format)');
}
