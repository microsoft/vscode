/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toAction, type IAction } from '../../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AccessibleViewProviderId, AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IChatTerminalToolProgressPart, ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatTerminalOutputAccessibleView } from '../../../browser/accessibility/chatTerminalOutputAccessibleView.js';

function createProgressPart(content: string | undefined, fullOutputAction: IAction | undefined, onFocusOutput: () => void): IChatTerminalToolProgressPart {
	return new class extends mock<IChatTerminalToolProgressPart>() {
		override readonly fullOutputAction = fullOutputAction;
		override getCommandAndOutputAsText(): string | undefined {
			return content;
		}
		override focusOutput(): void {
			onFocusOutput();
		}
	}();
}

suite('ChatTerminalOutputAccessibleView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function getProvider(part: IChatTerminalToolProgressPart | undefined) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ITerminalChatService, new class extends mock<ITerminalChatService>() {
			override getFocusedProgressPart(): IChatTerminalToolProgressPart | undefined {
				return part;
			}
		}());
		return instantiationService.invokeFunction(accessor => new ChatTerminalOutputAccessibleView().getProvider(accessor));
	}

	test('requires a focused output part with accessible content', () => {
		const noPart = getProvider(undefined);
		const noContent = getProvider(createProgressPart(undefined, undefined, () => { }));

		assert.deepStrictEqual({ noPart, noContent }, { noPart: undefined, noContent: undefined });
	});

	test('reuses Terminal Chat Output verbosity and restores ordinary close focus', () => {
		let focusCount = 0;
		const content = 'Command: printf output\npreview output';
		const provider = getProvider(createProgressPart(content, undefined, () => focusCount++));
		assert.ok(provider);
		store.add(provider);

		assert.deepStrictEqual({
			id: provider.id,
			type: provider.options.type,
			language: provider.options.language,
			verbositySettingKey: provider.verbositySettingKey,
			content: provider.provideContent(),
			actions: provider.actions,
			focusBeforeClose: focusCount,
		}, {
			id: AccessibleViewProviderId.ChatTerminalOutput,
			type: AccessibleViewType.View,
			language: 'text',
			verbositySettingKey: AccessibilityVerbositySettingId.TerminalChatOutput,
			content,
			actions: undefined,
			focusBeforeClose: 0,
		});

		provider.onClose();
		assert.strictEqual(focusCount, 1);
	});

	test('offers the parent action without eager loading and preserves editor focus after success', async () => {
		let openCount = 0;
		let focusCount = 0;
		const openEditor = new DeferredPromise<boolean>();
		const action = toAction({
			id: 'test.openFullOutput',
			label: 'Open Full Output',
			tooltip: 'Open Full Output',
			class: 'codicon codicon-go-to-file',
			run: () => {
				openCount++;
				return openEditor.p;
			},
		});
		const content = 'Command: printf output\nFull output is available. Use the Open Full Output action to open it in an editor.';
		const provider = getProvider(createProgressPart(content, action, () => focusCount++));
		assert.ok(provider);
		store.add(provider);

		assert.strictEqual(openCount, 0);
		assert.strictEqual(provider.provideContent(), content);
		assert.deepStrictEqual(provider.actions?.map(accessibleAction => ({
			id: accessibleAction.id,
			label: accessibleAction.label,
			tooltip: accessibleAction.tooltip,
			class: accessibleAction.class,
			enabled: accessibleAction.enabled,
		})), [{
			id: action.id,
			label: action.label,
			tooltip: action.tooltip,
			class: action.class,
			enabled: action.enabled,
		}]);

		const accessibleAction = provider.actions?.[0];
		assert.ok(accessibleAction);
		const actionResult = Promise.resolve(accessibleAction.run());
		provider.onClose();
		assert.deepStrictEqual({ openCount, focusCount }, { openCount: 1, focusCount: 0 });
		openEditor.complete(true);
		await actionResult;
		assert.deepStrictEqual({ openCount, focusCount }, { openCount: 1, focusCount: 0 });
	});

	test('restores output focus when opening full output fails', async () => {
		let focusCount = 0;
		const expectedError = new Error('open failed');
		const action = toAction({
			id: 'test.openFullOutput',
			label: 'Open Full Output',
			run: async () => {
				throw expectedError;
			},
		});
		const provider = getProvider(createProgressPart('Command: printf output\npreview output', action, () => focusCount++));
		assert.ok(provider);
		store.add(provider);

		const accessibleAction = provider.actions?.[0];
		assert.ok(accessibleAction);
		await assert.rejects(Promise.resolve(accessibleAction.run()), expectedError);
		provider.onClose();
		assert.strictEqual(focusCount, 1);
	});

	for (const rejects of [false, true]) {
		test(`restores focus if the view closes before the editor ${rejects ? 'rejects' : 'declines to open'}`, async () => {
			let focusCount = 0;
			const opening = new DeferredPromise<undefined>();
			const failure = new Error('open failed');
			const provider = getProvider(createProgressPart('Command: build\npreview', toAction({
				id: 'test.openFullOutput',
				label: 'Open Full Output',
				run: () => opening.p,
			}), () => focusCount++));
			assert.ok(provider);
			store.add(provider);
			const action = provider.actions?.[0];
			assert.ok(action);
			const result = Promise.resolve(action.run());
			provider.onClose();
			assert.strictEqual(focusCount, 0);
			if (rejects) {
				const rejected = assert.rejects(result, failure);
				opening.error(failure);
				await rejected;
			} else {
				opening.complete(undefined);
				await result;
			}
			assert.strictEqual(focusCount, 1);
		});
	}
});
