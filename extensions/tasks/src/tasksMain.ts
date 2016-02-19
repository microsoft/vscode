/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { languages, workspace, ExtensionContext, TextDocument, Position, CancellationToken, CompletionItem, CompletionItemKind, DocumentFilter } from 'vscode';

export function activate(context: ExtensionContext): void {
	// We can't use a pattern here since it disables the normal json code complete
	// which we don't want. Do the filtering in the actual suggest
	let selector: DocumentFilter = { language: 'json' };
	let taskFileName = workspace.rootPath ? path.join(workspace.rootPath, '.vscode/tasks.json') : null;
	let items = taskFileName ? createCompletionItems() : [];

	languages.registerCompletionItemProvider(selector, {
		provideCompletionItems: (document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] => {
			if (document.fileName === taskFileName) {
				return items;
			} else {
				return [];
			}
		}
	});
}

function createCompletionItems(): CompletionItem[] {
	let result: CompletionItem[] = [];
	let item: CompletionItem;

	item = new CompletionItem('tsc');
	item.kind = CompletionItemKind.Snippet;
	item.detail = 'Use the tsc compiler on a specific file.';
	item.filterText = 'ts-tsc';
	item.insertText = [
		'"version": "0.1.0",',
		'"command": "tsc",',
		'"isShellCommand": true,',
		'"showOutput": "silent",',
		'"args": ["HelloWorld.ts"],',
		'"problemMatcher": "$tsc"'
	].join('\n');
	result.push(item);

	item = new CompletionItem('tsc - tsconfig.json');
	item.kind = CompletionItemKind.Snippet;
	item.detail = 'Use the tsc compiler with a tsconfig.json file.';
	item.filterText = 'ts-tsc - tsconfig.json';
	item.insertText = [
		'"version": "0.1.0",',
		'"command": "tsc",',
		'"isShellCommand": true,',
		'"showOutput": "silent",',
		'"args": ["-p", "."],',
		'"problemMatcher": "$tsc"'
	].join('\n');
	result.push(item);

	item = new CompletionItem('tsc - watch');
	item.kind = CompletionItemKind.Snippet;
	item.detail = 'Use the tsc compiler in watch mode.';
	item.filterText = 'ts-tsc - watch';
	item.insertText = [
		'"version": "0.1.0",',
		'"command": "tsc",',
		'"isShellCommand": true,',
		'"showOutput": "silent",',
		'"args": ["-w", "-p", "."],',
		'"problemMatcher": "$tsc-watch"'
	].join('\n');
	result.push(item);

	item = new CompletionItem('dotnet build');
	item.kind = CompletionItemKind.Snippet;
	item.detail = 'Use dotnet build.';
	item.filterText = 'ts-dotnet build';
	item.insertText = [
		'"version": "0.1.0",',
		'"command": "dotnet build",',
		'"showOutput": "always"'
	].join('\n');
	result.push(item);

	item = new CompletionItem('msbuild');
	item.kind = CompletionItemKind.Snippet;
	item.detail = 'Use msbuild to compile your project.';
	item.filterText = 'ts-msbuild';
	item.insertText = [
		'"version": "0.1.0",',
		'"command": "msbuild",',
		'"args": [',
			'\t// Ask msbuild to generate full paths for file names.',
			'\t"/property:GenerateFullPaths=true"',
		'],',
		'"taskSelector": "/t:",',
		'"showOutput": "silent",',
		'"tasks": [',
			'\t{',
			'\t\t"taskName": "build",',
			'\t\t// Show the output window only if unrecognized errors occur.',
			'\t\t"showOutput": "silent",',
			'\t\t// Use the standard MS compiler pattern to detect errors, warnings and infos',
			'\t\t"problemMatcher": "$msCompile"',
			'\t}',
		']'
	].join('\n');
	result.push(item);

	return result;
}