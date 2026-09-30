/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test, beforeEach, afterEach } from 'node:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Graph, collectJsFiles, processFile, processFiles, normalize } from '../checkCyclicDependencies.ts';
import { Graph as NativeGraph, processFiles as processNativeFiles } from '../checkCyclicDependencies-7.ts';

suite('checkCyclicDependencies', () => {

	suite('Graph', () => {

		test('no cycles in linear chain', () => {
			const graph = new Graph();
			graph.inertEdge('a', 'b');
			graph.inertEdge('b', 'c');
			const cycles = graph.findCycles(['a', 'b', 'c']);
			for (const [, cycle] of cycles) {
				assert.strictEqual(cycle, undefined);
			}
		});

		test('detects simple cycle', () => {
			const graph = new Graph();
			graph.inertEdge('a', 'b');
			graph.inertEdge('b', 'a');
			const cycles = graph.findCycles(['a', 'b']);
			const hasCycle = Array.from(cycles.values()).some(c => c !== undefined);
			assert.ok(hasCycle);
		});

		test('detects 3-node cycle', () => {
			const graph = new Graph();
			graph.inertEdge('a', 'b');
			graph.inertEdge('b', 'c');
			graph.inertEdge('c', 'a');
			const cycles = graph.findCycles(['a', 'b', 'c']);
			const hasCycle = Array.from(cycles.values()).some(c => c !== undefined);
			assert.ok(hasCycle);
		});

		test('no false positives with shared dependencies', () => {
			const graph = new Graph();
			// diamond: a -> b, a -> c, b -> d, c -> d
			graph.inertEdge('a', 'b');
			graph.inertEdge('a', 'c');
			graph.inertEdge('b', 'd');
			graph.inertEdge('c', 'd');
			const cycles = graph.findCycles(['a', 'b', 'c', 'd']);
			for (const [, cycle] of cycles) {
				assert.strictEqual(cycle, undefined);
			}
		});

		test('lookupOrInsertNode returns same node for same data', () => {
			const graph = new Graph();
			const node1 = graph.lookupOrInsertNode('x');
			const node2 = graph.lookupOrInsertNode('x');
			assert.strictEqual(node1, node2);
		});

		test('lookup returns undefined for unknown node', () => {
			const graph = new Graph();
			assert.strictEqual(graph.lookup('unknown'), undefined);
		});

		test('findCycles skips unknown data', () => {
			const graph = new Graph();
			graph.inertEdge('a', 'b');
			const cycles = graph.findCycles(['nonexistent']);
			assert.strictEqual(cycles.get('nonexistent'), undefined);
		});

		test('cycle path contains the cycle nodes', () => {
			const graph = new Graph();
			graph.inertEdge('a', 'b');
			graph.inertEdge('b', 'c');
			graph.inertEdge('c', 'b');
			const cycles = graph.findCycles(['a', 'b', 'c']);
			const cyclePath = Array.from(cycles.values()).find(c => c !== undefined);
			assert.ok(cyclePath);
			assert.ok(cyclePath.includes('b'));
			assert.ok(cyclePath.includes('c'));
			// cycle should start and end with same node
			assert.strictEqual(cyclePath[0], cyclePath[cyclePath.length - 1]);
		});
	});

	suite('normalize', () => {

		test('replaces backslashes with forward slashes', () => {
			assert.strictEqual(normalize('a\\b\\c'), 'a/b/c');
		});

		test('leaves forward slashes unchanged', () => {
			assert.strictEqual(normalize('a/b/c'), 'a/b/c');
		});
	});

	suite('collectJsFiles and processFile', () => {

		let tmpDir: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyclic-test-'));
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		test('collectJsFiles finds .js files recursively', () => {
			fs.writeFileSync(path.join(tmpDir, 'a.js'), '');
			fs.writeFileSync(path.join(tmpDir, 'b.ts'), '');
			fs.mkdirSync(path.join(tmpDir, 'sub'));
			fs.writeFileSync(path.join(tmpDir, 'sub', 'c.js'), '');
			const files = collectJsFiles(tmpDir);
			assert.strictEqual(files.length, 2);
			assert.ok(files.some(f => f.endsWith('a.js')));
			assert.ok(files.some(f => f.endsWith('c.js')));
		});

		test('processFile adds edges for relative module references', () => {
			fs.writeFileSync(path.join(tmpDir, 'a.js'), 'import { x } from "./b"; export { y } from "./c"; import("./d.js");');
			fs.writeFileSync(path.join(tmpDir, 'b.js'), '');
			fs.writeFileSync(path.join(tmpDir, 'c.js'), '');
			fs.writeFileSync(path.join(tmpDir, 'd.js'), '');
			const graph = new Graph();
			processFile(path.join(tmpDir, 'a.js'), graph);
			const aNode = graph.lookup(normalize(path.join(tmpDir, 'a.js')));
			assert.ok(aNode);
			assert.deepStrictEqual([...aNode.outgoing.keys()].map(file => path.basename(file)).sort(), ['b.js', 'c.js', 'd.js']);
		});

		test('processFile skips non-relative imports', () => {
			fs.writeFileSync(path.join(tmpDir, 'a.js'), 'import fs from "fs";');
			const graph = new Graph();
			processFile(path.join(tmpDir, 'a.js'), graph);
			// no relative imports, so no edges and no node created
			assert.strictEqual(graph.lookup(normalize(path.join(tmpDir, 'a.js'))), undefined);
		});

		test('processFile skips CSS imports', () => {
			fs.writeFileSync(path.join(tmpDir, 'a.js'), 'import "./styles.css";');
			const graph = new Graph();
			processFile(path.join(tmpDir, 'a.js'), graph);
			// CSS imports are ignored, so no edges and no node created
			assert.strictEqual(graph.lookup(normalize(path.join(tmpDir, 'a.js'))), undefined);
		});

		test('end-to-end: detects cycle in JS files', () => {
			fs.writeFileSync(path.join(tmpDir, 'a.js'), 'import { x } from "./b";');
			fs.writeFileSync(path.join(tmpDir, 'b.js'), 'import { y } from "./a";');
			const files = collectJsFiles(tmpDir);
			const graph = new Graph();
			processFiles(files, graph);
			const allNormalized = files.map(normalize);
			const cycles = graph.findCycles(allNormalized);
			const hasCycle = Array.from(cycles.values()).some(c => c !== undefined);
			assert.ok(hasCycle);
		});

		test('native processFiles scans explicit JS roots and detects cycles', () => {
			fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({ files: [] }));
			fs.writeFileSync(path.join(tmpDir, 'a.js'), 'import "./b.js"; export * from "./c.js"; import("./d.js"); import "node:fs"; import "./style.css";');
			fs.writeFileSync(path.join(tmpDir, 'b.js'), 'import "./a.js";');
			fs.writeFileSync(path.join(tmpDir, 'c.js'), '');
			fs.writeFileSync(path.join(tmpDir, 'd.js'), '');
			const files = collectJsFiles(tmpDir).sort();
			const graph = new NativeGraph();
			processNativeFiles(tmpDir, files, graph);
			const normalizedFiles = files.map(normalize);
			assert.deepStrictEqual({
				edges: normalizedFiles.map(filename => ({
					file: path.basename(filename),
					imports: [...(graph.lookup(filename)?.outgoing.keys() ?? [])].map(importedFile => path.basename(importedFile)).sort()
				})),
				hasCycle: Array.from(graph.findCycles(normalizedFiles).values()).some(cycle => cycle !== undefined)
			}, {
				edges: [
					{ file: 'a.js', imports: ['b.js', 'c.js', 'd.js'] },
					{ file: 'b.js', imports: ['a.js'] },
					{ file: 'c.js', imports: [] },
					{ file: 'd.js', imports: [] }
				],
				hasCycle: true
			});
		});

		for (const { name, scan } of [
			{
				name: 'TS 6',
				scan: (filenames: string[]) => {
					const graph = new Graph();
					processFiles(filenames, graph);
					return graph;
				}
			},
			{
				name: 'TS 7',
				scan: (filenames: string[]) => {
					const graph = new NativeGraph();
					processNativeFiles(tmpDir, filenames, graph);
					return graph;
				}
			}
		]) {
			test(`${name} resolves known inputs and uncatalogued JS and TS targets`, () => {
				const inputDir = path.join(tmpDir, 'input');
				fs.mkdirSync(inputDir);
				const source = 'import "./known.js"; import "../shared.js"; export * from "../fallback.js"; import("../preferred"); import "../missing";';
				fs.writeFileSync(path.join(inputDir, 'entry.js'), source);
				fs.writeFileSync(path.join(inputDir, 'repeat.js'), source);
				fs.writeFileSync(path.join(inputDir, 'known.js'), '');
				for (const filename of ['shared.js', 'fallback.ts', 'preferred.js', 'preferred.ts']) {
					fs.writeFileSync(path.join(tmpDir, filename), '');
				}
				const files = collectJsFiles(inputDir).sort();
				const graph = scan(files);
				assert.deepStrictEqual(files.map(filename => ({
					file: path.basename(filename),
					imports: [...(graph.lookup(normalize(filename))?.outgoing.keys() ?? [])].map(importedFile => path.basename(importedFile)).sort()
				})), [
					{ file: 'entry.js', imports: ['fallback.ts', 'known.js', 'preferred.js', 'shared.js'] },
					{ file: 'known.js', imports: [] },
					{ file: 'repeat.js', imports: ['fallback.ts', 'known.js', 'preferred.js', 'shared.js'] }
				]);
			});

			test(`${name} refreshes file-existence results between scans`, () => {
				const entry = path.join(tmpDir, 'entry.js');
				const jsTarget = path.join(tmpDir, 'target.js');
				const tsTarget = path.join(tmpDir, 'target.ts');
				fs.writeFileSync(entry, 'import "./target";');
				fs.writeFileSync(tsTarget, '');
				const scanImports = () => [...(scan([entry]).lookup(normalize(entry))?.outgoing.keys() ?? [])].map(filename => path.basename(filename));
				const beforeCreation = scanImports();
				fs.writeFileSync(jsTarget, '');
				const afterCreation = scanImports();
				fs.rmSync(jsTarget);
				fs.rmSync(tsTarget);
				const afterRemoval = scanImports();
				assert.deepStrictEqual({ beforeCreation, afterCreation, afterRemoval }, {
					beforeCreation: ['target.ts'],
					afterCreation: ['target.js'],
					afterRemoval: []
				});
			});
		}

		test('end-to-end: no cycle in acyclic JS files', () => {
			fs.writeFileSync(path.join(tmpDir, 'a.js'), 'import { x } from "./b";');
			fs.writeFileSync(path.join(tmpDir, 'b.js'), '');
			const files = collectJsFiles(tmpDir);
			const graph = new Graph();
			processFiles(files, graph);
			const allNormalized = files.map(normalize);
			const cycles = graph.findCycles(allNormalized);
			for (const [, cycle] of cycles) {
				assert.strictEqual(cycle, undefined);
			}
		});
	});
});
