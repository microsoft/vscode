/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { RawSourceMap } from 'source-map';
import type { BuildResult } from 'esbuild';
import { adjustSourceMap } from '../next/private-to-property.ts';
import { escapeJavaScriptUnicode } from './escapeJavaScriptUnicode.ts';

export interface EscapedJavaScriptOutput {
	readonly files: number;
	readonly regularExpressions: number;
	readonly comments: number;
}

function assertWithinOutput(root: string, file: string): void {
	const relative = path.relative(root, file);
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`JavaScript Unicode escaping cannot write outside its output directory: ${file}`);
	}
}

async function readSourceMap(file: string, required: boolean, root: string): Promise<RawSourceMap | undefined> {
	assertWithinOutput(root, file);
	try {
		if ((await fs.lstat(file)).isSymbolicLink()) {
			throw new Error(`Cannot rewrite a symbolic-link source map: ${file}`);
		}
		const sourceMap: RawSourceMap = JSON.parse(await fs.readFile(file, 'utf8'));
		return sourceMap;
	} catch (error) {
		if (!required && error instanceof Error) {
			const systemError: NodeJS.ErrnoException = error;
			if (systemError.code === 'ENOENT') {
				return undefined;
			}
		}
		throw new Error(`Cannot preserve the source map while escaping ${file}`, { cause: error });
	}
}

/** Normalizes generated JavaScript and its maps, leaving non-JavaScript assets and protected text intact. */
export async function escapeJavaScriptOutput(directory: string, emittedFiles?: readonly string[]): Promise<EscapedJavaScriptOutput> {
	const root = path.resolve(directory);
	if (!(await fs.stat(root)).isDirectory()) {
		throw new Error(`JavaScript output is not a directory: ${root}`);
	}
	let files = 0;
	let regularExpressions = 0;
	let comments = 0;
	const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

	async function* outputFiles(folder: string): AsyncIterable<string> {
		for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			const file = path.join(folder, entry.name);
			if (entry.isSymbolicLink()) {
				throw new Error(`Cannot normalize symbolic links in generated output: ${file}`);
			}
			if (entry.isDirectory()) {
				yield* outputFiles(file);
			} else if (entry.isFile() && /\.(?:js|cjs|mjs)$/.test(entry.name)) {
				yield file;
			}
		}
	}

	for await (const file of emittedFiles ? [...new Set(emittedFiles)].sort() : outputFiles(root)) {
		if (!/\.(?:js|cjs|mjs)$/.test(file)) {
			continue;
		}
		assertWithinOutput(root, file);
		if ((await fs.lstat(file)).isSymbolicLink()) {
			throw new Error(`Cannot normalize a symbolic-link JavaScript file: ${file}`);
		}
		const code = decoder.decode(await fs.readFile(file));
		const escaped = escapeJavaScriptUnicode(code, file);
		if (escaped.edits.length === 0) {
			continue;
		}

		let output = escaped.code;
		const reference = escaped.sourceMap;
		if (reference?.url.startsWith('data:')) {
			const inline = /^data:application\/json(?:;charset=[^;,]+)?;base64,(?<data>[a-z0-9+/]*={0,2})$/i.exec(reference.url);
			if (!inline?.groups || code.slice(reference.commentEnd).trim()) {
				throw new Error(`Unsupported non-terminal or non-base64 inline source map in ${file}`);
			}
			const bytes = Buffer.from(inline.groups.data, 'base64');
			if (bytes.toString('base64').replace(/=+$/, '') !== inline.groups.data.replace(/=+$/, '')) {
				throw new Error(`Invalid inline source map encoding in ${file}`);
			}
			const sourceMap: RawSourceMap = JSON.parse(bytes.toString('utf8'));
			const updated = adjustSourceMap(sourceMap, code, escaped.edits);
			const newUrl = reference.url.slice(0, reference.url.indexOf(',') + 1) + Buffer.from(JSON.stringify(updated)).toString('base64');
			const shift = escaped.edits.filter(edit => edit.end <= reference.start).reduce((sum, edit) => sum + edit.newText.length - (edit.end - edit.start), 0);
			output = output.slice(0, reference.start + shift) + newUrl + output.slice(reference.end + shift);
		} else {
			let mapFile = `${file}.map`;
			if (reference) {
				const url = new URL(reference.url, pathToFileURL(file));
				if (url.protocol === 'file:') {
					if (url.search || url.hash) {
						throw new Error(`Unsupported source map identity in ${file}: ${reference.url}`);
					}
					mapFile = fileURLToPath(url);
				} else if (url.protocol !== 'https:' && url.protocol !== 'http:') {
					throw new Error(`Unsupported source map URL in ${file}: ${reference.url}`);
				}
			}
			const sourceMap = await readSourceMap(mapFile, !!reference, root);
			if (sourceMap) {
				const updated = adjustSourceMap(sourceMap, code, escaped.edits);
				await fs.writeFile(mapFile, JSON.stringify(updated));
			}
		}
		await fs.writeFile(file, output);
		files++;
		regularExpressions += escaped.regularExpressions;
		comments += escaped.comments;
	}

	return { files, regularExpressions, comments };
}

/** Limits post-processing to files emitted by these builds, not stale or concurrently produced siblings. */
export async function escapeJavaScriptBuildOutput(directory: string, results: readonly BuildResult[], workingDirectory = process.cwd()): Promise<EscapedJavaScriptOutput> {
	const files: string[] = [];
	for (const result of results) {
		if (!result.metafile || result.errors.length) {
			throw new Error('Unicode output escaping requires a successful esbuild result with metafile enabled');
		}
		files.push(...Object.keys(result.metafile.outputs).map(file => path.resolve(workingDirectory, file)));
	}
	return escapeJavaScriptOutput(directory, files);
}
