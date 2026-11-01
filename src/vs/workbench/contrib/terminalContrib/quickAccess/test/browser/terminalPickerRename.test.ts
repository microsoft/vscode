/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInputBox, IQuickInput, IQuickInputHideEvent, IQuickInputService, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { ITerminalPickerRestoreState, TerminalPickerRenameController } from '../../browser/terminalQuickAccess.js';

suite('TerminalPickerRename', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let controller: TerminalPickerRenameController;
	let currentQuickInput: IQuickInput | undefined;
	let inputs: TestInputBox[];
	let terminal: ITerminalInstance;
	let available: boolean;
	let renamed: string[];
	let restored: ITerminalPickerRestoreState[];
	let state: ITerminalPickerRestoreState;

	class TestInputBox extends mock<IInputBox>() {
		readonly accepted = store.add(new Emitter<void>());
		readonly hidden = store.add(new Emitter<IQuickInputHideEvent>());
		override readonly onDidAccept = this.accepted.event;
		override readonly onDidHide = this.hidden.event;
		override value = '';
		override prompt: string | undefined;
		visible = false;
		disposed = false;

		override show(): void {
			this.visible = true;
			currentQuickInput = this;
		}

		override hide(): void {
			this.hideWithReason(QuickInputHideReason.Other);
		}

		hideWithReason(reason: QuickInputHideReason): void {
			if (!this.visible) {
				return;
			}
			this.visible = false;
			if (currentQuickInput === this) {
				currentQuickInput = undefined;
			}
			this.hidden.fire({ reason });
		}

		override dispose(): void {
			this.hide();
			this.disposed = true;
			this.accepted.dispose();
			this.hidden.dispose();
		}
	}

	setup(() => {
		currentQuickInput = undefined;
		inputs = [];
		available = true;
		renamed = [];
		restored = [];
		state = { value: 'term build', valueSelection: [5, 10], terminalId: 12 };
		terminal = new class extends mock<ITerminalInstance>() {
			override readonly instanceId = 12;
			override title = 'build';
			override rename(title: string): void { renamed.push(title); this.title = title; }
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IQuickInputService, {
			createInputBox: () => {
				const input = new TestInputBox();
				inputs.push(input);
				return input;
			},
			get currentQuickInput() { return currentQuickInput; }
		});
		controller = store.add(instantiationService.createInstance(TerminalPickerRenameController));
	});

	function rename(): TestInputBox {
		controller.rename(terminal, state, () => available, savedState => restored.push(savedState));
		return inputs[inputs.length - 1];
	}

	test('confirms the rename and restores query, selection, and terminal identity after hiding', async () => {
		const input = rename();
		strictEqual(input.value, 'build');
		input.value = 'logs';
		input.accepted.fire();
		deepStrictEqual({ renamed, restored, disposed: input.disposed }, { renamed: ['logs'], restored: [], disposed: true });
		await Promise.resolve();
		deepStrictEqual(restored, [{ value: 'term build', valueSelection: [5, 10], terminalId: 12 }]);
	});

	test('Escape restores the picker without renaming', async () => {
		const input = rename();
		input.value = 'unconfirmed';
		input.hideWithReason(QuickInputHideReason.Gesture);
		await Promise.resolve();
		deepStrictEqual({ renamed, restored, disposed: input.disposed }, { renamed: [], restored: [state], disposed: true });
	});

	for (const reason of [QuickInputHideReason.Blur, QuickInputHideReason.Other]) {
		test(`does not restore after hide reason ${reason}`, async () => {
			const input = rename();
			input.hideWithReason(reason);
			await Promise.resolve();
			deepStrictEqual({ renamed, restored, disposed: input.disposed }, { renamed: [], restored: [], disposed: true });
		});
	}

	test('does not replace another quick input opened before restoration', async () => {
		const input = rename();
		input.accepted.fire();
		const replacement = new TestInputBox();
		replacement.show();
		await Promise.resolve();
		deepStrictEqual(restored, []);
		strictEqual(currentQuickInput, replacement);
		replacement.dispose();
	});

	test('a superseding rename invalidates the previous restoration', async () => {
		const first = rename();
		first.accepted.fire();
		const second = rename();
		second.hideWithReason(QuickInputHideReason.Blur);
		await Promise.resolve();
		deepStrictEqual(restored, []);
	});

	test('does not rename a closed terminal but still returns to the picker', async () => {
		const input = rename();
		available = false;
		input.value = 'logs';
		input.accepted.fire();
		await Promise.resolve();
		deepStrictEqual({ renamed, restored }, { renamed: [], restored: [state] });
	});

	test('does not open a rename input for an unavailable terminal', () => {
		available = false;
		rename();
		deepStrictEqual(inputs, []);
	});

	test('disposing the controller closes its input without restoring', async () => {
		const input = rename();
		controller.dispose();
		await Promise.resolve();
		deepStrictEqual({ renamed, restored, visible: input.visible, disposed: input.disposed }, { renamed: [], restored: [], visible: false, disposed: true });
	});

	test('disposing after acceptance cancels a queued restoration', async () => {
		rename().accepted.fire();
		controller.dispose();
		await Promise.resolve();
		deepStrictEqual(restored, []);
	});

	test('an empty name keeps the existing title and returns to the picker', async () => {
		const input = rename();
		input.value = '';
		input.accepted.fire();
		await Promise.resolve();
		deepStrictEqual({ renamed, title: terminal.title, restored }, { renamed: [], title: 'build', restored: [state] });
	});

	test('copies the search selection before the old picker can change it', async () => {
		const selection: [number, number] = [5, 10];
		state = { value: 'term build', valueSelection: selection, terminalId: 12 };
		const input = rename();
		selection[0] = 0;
		input.hideWithReason(QuickInputHideReason.Gesture);
		await Promise.resolve();
		deepStrictEqual(restored[0], { value: 'term build', valueSelection: [5, 10], terminalId: 12 });
	});
});
