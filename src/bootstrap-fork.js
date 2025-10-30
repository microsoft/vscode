/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

await tsImport('./bootstrap-fork.ts', {
	parentURL: import.meta.url,
	tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
});
