/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePackageDirectory } from '../esbuild-common.mts';
import { run } from '../esbuild-webview-common.mts';

const srcDir = path.join(import.meta.dirname, 'preview-src');
const outDir = path.join(import.meta.dirname, 'preview-out');

/**
 * Copies the files that pdf.js loads while it runs: its worker, the CMaps for CJK text, the Symbol
 * and ZapfDingbats fonts (it takes the other standard fonts from the system), the JPEG 2000 and JBIG2
 * image decoders, the icons of annotations, and the page loading indicator.
 */
function copyPdfJsFiles(outDir: string): void {
	const pdfjsDir = resolvePackageDirectory(import.meta.dirname, 'pdfjs-dist');
	const copy = (from: string, to: string) => fs.cpSync(path.join(pdfjsDir, from), path.join(outDir, to), { recursive: true });
	copy('build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs');
	copy('cmaps', 'pdfjs/cmaps');
	for (const file of ['standard_fonts/FoxitSymbol.pfb', 'standard_fonts/FoxitDingbats.pfb', 'standard_fonts/LICENSE_FOXIT', 'wasm/openjpeg.wasm', 'wasm/jbig2.wasm', 'wasm/LICENSE_OPENJPEG', 'wasm/LICENSE_JBIG2', 'wasm/LICENSE_PDFJS_OPENJPEG', 'wasm/LICENSE_PDFJS_JBIG2']) {
		copy(file, `pdfjs/${file}`);
	}
	for (const file of fs.readdirSync(path.join(pdfjsDir, 'web/images')).filter(name => name.startsWith('annotation-') || name === 'loading-icon.gif')) {
		copy(`web/images/${file}`, `images/${file}`);
	}
}

run({
	entryPoints: {
		'index': path.join(srcDir, 'index.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		// The viewer styles of pdf.js refer to images of controls that the preview doesn't show
		external: ['*.gif', '*.png', '*.svg'],
	},
}, process.argv, copyPdfJsFiles);
