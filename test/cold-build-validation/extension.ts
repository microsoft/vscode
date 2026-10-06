/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface Manifest {
	readonly publisher: string;
	readonly name: string;
	readonly main?: string;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const root = process.env.COLD_BUILD_REPOSITORY!;
	const resultFile = process.env.COLD_BUILD_RESULT!;
	const expected: string[] = [];
	const activated: string[] = [];
	const failures: { id: string; error: string }[] = [];
	const services: Record<string, number> = {};
	try {
		for (const base of ['extensions', '.build/builtInExtensions']) {
			for (const entry of await fs.readdir(path.join(root, base), { withFileTypes: true })) {
				if (!entry.isDirectory()) {
					continue;
				}
				let manifest: Manifest;
				try {
					manifest = JSON.parse(await fs.readFile(path.join(root, base, entry.name, 'package.json'), 'utf8'));
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
						continue;
					}
					throw error;
				}
				const id = `${manifest.publisher}.${manifest.name}`;
				if (!manifest.main || /vscode-(?:api-tests|colorize|test-resolver)/.test(id)) {
					continue;
				}
				expected.push(id);
				const extension = vscode.extensions.getExtension(id);
				if (!extension) {
					failures.push({ id, error: 'Built-in manifest was not discovered.' });
					continue;
				}
				try {
					await extension.activate();
					if (!extension.isActive) {
						throw new Error('Extension was not active after activation.');
					}
					activated.push(id);
				} catch (error) {
					failures.push({ id, error: error instanceof Error ? error.stack ?? error.message : String(error) });
				}
			}
		}
		const fixture = path.join(context.extensionPath, '..', 'fixture');
		const typeScript = await vscode.workspace.openTextDocument(path.join(fixture, 'sample.ts'));
		await vscode.window.showTextDocument(typeScript);
		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', typeScript.uri);
		services.typeScriptSymbols = symbols?.length ?? 0;
		for (const [name, file, character] of [
			['htmlCompletions', 'sample.html', 1],
			['cssCompletions', 'sample.css', 0],
			['jsonCompletions', 'package.json', 2],
		] as const) {
			const document = await vscode.workspace.openTextDocument(path.join(fixture, file));
			const completions = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', document.uri, new vscode.Position(0, character));
			services[name] = completions?.items.length ?? 0;
		}
		await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(fixture, 'sample.md')));
	} catch (error) {
		failures.push({ id: 'validation', error: error instanceof Error ? error.stack ?? error.message : String(error) });
	}
	await fs.writeFile(resultFile, JSON.stringify({ platform: process.platform, expected, activated, failures, services }, null, 2));
}
