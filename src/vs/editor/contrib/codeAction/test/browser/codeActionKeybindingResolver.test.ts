/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { organizeImportsCommandId, refactorCommandId } from '../../browser/codeAction.js';
import { CodeActionKeybindingResolver } from '../../browser/codeActionKeybindingResolver.js';
import { CodeActionKind } from '../../common/types.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';

suite('CodeActionKeybindingResolver', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const refactorKeybinding = createCodeActionKeybinding(
		KeyCode.KeyA,
		refactorCommandId,
		{ kind: CodeActionKind.Refactor.value });

	const refactorExtractKeybinding = createCodeActionKeybinding(
		KeyCode.KeyB,
		refactorCommandId,
		{ kind: CodeActionKind.Refactor.append('extract').value });

	const organizeImportsKeybinding = createCodeActionKeybinding(
		KeyCode.KeyC,
		organizeImportsCommandId,
		undefined);

	test('Should match refactor keybindings', async function () {
		const resolver = new CodeActionKeybindingResolver(
			createMockKeyBindingService([refactorKeybinding])
		).getResolver();

		assert.strictEqual(
			resolver({ title: '' }),
			undefined);

		assert.strictEqual(
			resolver({ title: '', kind: CodeActionKind.Refactor.value }),
			refactorKeybinding.resolvedKeybinding);

		assert.strictEqual(
			resolver({ title: '', kind: CodeActionKind.Refactor.append('extract').value }),
			refactorKeybinding.resolvedKeybinding);

		assert.strictEqual(
			resolver({ title: '', kind: CodeActionKind.QuickFix.value }),
			undefined);
	});

	test('Should prefer most specific keybinding', async function () {
		const resolver = new CodeActionKeybindingResolver(
			createMockKeyBindingService([refactorKeybinding, refactorExtractKeybinding, organizeImportsKeybinding])
		).getResolver();

		assert.strictEqual(
			resolver({ title: '', kind: CodeActionKind.Refactor.value }),
			refactorKeybinding.resolvedKeybinding);

		assert.strictEqual(
			resolver({ title: '', kind: CodeActionKind.Refactor.append('extract').value }),
			refactorExtractKeybinding.resolvedKeybinding);
	});

	test('Organize imports should still return a keybinding even though it does not have args', async function () {
		const resolver = new CodeActionKeybindingResolver(
			createMockKeyBindingService([refactorKeybinding, refactorExtractKeybinding, organizeImportsKeybinding])
		).getResolver();

		assert.strictEqual(
			resolver({ title: '', kind: CodeActionKind.SourceOrganizeImports.value }),
			organizeImportsKeybinding.resolvedKeybinding);
	});
});

function createMockKeyBindingService(items: ResolvedKeybindingItem[]): IKeybindingService {
	return <IKeybindingService>{
		getKeybindings: (): readonly ResolvedKeybindingItem[] => {
			return items;
		},
	};
}

function createCodeActionKeybinding(keycode: KeyCode, command: string, commandArgs: any) {
	return new ResolvedKeybindingItem(
		new USLayoutResolvedKeybinding(
			[new KeyCodeChord(false, true, false, false, keycode)],
			OperatingSystem.Linux),
		command,
		commandArgs,
		undefined,
		false,
		null,
		false);
}
