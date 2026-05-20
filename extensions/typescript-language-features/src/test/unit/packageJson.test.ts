/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import 'mocha';

interface ContributedCommand {
	readonly command: string;
	readonly enablement?: string;
}

interface ContributedMenuItem {
	readonly command: string;
	readonly when?: string;
}

suite('package.json', () => {
	const tsClientGuard = '!config.js/ts.experimental.useTsgo && !config.typescript.experimental.useTsgo && typescript.isManagedFile';
	const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));

	test('sort imports and remove unused imports commands are gated to the built-in ts client', () => {
		const commands = new Map<string, ContributedCommand>((packageJson.contributes.commands as ContributedCommand[]).map(command => [command.command, command]));

		for (const commandId of [
			'typescript.sortImports',
			'javascript.sortImports',
			'typescript.removeUnusedImports',
			'javascript.removeUnusedImports',
		]) {
			assert.strictEqual(commands.get(commandId)?.enablement, tsClientGuard, `${commandId} enablement`);
		}
	});

	test('sort imports and remove unused imports command palette entries are gated to the built-in ts client', () => {
		const commandPaletteEntries = new Map<string, ContributedMenuItem>((packageJson.contributes.menus.commandPalette as ContributedMenuItem[]).map(menu => [menu.command, menu]));

		assert.strictEqual(
			commandPaletteEntries.get('typescript.sortImports')?.when,
			`${tsClientGuard} && supportedCodeAction =~ /(\\s|^)source\\.sortImports\\b/ && editorLangId =~ /^typescript(react)?$/`,
		);
		assert.strictEqual(
			commandPaletteEntries.get('javascript.sortImports')?.when,
			`${tsClientGuard} && supportedCodeAction =~ /(\\s|^)source\\.sortImports\\b/ && editorLangId =~ /^javascript(react)?$/`,
		);
		assert.strictEqual(
			commandPaletteEntries.get('typescript.removeUnusedImports')?.when,
			`${tsClientGuard} && supportedCodeAction =~ /(\\s|^)source\\.removeUnusedImports\\b/ && editorLangId =~ /^typescript(react)?$/`,
		);
		assert.strictEqual(
			commandPaletteEntries.get('javascript.removeUnusedImports')?.when,
			`${tsClientGuard} && supportedCodeAction =~ /(\\s|^)source\\.removeUnusedImports\\b/ && editorLangId =~ /^javascript(react)?$/`,
		);
	});
});
