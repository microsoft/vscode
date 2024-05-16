/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const importDefault = <T>(module: {
	default: T;
}): T => {
	if (module.default) {
		return module.default
	}
	return module as T
}
