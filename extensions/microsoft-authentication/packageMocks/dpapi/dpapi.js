/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
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
