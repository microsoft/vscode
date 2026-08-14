/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** Keeps build I/O comfortably below the Windows CRT's 8192 file-handle limit. */
export const MAX_CONCURRENT_FILE_OPERATIONS = 256;

const transformOptions: esbuild.TransformOptions = {
	loader: 'ts',
	format: 'esm',
	target: 'es2024',
	sourcemap: 'inline',
	sourcesContent: false,
	tsconfigRaw: JSON.stringify({
		compilerOptions: {
			experimentalDecorators: true,
			useDefineForClassFields: false
		}
	}),
};

export async function transpileFile(srcPath: string, destPath: string): Promise<void> {
	const source = await fs.promises.readFile(srcPath, 'utf-8');
	const result = await esbuild.transform(source, {
		...transformOptions,
		sourcefile: srcPath,
	});

	await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
	await fs.promises.writeFile(destPath, adjustEsmUrl(result.code));
}

export async function copyFile(srcPath: string, destPath: string): Promise<void> {
	await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

	if (needsBomAdded(srcPath)) {
		const content = await fs.promises.readFile(srcPath);
		if (content[0] !== 0xef || content[1] !== 0xbb || content[2] !== 0xbf) {
			await fs.promises.writeFile(destPath, Buffer.concat([UTF8_BOM, content]));
			return;
		}
	}
	await fs.promises.copyFile(srcPath, destPath);
}

export async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new RangeError('Concurrency must be a positive integer.');
	}

	const results = new Array<R>(items.length);
	let nextIndex = 0;
	let firstError: { value: unknown } | undefined;

	async function worker(): Promise<void> {
		while (!firstError && nextIndex < items.length) {
			const index = nextIndex++;
			try {
				results[index] = await task(items[index], index);
			} catch (error) {
				firstError ??= { value: error };
			}
		}
	}

	const workerCount = Math.min(concurrency, items.length);
	await Promise.all(Array.from({ length: workerCount }, worker));

	if (firstError) {
		throw firstError.value;
	}

	return results;
}

export async function applyIncrementalClientChanges(repoRoot: string, outDir: string, changedPaths: readonly string[]): Promise<void> {
	const destinations = new Set<string>();
	for (const changedPath of changedPaths) {
		if (!changedPath.startsWith('src/')) {
			continue;
		}
		destinations.add(getOutputRelativePath(changedPath.slice('src/'.length)));
	}

	const operations = await mapWithConcurrency([...destinations], MAX_CONCURRENT_FILE_OPERATIONS, async destination => {
		const destinationPath = path.join(repoRoot, outDir, destination);
		const resourceSource = path.join(repoRoot, 'src', destination);

		if (!resourceSource.endsWith('.ts') && await isFile(resourceSource)) {
			return { destinationPath, sourcePath: resourceSource, kind: 'copy' as const };
		}

		if (destination.endsWith('.js')) {
			const typeScriptSource = path.join(repoRoot, 'src', destination.slice(0, -'.js'.length) + '.ts');
			if (await isFile(typeScriptSource) && !typeScriptSource.endsWith('.d.ts')) {
				return { destinationPath, sourcePath: typeScriptSource, kind: 'transpile' as const };
			}
		}

		if (await isFile(resourceSource)) {
			return { destinationPath, sourcePath: resourceSource, kind: 'copy' as const };
		}

		return { destinationPath, kind: 'remove' as const };
	});

	for (const operation of operations) {
		if (operation.kind === 'remove') {
			await fs.promises.rm(operation.destinationPath, { recursive: true, force: true });
		}
	}
	for (const operation of operations) {
		if (operation.kind !== 'remove' && await isDirectory(operation.destinationPath)) {
			await fs.promises.rm(operation.destinationPath, { recursive: true, force: true });
		}
	}

	await mapWithConcurrency(operations, MAX_CONCURRENT_FILE_OPERATIONS, async operation => {
		if (operation.kind === 'copy') {
			await copyFile(operation.sourcePath, operation.destinationPath);
		} else if (operation.kind === 'transpile') {
			await transpileFile(operation.sourcePath, operation.destinationPath);
		}
	});
}

export function getOutputRelativePath(sourceRelativePath: string): string {
	return sourceRelativePath.endsWith('.ts') && !sourceRelativePath.endsWith('.d.ts')
		? sourceRelativePath.slice(0, -'.ts'.length) + '.js'
		: sourceRelativePath;
}

function adjustEsmUrl(code: string): string {
	return code.replace(/\.ts(\?esm['"])/g, '.js$1');
}

function needsBomAdded(filePath: string): boolean {
	return /([\/\\])test\1.*utf8/.test(filePath);
}

async function isFile(filePath: string): Promise<boolean> {
	try {
		return (await fs.promises.stat(filePath)).isFile();
	} catch (error) {
		if (isPathMissing(error)) {
			return false;
		}
		throw error;
	}
}

async function isDirectory(filePath: string): Promise<boolean> {
	try {
		return (await fs.promises.stat(filePath)).isDirectory();
	} catch (error) {
		if (isPathMissing(error)) {
			return false;
		}
		throw error;
	}
}

function isPathMissing(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
