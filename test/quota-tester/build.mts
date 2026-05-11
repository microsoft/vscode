/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildSync } from 'esbuild';

buildSync({
	entryPoints: ['src/client/app.ts'],
	bundle: true,
	format: 'esm',
	outfile: 'public/app.js',
	sourcemap: true,
	target: 'es2022',
});
