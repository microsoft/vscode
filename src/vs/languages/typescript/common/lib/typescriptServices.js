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

define(['./raw.typescriptServices', 'vs/text!./lib.d.ts'], function (ts) {
	return ts;
});
