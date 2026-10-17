/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class Calculator {
	constructor(factor) {
		this.factor = factor;
	}

	compute(x) {
		return this.helper(x) + 1;
	}

	helper(x) {
		return this.factor * x;
	}
}
