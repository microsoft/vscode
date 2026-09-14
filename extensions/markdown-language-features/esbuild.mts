/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';
import { updateMarkdownEditorManifestFiles } from './scripts/updateMarkdownEditorPackageJson.mts';
import { buildServerWorker } from './scripts/buildServerWorker.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

run({
	platform: 'node',
	entryPoints: {
		'extension': path.join(srcDir, 'extension.ts'),
	},
	srcDir,
	outdir: outDir,
	beforeBuild: () => updateMarkdownEditorManifestFiles('write'),
}, process.argv, outDir => buildServerWorker('node', outDir));
