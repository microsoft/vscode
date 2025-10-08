/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

import { join } from 'path';
import { defineConfig } from 'rollup';
import { dts } from "rollup-plugin-dts";

const root = join(import.meta.dirname, '../../../');
const outDir = join(import.meta.dirname, './out');

export default defineConfig({
	input: {
		entry: join(import.meta.dirname, './main.ts'),
	},
	output: {
		dir: outDir,
		format: 'es',
		//preserveModules: true,
	},
	external: [/.*\.css/],
	plugins: [
		dts({
			compilerOptions: {
				stripInternal: true,
			}
		}),
	],
});
