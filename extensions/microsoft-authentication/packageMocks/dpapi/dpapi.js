/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class defaultDpapi {
	protectData() {
		throw new Error('Dpapi bindings unavailable');
	}
	unprotectData() {
		throw new Error('Dpapi bindings unavailable');
	}
}
const Dpapi = new defaultDpapi();
export { Dpapi };
