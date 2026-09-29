/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';

// --- Graph (extracted from build/lib/tsb/utils.ts) ---

export class Node {
	readonly incoming = new Map<string, Node>();
	readonly outgoing = new Map<string, Node>();

	readonly data: string;

	constructor(data: string) {
		this.data = data;
	}
}

export class Graph {
	private _nodes = new Map<string, Node>();

	inertEdge(from: string, to: string): void {
		const fromNode = this.lookupOrInsertNode(from);
		const toNode = this.lookupOrInsertNode(to);
		fromNode.outgoing.set(toNode.data, toNode);
		toNode.incoming.set(fromNode.data, fromNode);
	}

	lookupOrInsertNode(data: string): Node {
		let node = this._nodes.get(data);
		if (!node) {
			node = new Node(data);
			this._nodes.set(data, node);
		}
		return node;
	}

	lookup(data: string): Node | undefined {
		return this._nodes.get(data);
	}

	findCycles(allData: string[]): Map<string, string[] | undefined> {
		const result = new Map<string, string[] | undefined>();
		const checked = new Set<string>();
		for (const data of allData) {
			const node = this.lookup(data);
			if (!node) {
				continue;
			}
			const cycle = this._findCycle(node, checked, new Set());
			result.set(node.data, cycle);
		}
		return result;
	}

	private _findCycle(node: Node, checked: Set<string>, seen: Set<string>): string[] | undefined {
		if (checked.has(node.data)) {
			return undefined;
		}
		for (const child of node.outgoing.values()) {
			if (seen.has(child.data)) {
				const seenArr = Array.from(seen);
				const idx = seenArr.indexOf(child.data);
				seenArr.push(child.data);
				return idx > 0 ? seenArr.slice(idx) : seenArr;
			}
			seen.add(child.data);
			const result = this._findCycle(child, checked, seen);
			seen.delete(child.data);
			if (result) {
				return result;
			}
		}
		checked.add(node.data);
		return undefined;
	}
}

// --- Dependency scanning & cycle detection ---

export function normalize(p: string): string {
	return p.replace(/\\/g, '/');
}

export function collectJsFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectJsFiles(full));
		} else if (entry.isFile() && entry.name.endsWith('.js')) {
			results.push(full);
		}
	}
	return results;
}

export function processFile(filename: string, graph: Graph): void {
	const content = fs.readFileSync(filename, 'utf-8');
	const info = ts.preProcessFile(content, true);

	for (const ref of info.importedFiles) {
		if (!ref.fileName.startsWith('.')) {
			continue; // skip node_modules
		}
		if (ref.fileName.endsWith('.css')) {
			continue;
		}

		const dir = path.dirname(filename);
		let resolvedPath = path.resolve(dir, ref.fileName);
		if (resolvedPath.endsWith('.js')) {
			resolvedPath = resolvedPath.slice(0, -3);
		}
		const normalizedResolved = normalize(resolvedPath);

		if (fs.existsSync(normalizedResolved + '.js')) {
			graph.inertEdge(normalize(filename), normalizedResolved + '.js');
		} else if (fs.existsSync(normalizedResolved + '.ts')) {
			graph.inertEdge(normalize(filename), normalizedResolved + '.ts');
		}
	}
}

function main(): void {
	const folder = process.argv[2];
	if (!folder) {
		console.error('Usage: node build/lib/checkCyclicDependencies.ts <folder>');
		process.exit(1);
	}

	const rootDir = path.resolve(folder);
	if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
		console.error(`Not a directory: ${rootDir}`);
		process.exit(1);
	}

	const files = collectJsFiles(rootDir);
	const graph = new Graph();

	for (const file of files) {
		processFile(file, graph);
	}

	const allNormalized = files.map(normalize).sort((a, b) => a.localeCompare(b));
	const cycles = graph.findCycles(allNormalized);

	const cyclicPaths = new Set<string>();
	for (const [_filename, cycle] of cycles) {
		if (cycle) {
			const path = cycle.join(' -> ');
			if (cyclicPaths.has(path)) {
				continue;
			}
			cyclicPaths.add(path);
			console.error(`CYCLIC dependency: ${path}`);
		}
	}

	if (cyclicPaths.size > 0) {
		process.exit(1);
	} else {
		console.log(`No cyclic dependencies found in ${files.length} files.`);
	}
}

if (process.argv[1] && normalize(path.resolve(process.argv[1])).endsWith('checkCyclicDependencies.ts')) {
	main();
}
