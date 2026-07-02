/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { selectSystemWideKeybindings } from '../../electron-browser/systemWideKeybindings.contribution.js';

suite('SystemWideKeybindings selection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function resolve(encoded: number): ResolvedKeybinding {
		const resolved = createUSLayoutResolvedKeybinding(encoded, OperatingSystem.Macintosh);
		assert.ok(resolved, 'expected a resolvable keybinding');
		return resolved;
	}

	function item(resolvedKeybinding: ResolvedKeybinding | undefined, command: string | null, options?: { commandArgs?: unknown; when?: string; isDefault?: boolean; systemWide?: boolean }): ResolvedKeybindingItem {
		return new ResolvedKeybindingItem(
			resolvedKeybinding,
			command,
			options?.commandArgs,
			options?.when ? ContextKeyExpr.deserialize(options.when) : undefined,
			options?.isDefault ?? false,
			null,
			false,
			options?.systemWide ?? false,
		);
	}

	test('selects only user system-wide single-combo bindings and preserves args/when', () => {
		const acceleratorBinding = resolve(KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.KeyA);

		const selection = selectSystemWideKeybindings([
			// eligible: user, system-wide, single combo, with args + when
			item(acceleratorBinding, 'workbench.action.openAgentsWindow', { commandArgs: { foo: 1 }, when: 'editorFocus', systemWide: true }),
			// ignored: not system-wide
			item(resolve(KeyMod.CtrlCmd | KeyCode.KeyB), 'noop.notSystemWide'),
			// ignored: default keybinding even if flagged
			item(resolve(KeyMod.CtrlCmd | KeyCode.KeyC), 'noop.default', { isDefault: true, systemWide: true }),
			// ignored: removal / no command
			item(resolve(KeyMod.CtrlCmd | KeyCode.KeyD), null, { systemWide: true }),
		]);

		assert.deepStrictEqual(selection, {
			candidates: [{
				accelerator: 'Ctrl+Cmd+A',
				commandId: 'workbench.action.openAgentsWindow',
				args: { foo: 1 },
				userSettingsLabel: 'ctrl+cmd+a',
				hasWhen: true,
			}],
			unsupported: [],
			duplicates: [],
		});
	});

	test('reports chords / single-modifier bindings as unsupported', () => {
		const chord = resolve(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC));

		const selection = selectSystemWideKeybindings([
			item(chord, 'noop.chord', { systemWide: true }),
		]);

		assert.deepStrictEqual(selection, {
			candidates: [],
			unsupported: ['cmd+k cmd+c'],
			duplicates: [],
		});
	});

	test('keeps the first binding on accelerator conflicts', () => {
		const selection = selectSystemWideKeybindings([
			item(resolve(KeyMod.CtrlCmd | KeyCode.KeyA), 'first.wins', { systemWide: true }),
			item(resolve(KeyMod.CtrlCmd | KeyCode.KeyA), 'second.loses', { systemWide: true }),
		]);

		assert.deepStrictEqual(selection, {
			candidates: [{
				accelerator: 'Cmd+A',
				commandId: 'first.wins',
				args: undefined,
				userSettingsLabel: 'cmd+a',
				hasWhen: false,
			}],
			unsupported: [],
			duplicates: ['cmd+a'],
		});
	});
});
