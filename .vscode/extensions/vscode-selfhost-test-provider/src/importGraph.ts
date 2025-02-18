/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import * as vscode from 'vscode';
import { bulkhead } from 'cockatiel';
import { promises as fs } from 'fs';

const maxInt32 = 2 ** 31 - 1;

// limit concurrency to avoid overwhelming the filesystem during discovery
const discoverLimiter = bulkhead(8, Infinity);

// Max import distance when listing related code to improve relevancy.
const defaultMaxDistance = 3;

/**
 * Maintains a graph of imports in the codebase. This works lazily resolving
 * imports and re-parsing files only on request.
 *
 * This is a rough, file-level graph derived from simple regex matching on
 * source files to avoid having to parse the AST of every file in the codebase,
 * which is possible but more intensive. (See: all the years of work from the
 * TS language server.)
 *
 * A more advanced implementation could use references from the language server.
 */
export class ImportGraph implements vscode.TestRelatedCodeProvider {
	private graph = new Map<string, FileNode>();

	constructor(
		private readonly root: vscode.Uri,
		private readonly discoverWorkspaceTests: () => Thenable<vscode.TestItem[]>,
		private readonly getTestNodeForDoc: (uri: vscode.Uri) => vscode.TestItem | undefined,
	) { }

	/** @inheritdoc */
	public async provideRelatedCode(test: vscode.TestItem, token: vscode.CancellationToken): Promise<vscode.Location[]> {
		// this is kind of a stub for this implementation. Naive following imports
		// isn't that useful for finding a test's related code.
		const node = await this.discoverOutwards(test.uri, new Set(), defaultMaxDistance, token);
		if (!node) {
			return [];
		}

		const imports = new Set<string>();
		const queue = [{ distance: 0, next: node.imports }];
		while (queue.length) {
			const { distance, next } = queue.shift()!;
			for (const imp of next) {
				if (imports.has(imp.path)) {
					continue;
				}

				imports.add(imp.path);
				if (distance < defaultMaxDistance) {
					queue.push({ next: imp.imports, distance: distance + 1 });
				}
			}
		}

		return [...imports].map(importPath =>
			new vscode.Location(
				vscode.Uri.file(join(this.root.fsPath, 'src', `${importPath}.ts`)),
				new vscode.Range(0, 0, maxInt32, 0),
			),
		);
	}

	/** @inheritdoc */
	public async provideRelatedTests(document: vscode.TextDocument, _position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.TestItem[]> {
		// Expand all known tests to ensure imports of this file are realized.
		const rootTests = await this.discoverWorkspaceTests();
		const seen = new Set<string>();
		await Promise.all(rootTests.map(v => v.uri && this.discoverOutwards(v.uri, seen, defaultMaxDistance, token)));

		const node = this.getNode(document.uri);
		if (!node) {
			return [];
		}

		const tests: vscode.TestItem[] = [];
		const queue: { next: FileNode; distance: number }[] = [{ next: node, distance: 0 }];
		const visited = new Set<FileNode>();
		let maxDistance = Infinity;

		while (queue.length) {
			const { next, distance } = queue.shift()!;
			if (visited.has(next)) {
				continue;
			}

			visited.add(next);
			const testForDoc = this.getTestNodeForDoc(next.uri);
			if (testForDoc) {
				tests.push(testForDoc);
				// only look for tests half again as far away as the closest test to keep things relevant
				if (!Number.isFinite(maxDistance)) {
					maxDistance = distance * 3 / 2;
				}
			}

			if (distance < maxDistance) {
				for (const importedByNode of next.importedBy) {
					queue.push({ next: importedByNode, distance: distance + 1 });
				}
			}
		}

		return tests;
	}

	public didChange(uri: vscode.Uri, deleted: boolean) {
		const rel = this.uriToImportPath(uri);
		const node = rel && this.graph.get(rel);
		if (!node) {
			return;
		}

		if (deleted) {
			this.graph.delete(rel);
			for (const imp of node.imports) {
				imp.importedBy.delete(node);
			}
		} else {
			node.isSynced = false;
		}
	}

	private getNode(uri: vscode.Uri | undefined): FileNode | undefined {
		const rel = this.uriToImportPath(uri);
		return rel ? this.graph.get(rel) : undefined;
	}

	/** Discover all nodes that import the file */
	private async discoverOutwards(uri: vscode.Uri | undefined, seen: Set<string>, maxDistance: number, token: vscode.CancellationToken): Promise<FileNode | undefined> {
		const rel = this.uriToImportPath(uri);
		if (!rel) {
			return undefined;
		}

		let node = this.graph.get(rel);
		if (!node) {
			node = new FileNode(uri!, rel);
			this.graph.set(rel, node);
		}

		await this.discoverOutwardsInner(node, seen, maxDistance, token);
		return node;
	}

	private async discoverOutwardsInner(node: FileNode, seen: Set<string>, maxDistance: number, token: vscode.CancellationToken) {
		if (seen.has(node.path) || maxDistance === 0) {
			return;
		}

		seen.add(node.path);
		if (node.isSynced === false) {
			await this.syncNode(node);
		} else if (node.isSynced instanceof Promise) {
			await node.isSynced;
		}

		if (token.isCancellationRequested) {
			return;
		}
		await Promise.all([...node.imports].map(i => this.discoverOutwardsInner(i, seen, maxDistance - 1, token)));
	}

	private async syncNode(node: FileNode) {
		node.isSynced = discoverLimiter.execute(async () => {
			const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === node.uri.toString());

			let text: string;
			if (doc) {
				text = doc.getText();
			} else {
				try {
					text = await fs.readFile(node.uri.fsPath, 'utf8');
				} catch {
					text = '';
				}
			}

			for (const imp of node.imports) {
				imp.importedBy.delete(node);
			}
			node.imports.clear();

			for (const [, importPath] of text.matchAll(IMPORT_RE)) {
				let imp = this.graph.get(importPath);
				if (!imp) {
					imp = new FileNode(this.importPathToUri(importPath), importPath);
					this.graph.set(importPath, imp);
				}

				imp.importedBy.add(node);
				node.imports.add(imp);
			}

			node.isSynced = true;
		});

		await node.isSynced;
	}

	private uriToImportPath(uri: vscode.Uri | undefined) {
		if (!uri) {
			return undefined;
		}

		const relativePath = vscode.workspace.asRelativePath(uri).replaceAll('\\', '/');
		if (!relativePath.startsWith('src/vs/') || !relativePath.endsWith('.ts')) {
			return undefined;
		}

		return relativePath.slice('src/'.length, -'.ts'.length);
	}

	private importPathToUri(importPath: string) {
		return vscode.Uri.file(join(this.root.fsPath, 'src', `${importPath}.ts`));
	}
}

const IMPORT_RE = /import .*? from ["'](vs\/[^"']+)/g;

class FileNode {
	public imports = new Set<FileNode>();
	public importedBy = new Set<FileNode>();
	public isSynced: boolean | Promise<void> = false;

	// Path is the *import path* starting with `vs/`
	constructor(
		public readonly uri: vscode.Uri,
		public readonly path: string,
	) { }
}
