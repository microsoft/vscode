/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

require.config({
	shim: {
		'vs/languages/markdown/common/raw.marked': {
			exports: function () {
				return this.marked;
			}
		}
	}
});

define(['./raw.marked'], function (marked) {
	return {
		marked: marked
	};
});