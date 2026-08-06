/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EditorCommandDefinition } from '@vscode/markdown-editor/commands';
import { debounceAsync, updatePackageJson, updatePackageNlsJson } from './updateMarkdownEditorPackageJson.mts';

const command: EditorCommandDefinition = {
	id: 'markdown.editor.cursorLeft',
	title: 'Move Cursor Left',
	action: { kind: 'cursor', command: 'left', extend: false },
	keybindings: [
		{ key: 'ArrowLeft' },
		{ key: 'b', modifiers: { ctrl: true }, platforms: ['macos'] },
	],
};

describe('updatePackageJson', () => {
	it('replaces stale generated entries and preserves manual entries', () => {
		const current = {
			name: 'test',
			contributes: {
				commands: [
					{ command: 'manual', title: 'Manual' },
					{ command: 'markdown.editor.stale', title: 'Stale', $generated: true },
				],
				menus: {
					commandPalette: [
						{ command: 'manual', when: 'editorFocus' },
						{ command: 'markdown.editor.stale', when: 'false', $generated: true },
					],
				},
				keybindings: [
					{ command: 'manual', key: 'f1' },
					{ command: 'markdown.editor.stale', key: 'f2', when: 'false', $generated: true },
				],
			},
		};

		const result = updatePackageJson(current, [command]);
		assert.equal(result.kind, 'updated');
		if (result.kind !== 'updated') {
			return;
		}
		assert.deepEqual(result.value.contributes?.commands, [
			{ command: 'manual', title: 'Manual' },
			{
				command: command.id,
				title: `%${command.id}.title%`,
				category: 'Markdown Editor',
				enablement: `activeCustomEditorId == 'vscode.markdown.editor'`,
				$generated: true,
			},
		]);
		assert.deepEqual(result.value.contributes?.menus?.commandPalette, [
			{ command: 'manual', when: 'editorFocus' },
			{
				command: command.id,
				when: 'false',
				$generated: true,
			},
		]);
		assert.deepEqual(result.value.contributes?.keybindings, [
			{ command: 'manual', key: 'f1' },
			{
				command: command.id,
				key: 'left',
				when: `activeCustomEditorId == 'vscode.markdown.editor' && markdownEditorFocus`,
				$generated: true,
			},
			{
				command: command.id,
				key: 'ctrl+b',
				when: `activeCustomEditorId == 'vscode.markdown.editor' && markdownEditorFocus && isMac`,
				$generated: true,
			},
		]);
	});

	it('returns unchanged for current generated entries', () => {
		const first = updatePackageJson({ contributes: {} }, [command]);
		assert.equal(first.kind, 'updated');
		if (first.kind !== 'updated') {
			return;
		}
		assert.deepEqual(updatePackageJson(first.value, [command]), { kind: 'unchanged' });
	});

	it('rejects collisions with manual command entries', () => {
		assert.throws(() => updatePackageJson({
			contributes: {
				commands: [{ command: command.id, title: 'Manual' }],
			},
		}, [command]), /manual entry already exists/);
	});

	it('rejects duplicate generated command entries', () => {
		assert.throws(
			() => updatePackageJson({ contributes: {} }, [command, command]),
			/duplicate Markdown editor command/,
		);
	});

	it('registers local commands without generating host keybindings', () => {
		const localCommand: EditorCommandDefinition = {
			...command,
			id: 'markdown.editor.insertTab',
			routing: 'local',
		};
		const result = updatePackageJson({ contributes: {} }, [localCommand]);
		assert.equal(result.kind, 'updated');
		if (result.kind !== 'updated') {
			return;
		}
		assert.deepEqual(result.value.contributes?.commands, [{
			command: localCommand.id,
			title: `%${localCommand.id}.title%`,
			category: 'Markdown Editor',
			enablement: `activeCustomEditorId == 'vscode.markdown.editor'`,
			$generated: true,
		}]);
		assert.deepEqual(result.value.contributes?.menus?.commandPalette, [{
			command: localCommand.id,
			when: 'false',
			$generated: true,
		}]);
		assert.deepEqual(result.value.contributes?.keybindings, []);
	});
});

describe('updatePackageNlsJson', () => {
	it('replaces generated command titles and preserves manual entries', () => {
		const result = updatePackageNlsJson({
			displayName: 'Markdown Language Features',
			'markdown.editor.stale.title': 'Stale',
			description: 'Provides rich language support for Markdown.',
		}, [command]);

		assert.deepEqual(result, {
			kind: 'updated',
			value: {
				displayName: 'Markdown Language Features',
				[`${command.id}.title`]: {
					message: command.title,
					comment: ['Generated from @vscode/markdown-editor/commands. Do not edit manually.'],
					$generated: true,
				},
				description: 'Provides rich language support for Markdown.',
			},
		});
	});

	it('returns unchanged for current generated command titles', () => {
		const current = {
			displayName: 'Markdown Language Features',
			[`${command.id}.title`]: {
				message: command.title,
				comment: ['Generated from @vscode/markdown-editor/commands. Do not edit manually.'],
				$generated: true as const,
			},
		};

		assert.deepEqual(updatePackageNlsJson(current, [command]), { kind: 'unchanged' });
	});
});

describe('debounceAsync', () => {
	it('combines calls made before the delay elapses', async () => {
		let callCount = 0;
		const debounced = debounceAsync(async () => ++callCount, 0);

		const first = debounced();
		const second = debounced();

		assert.equal(first, second);
		assert.equal(await first, 1);
		assert.equal(callCount, 1);
	});
});
