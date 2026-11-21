/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
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

	teardown(() => sinon.restore());

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
		const quickOpen = store.add(createExtHostQuickOpen(
			SingleProxyRPCProtocol(proxy),
			new class extends mock<IExtHostWorkspaceProvider>() { },
			new class extends mock<ExtHostCommands>() { },
		));
		return { quickOpen, updates, disposedIds };
	}

	test('evicts completed subscriptions from the owner while it remains alive', () => {
		const { quickOpen, disposedIds } = createFixture();
		const deletions = sinon.spy(DisposableStore.prototype, 'delete');
		for (let i = 0; i < 20; i++) {
			const quickPick = store.add(quickOpen.createQuickPick(nullExtensionDescription));
			const inputBox = store.add(quickOpen.createInputBox(nullExtensionDescription));
			quickPick.dispose();
			inputBox.dispose();
		}

		assert.deepStrictEqual({
			evictedSubscriptions: deletions.callCount,
			sameOwner: deletions.alwaysCalledOn(deletions.firstCall.thisValue),
			disposedSessions: disposedIds.length,
		}, {
			evictedSubscriptions: 40,
			sameOwner: true,
			disposedSessions: 40,
		});
	});

	test('disposes active sessions with the owner and ignores late RPC events', () => {
		const { quickOpen, updates, disposedIds } = createFixture();
		const quickPick = store.add(quickOpen.createQuickPick(nullExtensionDescription));
		const inputBox = store.add(quickOpen.createInputBox(nullExtensionDescription));
		quickPick.value = 'quick pick';
		inputBox.value = 'input box';
		quickPick.show();
		inputBox.show();
		const ids = updates.map(update => update.id);
		const hidden: string[] = [];
		store.add(quickPick.onDidHide(() => hidden.push('quick pick')));
		store.add(inputBox.onDidHide(() => hidden.push('input box')));

		quickOpen.dispose();
		quickOpen.dispose();
		for (const id of ids) {
			quickOpen.$onDidChangeValue(id, 'stale');
			quickOpen.$onDidHide(id);
		}

		assert.deepStrictEqual({
			hidden,
			disposedIds,
			values: [quickPick.value, inputBox.value],
		}, {
			hidden: ['quick pick', 'input box'],
			disposedIds: ids,
			values: ['quick pick', 'input box'],
		});
	});

	test('rejects new sessions during and after owner disposal', () => {
		const { quickOpen, disposedIds } = createFixture();
		const input = store.add(quickOpen.createInputBox(nullExtensionDescription));
		const attempts: string[] = [];
		store.add(input.onDidHide(() => {
			assert.throws(() => quickOpen.createQuickPick(nullExtensionDescription), /owner is disposed/);
			attempts.push('during disposal');
		}));
		input.show();

		quickOpen.dispose();
		assert.throws(() => quickOpen.createInputBox(nullExtensionDescription), /owner is disposed/);
		attempts.push('after disposal');

		assert.deepStrictEqual({ attempts, disposedSessions: disposedIds.length }, {
			attempts: ['during disposal', 'after disposal'],
			disposedSessions: 1,
		});
	});

	for (const kind of ['quickPick', 'inputBox'] as const) {
		test(`${kind} cleans up input emitters before notifying disposal listeners`, () => {
			const { quickOpen, disposedIds } = createFixture();
			const oneShotEvents = sinon.spy(Event, 'once');
			const quickPick = kind === 'quickPick' ? store.add(quickOpen.createQuickPick(nullExtensionDescription)) : undefined;
			const input = quickPick ?? store.add(quickOpen.createInputBox(nullExtensionDescription));
			const onDidDispose = oneShotEvents.lastCall.args[0];
			let emittersDisposedAtNotification = false;
			let remoteDisposalsAtNotification = -1;
			store.add(onDidDispose(() => {
				const registrations = [
					store.add(input.onDidAccept(() => { })),
					store.add(input.onDidChangeValue(() => { })),
					store.add(input.onDidTriggerButton(() => { })),
					store.add(input.onDidHide(() => { })),
				];
				if (quickPick) {
					registrations.push(
						store.add(quickPick.onDidChangeActive(() => { })),
						store.add(quickPick.onDidChangeSelection(() => { })),
						store.add(quickPick.onDidTriggerItemButton(() => { })),
					);
				}
				emittersDisposedAtNotification = registrations.every(registration => registration === Disposable.None);
				remoteDisposalsAtNotification = disposedIds.length;
			}));

			input.dispose();

			assert.deepStrictEqual({
				emittersDisposedAtNotification,
				remoteDisposalsAtNotification,
				remoteDisposalsAfterNotification: disposedIds.length,
			}, {
				emittersDisposedAtNotification: true,
				remoteDisposalsAtNotification: 0,
				remoteDisposalsAfterNotification: 1,
			});
		});

		test(`${kind} releases lifecycle subscriptions without being shown`, () => {
			const { quickOpen, updates, disposedIds } = createFixture();
			const input = store.add(kind === 'quickPick'
				? quickOpen.createQuickPick(nullExtensionDescription)
				: quickOpen.createInputBox(nullExtensionDescription));
			const events: string[] = [];
			store.add(input.onDidHide(() => events.push('hide')));
			store.add(input.onDidChangeValue(value => events.push(value)));
			input.value = 'original';

			input.dispose();
			input.dispose();
			quickOpen.$onDidChangeValue(disposedIds[0], 'stale');

			assert.deepStrictEqual({
				events,
				updates,
				disposeCount: disposedIds.length,
				value: input.value,
			}, {
				events: [],
				updates: [],
				disposeCount: 1,
				value: 'original',
			});
		});

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
			let replacement: ReturnType<typeof createInput> | undefined;
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
