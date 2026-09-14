/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';
import { updateMarkdownEditorManifestFiles } from './scripts/updateMarkdownEditorPackageJson.mts';
import { buildServerWorker } from './scripts/buildServerWorker.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist', 'browser');

run({
	platform: 'browser',
	entryPoints: {
		'extension': path.join(srcDir, 'extension.browser.ts'),
	},
	srcDir,
	outdir: outDir,
	beforeBuild: () => updateMarkdownEditorManifestFiles('write'),
	additionalOptions: {
		tsconfig: path.join(import.meta.dirname, 'tsconfig.browser.json'),
	},
}, process.argv, outDir => buildServerWorker('browser', outDir));
