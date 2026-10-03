/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class Calculator {
	constructor(factor) {
		this.factor = factor;
	}

	compute(x) {
		return helper(this, x) + 1;
	}
}

function helper(obj, x) {
	return obj.factor * x;
}
