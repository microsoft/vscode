/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

export const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

/**
 * Resolves the relative import `specifier` of `file`, both relative to the repository root, to the source file it loads.
 */
export function resolveSourceImport(file: string, specifier: string): string {
	const resolved = path.resolve(repositoryRoot, path.dirname(file), specifier);
	const candidates = [resolved.replace(/\.js$/, '.ts'), resolved.replace(/\.js$/, '.tsx'), resolved.replace(/\.js$/, '.d.ts'), resolved];
	const dependency = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
	assert.ok(dependency, `Cannot resolve ${specifier} from ${file}`);
	return path.relative(repositoryRoot, dependency).replaceAll('\\', '/');
}

const dependenciesByFile = new Map<string, readonly string[]>();

/**
 * The source files that `entry` loads, itself included, through its relative imports. Includes type imports
 * conservatively.
 */
export function collectSourceDependencies(entry: string): Set<string> {
	const visited = new Set<string>();
	const pending = [entry];
	while (pending.length > 0) {
		const file = pending.pop()!;
		if (visited.has(file)) {
			continue;
		}
		visited.add(file);
		if (!file.endsWith('.ts') && !file.endsWith('.js')) {
			continue;
		}
		let dependencies = dependenciesByFile.get(file);
		if (!dependencies) {
			const source = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
			dependencies = ts.preProcessFile(source, true).importedFiles
				.map(reference => reference.fileName)
				.filter(specifier => specifier.startsWith('.'))
				.map(specifier => resolveSourceImport(file, specifier));
			dependenciesByFile.set(file, dependencies);
		}
		pending.push(...dependencies);
	}
	return visited;
}
