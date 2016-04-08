/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*global require, ts */

require.config({
	shim: {
		'vs/languages/typescript/common/lib/raw.typescriptServices': {
			exports: function () {
				return this.ts;
			}
		}
	}
});

if (typeof process !== "undefined") {
	// make sure the node system is not used
	process.browser = true;
}

define(['./raw.typescriptServices'], function (ts) {
	return ts;
});
