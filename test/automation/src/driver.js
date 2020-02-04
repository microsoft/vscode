/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');

exports.connect = function (outPath, handle) {
	const bootstrapPath = path.join(outPath, 'bootstrap-amd.js');
	const { load } = require(bootstrapPath);
	return new Promise((c, e) => load('vs/platform/driver/node/driver', ({ connect }) => connect(handle).then(c, e), e));
};