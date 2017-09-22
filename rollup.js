/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var rollup = require("rollup");
var babel = require("rollup-plugin-babel");

rollup.rollup({
	input: "out-build-esm/vs/editor/editor.esm.js",
	plugins: [babel()]
}).then(function (bundle) {
	bundle.write({
		file: "out-build-esm/monaco.mjs",
		format: "es"
	});
});
