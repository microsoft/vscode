/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../../platform/contextview/browser/contextView.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AccessibleView } from '../../../../accessibility/browser/accessibleView.js';
import { ChatPetJumpGameAccessibleView } from '../../../browser/accessibility/chatPetJumpGameAccessibleView.js';
import { ChatPetJumpGame } from '../../../browser/widget/chatPetJumpGame.js';
import { IChatPetWidgetService } from '../../../browser/widget/chatPetWidgetService.js';
import '../../../browser/widget/media/chatPet.css';

suite('ChatPetJumpGameAccessibleView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createHarness(type = AccessibleViewType.View) {
		const root = dom.append(mainWindow.document.body, dom.$('.monaco-workbench'));
		root.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px';
		store.add(toDisposable(() => root.remove()));
		const platform = dom.append(root, dom.$('div'));
		platform.style.cssText = 'position:absolute;left:200px;top:200px;width:400px;height:40px';
		const overlay = dom.append(root, dom.$('.chat-pet-overlay'));
		const pet = dom.append(overlay, dom.$('button.chat-pet-button'));
		pet.style.cssText = 'left:376px;top:152px';
		const contextContainer = dom.append(root, dom.$('div'));
		const contextViewService = new class extends mock<IContextViewService>() {
			private delegate: IContextViewDelegate | undefined;
			private rendered: IDisposable | undefined;

			override showContextView(delegate: IContextViewDelegate): IOpenContextView {
				this.hideContextView();
				this.delegate = delegate;
				this.rendered = delegate.render(contextContainer) ?? undefined;
				return { close: () => this.hideContextView() };
			}

			override hideContextView(): void {
				const delegate = this.delegate;
				const rendered = this.rendered;
				this.delegate = undefined;
				this.rendered = undefined;
				delegate?.onHide?.();
				rendered?.dispose();
				dom.clearNode(contextContainer);
			}
		}();
		store.add(toDisposable(() => contextViewService.hideContextView()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextViewService, contextViewService);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		const exits: string[] = [];
		const game = store.add(instantiationService.createInstance(ChatPetJumpGame, overlay, pet, {
			bounds: root,
			platform,
			motionReduced: true,
			onRender: () => { },
			onExit: reason => {
				exits.push(reason);
				game.dispose();
			},
		}));
		instantiationService.stub(IChatPetWidgetService, {
			getFocusedJumpGame: () => game.isFocused() ? game : undefined,
		});
		const view = store.add(instantiationService.createInstance(AccessibleView));
		const show = spy(view, 'show');
		store.add(toDisposable(() => show.restore()));
		const modelService = instantiationService.get(IModelService);
		store.add(toDisposable(() => modelService.getModels().forEach(model => model.dispose())));
		const provider = instantiationService.invokeFunction(accessor => new ChatPetJumpGameAccessibleView(type).getProvider(accessor));
		assert.ok(provider);
		store.add(provider);
		view.show(provider);
		await timeout(0);
		const focusPet = spy(pet, 'focus');
		store.add(toDisposable(() => focusPet.restore()));

		const showHelp = async () => {
			view.showAccessibleViewHelp();
			await timeout(0);
			const help = show.lastCall.args[0];
			assert.ok(help);
			store.add(help);
			return help;
		};
		const replace = () => {
			const replacement = dom.$('button', undefined, 'Replacement');
			contextViewService.showContextView({
				getAnchor: () => ({ x: 0, y: 0 }),
				render: container => {
					container.appendChild(replacement);
					replacement.focus();
					return toDisposable(() => replacement.remove());
				},
			});
			return replacement;
		};
		return { root, pet, game, exits, provider, view, show, showHelp, replace, contextViewService, focusPet };
	}

	async function nextFrames(): Promise<void> {
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve())));
	}

	for (const type of [AccessibleViewType.View, AccessibleViewType.Help]) {
		test(`normal ${type} close resumes the game and restores pet focus`, async () => {
			const { root, pet, game, exits, provider, contextViewService } = await createHarness(type);
			provider.onClose();
			contextViewService.hideContextView();
			await nextFrames();
			const chargeEvent = new mainWindow.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
			Object.defineProperty(chargeEvent, 'keyCode', { value: 32 });
			pet.dispatchEvent(chargeEvent);
			await nextFrames();
			assert.deepStrictEqual({
				focused: game.isFocused(),
				activeElement: mainWindow.document.activeElement === pet,
				exits,
				charging: root.querySelectorAll('.chat-pet-jump-charge-cell.filled').length > 0,
			}, {
				focused: true, activeElement: true, exits: [], charging: true,
			});
		});

		test(`replacing ${type} releases the pause without taking replacement focus`, async () => {
			const { root, exits, replace, focusPet } = await createHarness(type);
			const replacement = replace();
			await nextFrames();
			assert.deepStrictEqual({
				exits,
				focused: mainWindow.document.activeElement === replacement,
				petFocusCalls: focusPet.callCount,
				gameLayers: root.querySelectorAll('.chat-pet-jump-effects, .chat-pet-jump-game').length,
			}, { exits: ['blur'], focused: true, petFocusCalls: 0, gameLayers: 0 });
		});
	}

	test('nested help keeps the game paused until the restored accessible view closes', async () => {
		const { game, exits, view, show, showHelp, contextViewService } = await createHarness();
		const content = game.getAccessibleContent();
		const help = await showHelp();
		await nextFrames();
		const duringHelp = { exits: [...exits], focused: game.isFocused(), content: game.getAccessibleContent() };
		help.onClose();
		await timeout(0);
		const restoredProvider = show.lastCall.args[0];
		assert.ok(restoredProvider);
		store.add(restoredProvider);
		await nextFrames();
		const afterHelp = { exits: [...exits], focused: game.isFocused(), content: game.getAccessibleContent() };
		assert.ok(view.editorWidget.getValue().includes(content));
		restoredProvider.onClose();
		contextViewService.hideContextView();
		await nextFrames();
		assert.deepStrictEqual({ duringHelp, afterHelp, final: { exits, focused: game.isFocused() } }, {
			duringHelp: { exits: [], focused: false, content },
			afterHelp: { exits: [], focused: false, content },
			final: { exits: [], focused: true },
		});
	});

	test('replacing nested help releases the pause without restoring the game view or focus', async () => {
		const { root, exits, showHelp, replace, focusPet } = await createHarness();
		await showHelp();
		const replacement = replace();
		await nextFrames();
		assert.deepStrictEqual({
			exits,
			focused: mainWindow.document.activeElement === replacement,
			petFocusCalls: focusPet.callCount,
			gameLayers: root.querySelectorAll('.chat-pet-jump-effects, .chat-pet-jump-game').length,
		}, { exits: ['blur'], focused: true, petFocusCalls: 0, gameLayers: 0 });
	});

	test('replacing the view restored from nested help still releases its pause', async () => {
		const { root, exits, showHelp, replace, focusPet } = await createHarness();
		const help = await showHelp();
		help.onClose();
		await timeout(0);
		const replacement = replace();
		await nextFrames();
		assert.deepStrictEqual({
			exits,
			focused: mainWindow.document.activeElement === replacement,
			petFocusCalls: focusPet.callCount,
			gameLayers: root.querySelectorAll('.chat-pet-jump-effects, .chat-pet-jump-game').length,
		}, { exits: ['blur'], focused: true, petFocusCalls: 0, gameLayers: 0 });
	});

	test('refreshing the same provider preserves its pause and final replacement cleanup', async () => {
		const { game, exits, view, replace } = await createHarness();
		view.show();
		await timeout(0);
		await nextFrames();
		const refreshed = { exits: [...exits], focused: game.isFocused() };
		const replacement = replace();
		await nextFrames();
		assert.deepStrictEqual({ refreshed, exits, focused: mainWindow.document.activeElement === replacement }, {
			refreshed: { exits: [], focused: false }, exits: ['blur'], focused: true,
		});
	});
});
