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
 * The CMaps of the CJK fonts that PDF libraries use without embedding them, such as the
 * `UnicodeCIDFont` fonts of reportlab: the UCS-2 encodings and the mappings to Unicode of Japanese,
 * Simplified Chinese, Traditional Chinese and Korean. Text that needs other CMaps doesn't show.
 */
const cMaps = ['UniJIS-UCS2-H', 'Adobe-Japan1-UCS2', 'UniGB-UCS2-H', 'Adobe-GB1-UCS2', 'UniCNS-UCS2-H', 'Adobe-CNS1-UCS2', 'UniKS-UCS2-H', 'Adobe-Korea1-UCS2'];

/**
 * Copies the files that pdf.js loads while it runs: its worker, some CMaps for CJK text, the Symbol
 * and ZapfDingbats fonts (it takes the other standard fonts from the system), the icons of
 * annotations, and the page loading indicator. The preview targets generated documents, such as the
 * ones agents create, so it leaves out the JPEG 2000 and JBIG2 image decoders of scanned documents.
 */
function copyPdfJsFiles(outDir: string): void {
	const pdfjsDir = resolvePackageDirectory(import.meta.dirname, 'pdfjs-dist');
	const copy = (from: string, to: string) => fs.cpSync(path.join(pdfjsDir, from), path.join(outDir, to), { recursive: true });
	copy('build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs');
	for (const file of [...cMaps.map(name => `cmaps/${name}.bcmap`), 'cmaps/LICENSE', 'standard_fonts/FoxitSymbol.pfb', 'standard_fonts/FoxitDingbats.pfb', 'standard_fonts/LICENSE_FOXIT']) {
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
