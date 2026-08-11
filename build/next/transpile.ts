/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

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

export async function applyIncrementalClientChanges(repoRoot: string, outDir: string, changedPaths: readonly string[]): Promise<void> {
	const destinations = new Set<string>();
	for (const changedPath of changedPaths) {
		if (!changedPath.startsWith('src/')) {
			continue;
		}
		destinations.add(getOutputRelativePath(changedPath.slice('src/'.length)));
	}

	const operations = await Promise.all([...destinations].map(async destination => {
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
	}));

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

	await Promise.all(operations.map(async operation => {
		if (operation.kind === 'copy') {
			await copyFile(operation.sourcePath, operation.destinationPath);
		} else if (operation.kind === 'transpile') {
			await transpileFile(operation.sourcePath, operation.destinationPath);
		}
	}));
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
