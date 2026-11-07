/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class Reporter {
	render(name, count) {
		return format(name, count);
	}
}

function format(name, count) {
	return `${name}: ${count}`;
}
