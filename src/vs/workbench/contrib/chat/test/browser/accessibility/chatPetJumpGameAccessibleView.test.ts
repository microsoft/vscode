/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { retry, timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { AccessibleContentProvider, AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../../platform/contextview/browser/contextView.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AccessibleView } from '../../../../accessibility/browser/accessibleView.js';
import { ChatPetJumpGameAccessibleView } from '../../../browser/accessibility/chatPetJumpGameAccessibleView.js';
import { ChatPetJumpGame } from '../../../browser/widget/chatPetJumpGame.js';
import { IChatPetWidgetService } from '../../../browser/widget/chatPetWidgetService.js';
import '../../../browser/widget/media/chatPet.css';

suite('ChatPetJumpGameAccessibleView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestQuickPick<T extends IQuickPickItem>(onShow: () => void, onHide: () => void) {
		return new class extends mock<IQuickPick<T>>() {
			private readonly resources = new DisposableStore();
			private readonly didAcceptEmitter = this.resources.add(new Emitter<IQuickPickDidAcceptEvent>());
			private readonly didHideEmitter = this.resources.add(new Emitter<IQuickInputHideEvent>());
			override readonly onDidAccept = this.didAcceptEmitter.event;
			override readonly onDidHide = this.didHideEmitter.event;
			override items: readonly T[] = [];
			override selectedItems: readonly T[] = [];
			private visible = false;

			override show(): void {
				this.visible = true;
				onShow();
			}

			override accept(): void {
				assert.ok(this.items.length);
				this.selectedItems = [this.items[0]];
				this.didAcceptEmitter.fire({ inBackground: false });
			}

			override hide(reason = QuickInputHideReason.Gesture): void {
				if (this.visible) {
					this.visible = false;
					onHide();
					this.didHideEmitter.fire({ reason });
				}
			}

			override dispose(): void {
				this.hide(QuickInputHideReason.Other);
				this.resources.dispose();
			}
		}();
	}

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
		const pickerInput = dom.append(root, dom.$('input'));
		const commandTarget = dom.append(root, dom.$('button', undefined, 'Keybindings'));
		const commands: { id: string; args: readonly unknown[] }[] = [];
		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string, ...args: readonly unknown[]) => {
				commands.push({ id, args });
				commandTarget.focus();
			},
		});
		let currentPicker: ReturnType<typeof createTestQuickPick> | undefined;
		let latestPicker: ReturnType<typeof createTestQuickPick> | undefined;
		const quickInputService = new class extends mock<IQuickInputService>() {
			override get currentQuickInput() { return currentPicker; }

			override createQuickPick<T extends IQuickPickItem>() {
				const picker = store.add(createTestQuickPick<T>(() => {
					const previous = currentPicker;
					currentPicker = latestPicker = picker;
					previous?.hide(QuickInputHideReason.Other);
					contextViewService.hideContextView();
					pickerInput.focus();
				}, () => {
					if (currentPicker === picker) {
						currentPicker = undefined;
					}
				}));
				return picker;
			}
		}();
		instantiationService.stub(IQuickInputService, quickInputService);
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
		const getPicker = () => {
			assert.ok(latestPicker);
			return latestPicker;
		};
		return { root, pet, game, exits, provider, view, show, showHelp, replace, contextViewService, focusPet, getPicker, pickerInput, commands, commandTarget, quickInputService };
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
			await retry(async () => assert.ok(root.querySelector('.chat-pet-jump-charge-cell.filled')), 10, 100);
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

	for (const accept of [false, true]) {
		test(`symbol picker keeps the game paused and restores the view (${accept ? 'selection' : 'cancel'})`, async () => {
			const { root, pet, game, exits, provider, view, show, getPicker, pickerInput, focusPet, replace, contextViewService } = await createHarness();
			provider.getSymbols = () => [{ label: 'Starting platform', lineNumber: 1 }];
			const content = game.getAccessibleContent();
			view.goToSymbol();
			await nextFrames();
			const whilePicking = { exits: [...exits], focused: mainWindow.document.activeElement === pickerInput, content: game.getAccessibleContent() };
			const picker = getPicker();
			if (accept) {
				picker.accept();
			} else {
				picker.hide();
			}
			await timeout(0);
			await nextFrames();
			const afterPicking = { exits: [...exits], focusedPet: game.isFocused(), content: game.getAccessibleContent(), petFocusCalls: focusPet.callCount };
			const restored = show.lastCall.args[0];
			assert.ok(restored);
			store.add(restored);
			assert.ok(view.editorWidget.getValue().includes(content));
			if (accept) {
				restored.onClose();
				contextViewService.hideContextView();
				const charge = new mainWindow.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
				Object.defineProperty(charge, 'keyCode', { value: 32 });
				pet.dispatchEvent(charge);
				await retry(async () => assert.ok(root.querySelector('.chat-pet-jump-charge-cell.filled')), 10, 100);
			} else {
				const replacement = replace();
				await nextFrames();
				assert.deepStrictEqual({ exits, focused: mainWindow.document.activeElement === replacement, petFocusCalls: focusPet.callCount }, {
					exits: ['blur'], focused: true, petFocusCalls: 0,
				});
			}
			assert.deepStrictEqual({ whilePicking, afterPicking }, {
				whilePicking: { exits: [], focused: true, content },
				afterPicking: { exits: [], focusedPet: false, content, petFocusCalls: 0 },
			});
		});
	}

	for (const accept of [false, true]) {
		test(`keybinding picker owns the pause until ${accept ? 'opening keybindings' : 'returning to the view'}`, async () => {
			const { root, game, exits, provider, view, getPicker, pickerInput, focusPet, replace, commands, commandTarget } = await createHarness();
			provider.options.configureKeybindingItems = [{ id: 'editor.action.accessibleView', label: 'Open Accessible View' }];
			view.configureKeybindings(true);
			await nextFrames();
			const whilePicking = { exits: [...exits], focused: mainWindow.document.activeElement === pickerInput };
			const picker = getPicker();
			if (accept) {
				picker.accept();
				await timeout(0);
				await nextFrames();
				assert.deepStrictEqual({
					whilePicking, exits, commands, focused: mainWindow.document.activeElement === commandTarget,
					petFocusCalls: focusPet.callCount, effects: root.querySelectorAll('.chat-pet-jump-effects').length,
				}, {
					whilePicking: { exits: [], focused: true }, exits: ['blur'],
					commands: [{ id: 'workbench.action.openGlobalKeybindings', args: ['editor.action.accessibleView'] }],
					focused: true, petFocusCalls: 0, effects: 0,
				});
			} else {
				picker.hide();
				await timeout(0);
				await nextFrames();
				const afterPicking = { exits: [...exits], focusedPet: game.isFocused() };
				const replacement = replace();
				await nextFrames();
				assert.deepStrictEqual({ whilePicking, afterPicking, exits, focused: mainWindow.document.activeElement === replacement, petFocusCalls: focusPet.callCount }, {
					whilePicking: { exits: [], focused: true }, afterPicking: { exits: [], focusedPet: false },
					exits: ['blur'], focused: true, petFocusCalls: 0,
				});
			}
		});
	}

	for (const kind of ['symbol', 'keybinding']) {
		test(`${kind} picker can return through nested help without resuming the game`, async () => {
			const { game, exits, view, show, showHelp, getPicker, replace, focusPet } = await createHarness();
			const help = await showHelp();
			assert.ok(help instanceof AccessibleContentProvider);
			help.getSymbols = () => [{ label: 'Help', lineNumber: 1 }];
			help.options.configureKeybindingItems = [{ id: 'editor.action.accessibleView', label: 'Open Accessible View' }];
			if (kind === 'symbol') {
				view.goToSymbol();
			} else {
				view.configureKeybindings(true);
			}
			await nextFrames();
			getPicker().hide();
			await timeout(0);
			await nextFrames();
			const restoredHelp = show.lastCall.args[0];
			assert.ok(restoredHelp);
			store.add(restoredHelp);
			const afterPicker = { exits: [...exits], focusedPet: game.isFocused(), type: restoredHelp.options.type };
			restoredHelp.onClose();
			await timeout(0);
			await nextFrames();
			const afterHelp = { exits: [...exits], focusedPet: game.isFocused() };
			const replacement = replace();
			await nextFrames();
			assert.deepStrictEqual({
				afterPicker, afterHelp, exits, replacementFocused: mainWindow.document.activeElement === replacement, petFocusCalls: focusPet.callCount,
			}, {
				afterPicker: { exits: [], focusedPet: false, type: AccessibleViewType.Help },
				afterHelp: { exits: [], focusedPet: false }, exits: ['blur'], replacementFocused: true, petFocusCalls: 0,
			});
		});

		for (const abandon of ['blur', 'replace', 'dispose']) {
			test(`${kind} picker releases the game when abandoned by ${abandon}`, async () => {
				const { root, exits, provider, view, show, getPicker, quickInputService, pickerInput, focusPet, commandTarget } = await createHarness();
				provider.getSymbols = () => [{ label: 'Starting platform', lineNumber: 1 }];
				provider.options.configureKeybindingItems = [{ id: 'editor.action.accessibleView', label: 'Open Accessible View' }];
				if (kind === 'symbol') {
					view.goToSymbol();
				} else {
					view.configureKeybindings(true);
				}
				await nextFrames();
				const shows = show.callCount;
				if (abandon === 'replace') {
					quickInputService.createQuickPick().show();
				} else {
					commandTarget.focus();
					if (abandon === 'blur') {
						getPicker().hide(QuickInputHideReason.Blur);
					} else {
						view.dispose();
					}
				}
				await nextFrames();
				assert.deepStrictEqual({
					exits, shows: show.callCount, effects: root.querySelectorAll('.chat-pet-jump-effects').length,
					focusKept: mainWindow.document.activeElement === (abandon === 'replace' ? pickerInput : commandTarget),
					petFocusCalls: focusPet.callCount,
				}, { exits: ['blur'], shows, effects: 0, focusKept: true, petFocusCalls: 0 });
			});
		}
	}
});
