/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class Base {
	helper() {
		return 1;
	}
}

class Child extends Base {
	helper() {
		return super.helper() + 1;
	}
}
