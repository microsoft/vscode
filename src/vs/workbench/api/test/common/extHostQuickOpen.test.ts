/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadQuickOpenShape, TransferQuickInput } from '../../common/extHost.protocol.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { createExtHostQuickOpen } from '../../common/extHostQuickOpen.js';
import { IExtHostWorkspaceProvider } from '../../common/extHostWorkspace.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostQuickOpen', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture() {
		const updates: TransferQuickInput[] = [];
		const disposedIds: number[] = [];
		const proxy = new class extends mock<MainThreadQuickOpenShape>() {
			override async $createOrUpdate(update: TransferQuickInput): Promise<void> {
				updates.push(update);
			}
			override async $dispose(id: number): Promise<void> {
				disposedIds.push(id);
			}
		};
		const quickOpen = createExtHostQuickOpen(
			SingleProxyRPCProtocol(proxy),
			new class extends mock<IExtHostWorkspaceProvider>() { },
			new class extends mock<ExtHostCommands>() { },
		);
		return { quickOpen, updates, disposedIds };
	}

	for (const kind of ['quickPick', 'inputBox'] as const) {
		test(`${kind} unregisters disposed sessions without unregistering hidden or live sessions`, () => {
			const { quickOpen, updates, disposedIds } = createFixture();
			const createInput = () => store.add(kind === 'quickPick'
				? quickOpen.createQuickPick(nullExtensionDescription)
				: quickOpen.createInputBox(nullExtensionDescription));
			const first = createInput();
			const second = createInput();
			const events: string[] = [];
			store.add(first.onDidHide(() => events.push('hide')));
			store.add(first.onDidChangeValue(value => events.push(value)));
			first.show();
			second.show();
			const firstId = updates[0].id;
			const secondId = updates[1].id;

			first.hide();
			quickOpen.$onDidHide(firstId);
			quickOpen.$onDidChangeValue(firstId, 'before-dispose');
			first.dispose();
			first.dispose();
			quickOpen.$onDidChangeValue(firstId, 'after-dispose');
			quickOpen.$onDidChangeValue(secondId, 'live');

			assert.deepStrictEqual({
				events,
				disposedIds,
				disposedValue: first.value,
				liveValue: second.value,
			}, {
				events: ['hide', 'before-dispose'],
				disposedIds: [firstId],
				disposedValue: 'before-dispose',
				liveValue: 'live',
			});
		});

		test(`${kind} preserves reentrant disposal and replacement creation during hide`, () => {
			const { quickOpen, updates, disposedIds } = createFixture();
			const createInput = () => store.add(kind === 'quickPick'
				? quickOpen.createQuickPick(nullExtensionDescription)
				: quickOpen.createInputBox(nullExtensionDescription));
			const first = createInput();
			first.value = 'original';
			let replacement: vscode.QuickInput | undefined;
			const events: string[] = [];
			store.add(first.onDidHide(() => {
				events.push('hide');
				first.dispose();
				replacement = createInput();
				replacement.show();
			}));
			first.show();
			const firstId = updates[0].id;

			first.dispose();
			first.dispose();
			assert.ok(replacement);
			quickOpen.$onDidChangeValue(firstId, 'stale');
			quickOpen.$onDidChangeValue(updates[1].id, 'replacement');

			assert.deepStrictEqual({
				events,
				disposedIds,
				disposedValue: first.value,
				replacementValue: replacement.value,
			}, {
				events: ['hide'],
				disposedIds: [firstId],
				disposedValue: 'original',
				replacementValue: 'replacement',
			});
		});
	}
});
