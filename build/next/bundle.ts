/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as esbuild from 'esbuild';
import * as path from 'path';
import { SourceMapConsumer } from 'source-map';

export const desktopWorkbenchEntryPoint = 'vs/workbench/workbench.desktop.main';
export const bundleAssetLoaders = { '.ttf': 'file', '.svg': 'file', '.png': 'file', '.sh': 'file' } satisfies Record<string, esbuild.Loader>;

const fileHeader = `/*!--------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/`;

export function getBundleOptions(minify: boolean, platform: 'neutral' | 'node'): esbuild.BuildOptions {
	return {
		bundle: true,
		format: 'esm',
		platform,
		target: ['es2024'],
		packages: 'external',
		sourcemap: 'linked',
		sourcesContent: true,
		minify,
		treeShaking: true,
		// esbuild emits and scopes the helpers needed by each input. Keep executable
		// code out of banners, which esbuild cannot tree-shake, minify, or rename.
		banner: { js: fileHeader, css: fileHeader },
		write: false,
		logLevel: 'warning',
		logOverride: {
			'unsupported-require-call': 'silent',
		},
		tsconfigRaw: JSON.stringify({
			compilerOptions: {
				experimentalDecorators: true,
				useDefineForClassFields: false
			}
		}),
	};
}

/** Blink widens and rehashes the decoded startup script when it encounters a character above U+00FF. */
export function assertOneByteStartupBundle(file: string, code: string, readSourceMap: () => string): void {
	const match = /[\u0100-\u{10FFFF}]/u.exec(code);
	if (!match) {
		return;
	}

	const lines = code.slice(0, match.index).split('\n');
	const line = lines.length;
	const column = lines[line - 1].length;
	const generated = `${path.relative(process.cwd(), file)}:${line}:${column + 1}`;
	const original = new SourceMapConsumer(JSON.parse(readSourceMap())).originalPositionFor({ line, column });
	const location = original.source
		? `${path.relative(process.cwd(), path.resolve(path.dirname(file), original.source))}:${original.line}:${original.column + 1} (${generated})`
		: generated;
	const point = match[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
	throw new Error(`${location}: U+${point} widens the desktop workbench startup bundle. Use a Unicode escape in a regex literal or keep retained comments within Latin-1.`);
}
