/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const upstreamSpecs = require('../out/constants.js').upstreamSpecs;

const extRoot = path.resolve(path.join(__dirname, '..'));
for (const spec of upstreamSpecs) {
	const source = path.join(extRoot, `third_party/autocomplete/src/${spec}.ts`);
	const destination = path.join(extRoot, `src/completions/upstream/${spec}.ts`);
	fs.copyFileSync(source, destination);
}
