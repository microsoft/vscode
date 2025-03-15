/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tsImport } from 'tsx/esm/api';

const isVite = true;
if (!isVite) {
	await import('../out/main.js');
} else {
	await tsImport('./main.js', {
		parentURL: import.meta.url,
		tsconfig: './src/tsconfig.json',
	});
}
