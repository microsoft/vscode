/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import type { OptimizeOptions } from 'svgo';
import { mapWithConcurrency, MAX_CONCURRENT_FILE_OPERATIONS } from './transpile.ts';

const svgOptions: OptimizeOptions = {
	// Match the legacy gulp-svgmin preset, except for externally observable SVG contracts.
	plugins: [{
		name: 'preset-default',
		params: {
			overrides: {
				cleanupIDs: false,
				// Preserve CSS keyframes, license comments, and structural selectors.
				inlineStyles: false,
				minifyStyles: false,
				collapseGroups: false,
				removeViewBox: false,
				removeTitle: false,
				removeDesc: false,
				removeHiddenElems: false,
				removeComments: false,
				removeMetadata: false,
				removeUnknownsAndDefaults: {
					unknownAttrs: false,
					keepRoleAttr: true,
				},
			},
		},
	}],
};

/**
 * Finish SVG assets in a complete bundle output, never in the source or development trees.
 */
export async function optimizeSvgFiles(outDir: string, minify: boolean): Promise<void> {
	if (!minify) {
		return;
	}

	const { optimize } = await import('svgo');
	const entries = await fs.promises.readdir(outDir, { recursive: true, withFileTypes: true });
	const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.svg'));
	let inputBytes = 0;
	let outputBytes = 0;

	await mapWithConcurrency(files, MAX_CONCURRENT_FILE_OPERATIONS, async file => {
		const filePath = path.join(file.parentPath, file.name);
		try {
			const input = await fs.promises.readFile(filePath);
			const result = optimize(input.toString('utf8'), { ...svgOptions, path: filePath });
			if (result.error !== undefined) {
				throw new Error(result.error);
			}

			const output = Buffer.from(result.data);
			inputBytes += input.byteLength;
			if (output.byteLength < input.byteLength) {
				await fs.promises.writeFile(filePath, output);
				outputBytes += output.byteLength;
			} else {
				outputBytes += input.byteLength;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[svg] Failed to optimize ${filePath}: ${message}`, { cause: error });
		}
	});

	console.log(`[svg] ${files.length} files: ${inputBytes} -> ${outputBytes} bytes`);
}
