/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

const builtinCommands: string[] = ['cd', 'ls', 'which', 'echo'];

async function findFiles(dir: string, ext: string): Promise<string[]> {
	let results: string[] = [];
	const list = await fs.readdir(dir, { withFileTypes: true });
	for (const file of list) {
		const filePath = path.resolve(dir, file.name);
		if (file.isDirectory()) {
			results = results.concat(await findFiles(filePath, ext));
		} else if (file.isFile() && file.name.endsWith(ext)) {
			results.push(filePath);
		}
	}
	return results;
}


async function getCompletionSpecs(): Promise<Fig.Spec[]> {
	const completionSpecs = [] as Fig.Spec[];

	try {
		// Use a relative path to the autocomplete/src folder
		const dirPath = path.resolve(__dirname, 'autocomplete/src');
		const files = await findFiles(dirPath, '.js');
		if (files.length === 0) {
			return completionSpecs;
		}

		for (const file of files) {
			try {
				const module = await import(file);
				if (module.default) {
					completionSpecs.push(module.default as Fig.Spec);
				}
			} catch {
				continue;
			}
		}

	} catch (error) {
		console.log(`Error importing completion specs: ${error.message}`);
	}
	return completionSpecs;
}

(vscode as any).window.registerTerminalCompletionProvider({
	async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: { shellType: string; commandLine: string }, token: vscode.CancellationToken) {
		// Early cancellation check
		if (token.isCancellationRequested) {
			return;
		}

		// Skip PowerShell terminals
		if (terminalContext.shellType === 'pwsh' || terminalContext.shellType === 'python') {
			return;
		}

		const commandsInPath = await getCommandsInPath();
		const specs = await getCompletionSpecs();
		builtinCommands.forEach(command => commandsInPath.add(command));
		const result: vscode.TerminalCompletionItem[] = [];
		for (const spec of specs) {
			if (!spec.name) {
				continue;
			}
			const name = 'displayName' in spec ? spec.displayName : typeof spec.name === 'string' ? spec.name : spec.name[0];
			if (name && commandsInPath.has(name)) {
				result.push({
					label: name,
					kind: (vscode as any).TerminalCompletionItemKind.Method,
					detail: 'description' in spec && spec.description ? spec.description ?? '' : '',
				});
			}
		}
		// Return the completion results or undefined if no results
		return result.length ? result : undefined;
	}
});


async function getCommandsInPath(): Promise<Set<string>> {
	// todo: use semicolon for windows
	const paths = process.env.PATH?.split(':') || [];
	const executables = new Set<string>();

	for (const path of paths) {
		try {
			const dirExists = await fs.stat(path).then(stat => stat.isDirectory()).catch(() => false);
			if (!dirExists) {
				continue;
			}
			const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(path));
			for (const [file, fileType] of files) {
				if (fileType === vscode.FileType.File) {
					executables.add(file);
				}
			}
		} catch (e) {
			// Ignore errors for directories that can't be read
			continue;
		}
	}
	return executables;
}
