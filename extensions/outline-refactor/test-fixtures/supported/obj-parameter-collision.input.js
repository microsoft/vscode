/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class Calculator {
	compute(value) {
		return this.helper(value);
	}

	helper(obj) {
		return this.factor + obj;
	}
}
