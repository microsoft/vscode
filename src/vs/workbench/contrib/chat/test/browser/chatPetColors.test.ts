/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Color } from '../../../../../base/common/color.js';
import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { TestChatEntitlementService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID, ChatPetAchievementIds, getChatPetAchievement, getChatPetAchievementPresentation } from '../../browser/chatPetAchievements.js';
import '../../browser/chatPetAchievements.contribution.js';
import { CHAT_PET_BLOBBY_COMMAND_ID, CHAT_PET_CHANGE_COLOR_COMMAND_ID, ChatPetColor, chatPetColorPresets, getChatPetBodyColor, getChatPetColoredSprite, getChatPetEyeColor, parseChatPetColor, setChatPetImageSource } from '../../browser/chatPetColors.js';
import { ChatPetService, IChatPetService } from '../../browser/chatPetService.js';
import { ChatPetAchievementsEditorInput, IChatPetCustomizationEditorOptions } from '../../browser/chatPetAchievementsEditorInput.js';
import { ChatPetColorsWidget } from '../../browser/chatPetColorsWidget.js';
import { getChatPetSpriteSources } from '../../browser/widget/chatPetWidget.js';

suite('Chat Pet Colors', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		if (mainWindow.location.protocol === `${Schemas.file}:`) {
			// Keep preview assets on the file: origin of the Electron test document.
			sinon.stub(FileAccess, 'asBrowserUri').callsFake(resource => FileAccess.asFileUri(resource));
		}
	});
	teardown(() => sinon.restore());

	function createService(storage = store.add(new TestStorageService())) {
		return store.add(new ChatPetService(storage, new NullTelemetryServiceShape(), new NullLogService()));
	}

	function createCommandHarness() {
		const service = createService();
		const instantiationService = store.add(new TestInstantiationService());
		const entitlement = new class extends TestChatEntitlementService {
			override readonly sentiment = { hidden: false };
		}();
		instantiationService.stub(IChatEntitlementService, entitlement);
		instantiationService.stub(IChatPetService, service);
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() { }());
		const opened: IChatPetCustomizationEditorOptions[] = [];
		instantiationService.stub(IEditorService, 'openEditor', async (input: ChatPetAchievementsEditorInput, options: IChatPetCustomizationEditorOptions) => {
			store.add(input);
			opened.push(options);
			return undefined;
		});
		const run = async (id: string) => {
			const command = CommandsRegistry.getCommand(id);
			assert.ok(command, id);
			await instantiationService.invokeFunction(accessor => command.handler(accessor));
		};
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string): Promise<T | undefined> {
				await run(id);
				return undefined;
			}
		}());
		return { service, opened, run, entitlement };
	}

	function createColorWidget(unlocked = false) {
		const parent = DOM.$('div');
		mainWindow.document.body.append(parent);
		store.add(toDisposable(() => parent.remove()));
		const service = createService();
		service.toggle();
		service.setColor('stable');
		if (unlocked) {
			service.unlockAchievement(ChatPetAchievementIds.Blobby);
		}
		let closeCount = 0;
		const widget = store.add(new ChatPetColorsWidget(parent, () => closeCount++, service, new TestThemeService(), new NullLogService()));
		widget.layout(new DOM.Dimension(800, 500));
		const input = parent.querySelector<HTMLInputElement>('input[aria-label="Custom hex color"]');
		const picker = parent.querySelector<HTMLInputElement>('input[type="color"]');
		const apply = parent.querySelector<HTMLElement>('.chat-pet-custom-color-inputs .monaco-button');
		assert.ok(input && picker && apply);
		const setInput = (value: string) => {
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		};
		return { parent, service, widget, input, picker, apply, setInput, getCloseCount: () => closeCount };
	}

	async function loadImage(url: string): Promise<HTMLImageElement> {
		const image = DOM.$<HTMLImageElement>('img');
		setImageSource(image, url);
		await image.decode();
		return image;
	}

	function setImageSource(image: HTMLImageElement, url: string): void {
		// Electron's test document uses file:, unlike the workbench's vscode-file: origin.
		image.src = mainWindow.location.protocol === `${Schemas.file}:` ? FileAccess.uriToFileUri(URI.parse(url)).toString(true) : url;
	}

	function getPixels(source: HTMLImageElement | HTMLCanvasElement): ImageData {
		const canvas = DOM.$<HTMLCanvasElement>('canvas');
		canvas.width = source.width;
		canvas.height = source.height;
		const context = canvas.getContext('2d');
		assert.ok(context);
		context.drawImage(source, 0, 0);
		return context.getImageData(0, 0, canvas.width, canvas.height);
	}

	test('accepts opaque hex colors and presets, normalizing shorthand', () => {
		assert.deepStrictEqual(
			['stable', 'insiders', '#F80', ' #AbC123 ', '#000000', '#ffffff', '#1234', '#12345678', '#ggg', 'red', '', 'transparent', 'rgb(1, 2, 3)'].map(parseChatPetColor),
			['stable', 'insiders', '#ff8800', '#abc123', '#000000', '#ffffff', undefined, undefined, undefined, undefined, undefined, undefined, undefined],
		);
		assert.ok(chatPetColorPresets.every(preset => parseChatPetColor(preset.color) === preset.color));
	});

	test('uses the official Exploration orange instead of a generic orange preset', () => {
		assert.deepStrictEqual({
			exploration: chatPetColorPresets.find(preset => preset.label === 'Exploration'),
			firstRow: chatPetColorPresets.slice(0, 5).map(preset => preset.label),
			hasGenericOrange: chatPetColorPresets.some(preset => preset.label === 'Orange'),
			previousOrangeRemainsValid: parseChatPetColor('#ed9844'),
		}, {
			exploration: { color: '#ff8c00', label: 'Exploration' },
			firstRow: ['Stable', 'Insiders', 'Exploration', 'Red', 'Yellow'],
			hasGenericOrange: false,
			previousOrangeRemainsValid: '#ed9844',
		});
	});

	test('preserves legacy appearance and keeps Stable and Insiders free', () => {
		const storage = store.add(new TestStorageService());
		storage.store('chat.vscodePet.variant', 'stable', StorageScope.APPLICATION, StorageTarget.USER);
		const service = createService(storage);
		assert.strictEqual(service.color.get(), 'stable');
		service.setColor('insiders');
		assert.strictEqual(createService(storage).color.get(), 'insiders');
		service.resetAchievements();
		assert.strictEqual(service.color.get(), 'insiders');
		service.setColor('stable');
		assert.throws(() => service.setColor('#ff8800'), /Use \/blobby/);
		service.toggle();
		assert.throws(() => service.setColor('#ff8800'), /Use \/blobby/);
		service.unlockAchievement(ChatPetAchievementIds.Blobby);
		assert.throws(() => service.setColor('#invalid'), /Invalid chat pet color/);
	});

	test('persists, synchronizes, and resets custom colors independently of hats', () => {
		const storage = store.add(new TestStorageService());
		storage.store('chat.vscodePet.variant', 'stable', StorageScope.APPLICATION, StorageTarget.USER);
		const service = createService(storage);
		service.toggle();
		service.unlockAchievement(ChatPetAchievementIds.Blobby);
		service.unlockAchievement(ChatPetAchievementIds.FirstChatMessage);
		service.setAccessory('cowboyHat');
		service.setColor('#F80');
		const restored = createService(storage);
		const persisted = {
			color: restored.color.get(),
			stored: storage.get('chat.vscodePet.color', StorageScope.APPLICATION),
			accessory: restored.selectedAccessory.get(),
		};
		service.setColor('insiders');
		const preset = restored.color.get();
		service.setColor('#abc123');
		service.toggle();
		const disabled = restored.color.get();
		service.resetAchievements();
		assert.deepStrictEqual({
			persisted,
			preset,
			disabled,
			reset: restored.color.get(),
			unlocked: restored.unlockedAchievements.get(),
			storedAfterReset: storage.get('chat.vscodePet.color', StorageScope.APPLICATION),
		}, {
			persisted: { color: '#ff8800', stored: '#ff8800', accessory: 'cowboyHat' },
			preset: 'insiders',
			disabled: '#abc123',
			reset: 'stable',
			unlocked: [],
			storedAfterReset: undefined,
		});
	});

	test('reports invalid or locked stored colors instead of rendering them', () => {
		const storage = store.add(new TestStorageService());
		storage.store('chat.vscodePet.variant', 'insiders', StorageScope.APPLICATION, StorageTarget.USER);
		storage.store('chat.vscodePet.color', '#ff8800', StorageScope.APPLICATION, StorageTarget.USER);
		const warnings: string[] = [];
		const service = store.add(new ChatPetService(storage, new NullTelemetryServiceShape(), new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}()));
		const locked = service.color.get();
		service.toggle();
		service.unlockAchievement(ChatPetAchievementIds.Blobby);
		const unlocked = service.color.get();
		storage.store('chat.vscodePet.color', '#broken', StorageScope.APPLICATION, StorageTarget.USER);
		assert.deepStrictEqual({
			locked,
			unlocked,
			invalid: service.color.get(),
			warningCount: warnings.length,
		}, { locked: 'insiders', unlocked: '#ff8800', invalid: 'insiders', warningCount: 2 });
	});

	test('invoking Blobby turns on an inactive pet without opening the page, then opens Color while active', async () => {
		const { service, opened, run } = createCommandHarness();
		const unlocks: string[] = [];
		store.add(service.onDidUnlockAchievement(id => unlocks.push(id)));
		await run(CHAT_PET_BLOBBY_COMMAND_ID);
		const firstInvocation = { enabled: service.enabled.get(), opened: opened.length, unlocks: [...unlocks] };
		await run(CHAT_PET_BLOBBY_COMMAND_ID);
		await run(CHAT_PET_BLOBBY_COMMAND_ID);
		assert.deepStrictEqual({
			firstInvocation,
			enabled: service.enabled.get(),
			unlocks,
			opened,
		}, {
			firstInvocation: { enabled: true, opened: 0, unlocks: [ChatPetAchievementIds.Blobby] },
			enabled: true,
			unlocks: [ChatPetAchievementIds.Blobby],
			opened: [{ pinned: true, tab: 'color' }, { pinned: true, tab: 'color' }],
		});
	});

	test('Change Color opens the color page before earning True Name and does not alter the color', async () => {
		const { service, opened, run } = createCommandHarness();
		await run(CHAT_PET_CHANGE_COLOR_COMMAND_ID);
		assert.deepStrictEqual(opened, []);
		service.toggle();
		service.setColor('stable');
		await run(CHAT_PET_CHANGE_COLOR_COMMAND_ID);
		assert.deepStrictEqual({
			opened,
			color: service.color.get(),
			unlocked: service.unlockedAchievements.get(),
		}, {
			opened: [{ pinned: true, tab: 'color' }],
			color: 'stable',
			unlocked: [],
		});
	});

	test('pet customization commands respect the AI opt-out even when invoked directly', async () => {
		const { service, opened, run, entitlement } = createCommandHarness();
		entitlement.sentiment.hidden = true;
		await run(CHAT_PET_BLOBBY_COMMAND_ID);
		const activated = service.enabled.get();
		service.toggle();
		for (const command of [CHAT_PET_BLOBBY_COMMAND_ID, CHAT_PET_CHANGE_COLOR_COMMAND_ID, CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID]) {
			await run(command);
		}
		assert.deepStrictEqual({ activated, unlocked: service.unlockedAchievements.get(), opened }, { activated: false, unlocked: [], opened: [] });
	});

	test('represents color customization as an achievement without inventing a hat', () => {
		const achievement = getChatPetAchievement(ChatPetAchievementIds.Blobby);
		const unlocked = getChatPetAchievementPresentation(achievement, true);
		const locked = getChatPetAchievementPresentation(achievement, false);
		assert.deepStrictEqual({
			accessories: achievement.accessories,
			title: achievement.title,
			description: achievement.description,
			colorCustomization: achievement.colorCustomization,
			unlockedRewards: unlocked.rewardLabels,
			lockedRewards: locked.rewardLabels,
			lockedRevealsTitle: JSON.stringify(locked).includes('True Name'),
		}, {
			accessories: [],
			title: 'True Name',
			description: 'Blob the Builder? Blobby McBlobface? Nope, my name is Blobby.',
			colorCustomization: true,
			unlockedRewards: ['Color Customization'],
			lockedRewards: ['Color Customization'],
			lockedRevealsTitle: false,
		});
	});

	test('shows compact preset cards with only Stable and Insiders available before True Name', () => {
		const { parent, service, input, picker } = createColorWidget();
		const cards = Array.from(parent.querySelectorAll<HTMLElement>('.chat-pet-color-card'));
		const freeCards = cards.filter(card => card.getAttribute('aria-disabled') !== 'true').map(card => card.dataset.color);
		cards.find(card => card.dataset.color === 'insiders')?.click();
		const selectedPreset = service.color.get();
		const initiallyDisabled = input.disabled && picker.disabled;
		service.unlockAchievement(ChatPetAchievementIds.Blobby);
		assert.deepStrictEqual({
			count: cards.length,
			freeCards,
			selectedPreset,
			initiallyDisabled,
			unlockedCardCount: cards.filter(card => card.getAttribute('aria-disabled') !== 'true').length,
			customEnabled: !input.disabled && !picker.disabled,
			previewSizes: [...new Set(cards.map(card => card.querySelector('canvas')?.getBoundingClientRect().width))],
		}, {
			count: 10,
			freeCards: ['stable', 'insiders'],
			selectedPreset: 'insiders',
			initiallyDisabled: true,
			unlockedCardCount: 10,
			customEnabled: true,
			previewSizes: [64],
		});
	});

	test('uses theme colors to distinguish the selected preset card', () => {
		const { parent, service } = createColorWidget(true);
		parent.style.setProperty('--vscode-focusBorder', '#0088ff');
		parent.style.setProperty('--vscode-editorWidget-border', '#666666');
		parent.style.setProperty('--vscode-list-inactiveSelectionBackground', '#333333');
		service.setColor('#ed83b5');
		const selected = parent.querySelector<HTMLElement>('.chat-pet-color-card.selected');
		assert.ok(selected);
		const styles = mainWindow.getComputedStyle(selected);
		assert.deepStrictEqual({
			label: selected.getAttribute('aria-label'),
			border: styles.borderTopColor,
			background: styles.backgroundColor,
		}, { label: 'Pink, selected', border: 'rgb(0, 136, 255)', background: 'rgb(51, 51, 51)' });
	});

	test('cursors distinguish clickable color controls from disabled controls and text input', () => {
		const { parent, service, input, picker, apply, setInput } = createColorWidget();
		const cursors = (selector: string) => Array.from(parent.querySelectorAll<HTMLElement>(selector)).map(element => mainWindow.getComputedStyle(element).cursor);
		const locked = {
			freeCard: cursors('[data-color="stable"], [data-color="stable"] > *'),
			lockedCard: cursors('[data-color="#e6536f"], [data-color="#e6536f"] > *'),
			hex: mainWindow.getComputedStyle(input).cursor,
			picker: mainWindow.getComputedStyle(picker).cursor,
			apply: mainWindow.getComputedStyle(apply).cursor,
		};
		service.unlockAchievement(ChatPetAchievementIds.Blobby);
		setInput('#123abc');
		assert.deepStrictEqual({
			locked,
			unlocked: {
				colorCard: cursors('[data-color="#e6536f"], [data-color="#e6536f"] > *'),
				hex: mainWindow.getComputedStyle(input).cursor,
				picker: mainWindow.getComputedStyle(picker).cursor,
				apply: mainWindow.getComputedStyle(apply).cursor,
			},
		}, {
			locked: {
				freeCard: ['pointer', 'pointer', 'pointer', 'pointer'],
				lockedCard: ['default', 'default', 'default', 'default'],
				hex: 'default',
				picker: 'default',
				apply: 'default',
			},
			unlocked: {
				colorCard: ['pointer', 'pointer', 'pointer', 'pointer'],
				hex: 'text',
				picker: 'pointer',
				apply: 'pointer',
			},
		});
	});

	test('previews a custom color without applying it and validates hex input inline', () => {
		const { parent, service, setInput, input, apply } = createColorWidget(true);
		setInput('#F80');
		const previewOnly = service.color.get();
		setInput('#xyz');
		const invalid = {
			message: parent.querySelector('.chat-pet-color-validation')?.textContent,
			ariaInvalid: input.getAttribute('aria-invalid'),
			disabled: apply.getAttribute('aria-disabled'),
		};
		apply.click();
		const afterInvalidApply = service.color.get();
		setInput('#F80');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		assert.deepStrictEqual({
			previewOnly,
			invalid,
			afterInvalidApply,
			applied: service.color.get(),
			normalizedInput: input.value,
		}, {
			previewOnly: 'stable',
			invalid: { message: 'Enter a hex color such as #ff8800 or #f80.', ariaInvalid: 'true', disabled: 'true' },
			afterInvalidApply: 'stable',
			applied: '#ff8800',
			normalizedInput: '#ff8800',
		});
	});

	test('uses the color picker and preserves the selected hat when applying custom colors', () => {
		const { service, picker, input, apply } = createColorWidget(true);
		service.unlockAchievement(ChatPetAchievementIds.FirstChatMessage);
		service.setAccessory('cowboyHat');
		picker.value = '#123456';
		picker.dispatchEvent(new Event('input', { bubbles: true }));
		const beforeApply = service.color.get();
		apply.click();
		assert.deepStrictEqual({
			beforeApply,
			input: input.value,
			color: service.color.get(),
			hat: service.selectedAccessory.get(),
			seen: !service.unseenAchievements.get().includes(ChatPetAchievementIds.Blobby),
		}, { beforeApply: 'stable', input: '#123456', color: '#123456', hat: 'cowboyHat', seen: true });
	});

	test('Escape closes the color page without applying the custom draft', () => {
		const { service, input, setInput, getCloseCount } = createColorWidget(true);
		setInput('#aa33cc');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({ closed: getCloseCount(), color: service.color.get() }, { closed: 1, color: 'stable' });
	});

	test('Escape on color cards and Apply closes the page even when the buttons are disabled', () => {
		const { parent, service, getCloseCount } = createColorWidget();
		const buttons = Array.from(parent.querySelectorAll<HTMLElement>('.monaco-button'));
		for (const button of buttons) {
			button.focus();
			button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		}
		assert.deepStrictEqual({ closed: getCloseCount(), color: service.color.get() }, { closed: buttons.length, color: 'stable' });
	});

	test('unrelated achievements do not discard an unapplied color draft', () => {
		const { service, input, picker, apply, setInput } = createColorWidget(true);
		setInput('#123abc');
		service.unlockAchievement(ChatPetAchievementIds.FirstChatMessage);
		assert.deepStrictEqual({
			draft: input.value,
			picker: picker.value,
			applyEnabled: apply.getAttribute('aria-disabled'),
			selected: service.color.get(),
		}, {
			draft: '#123abc',
			picker: '#123abc',
			applyEnabled: 'false',
			selected: 'stable',
		});
	});

	test('an unchanged default color draft does not replace the original palette', () => {
		const { service, input, apply } = createColorWidget(true);
		const results = [];
		for (const color of ['stable', 'insiders'] as const) {
			service.setColor(color);
			const disabled = apply.getAttribute('aria-disabled');
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			apply.click();
			results.push({ color: service.color.get(), disabled });
		}
		assert.deepStrictEqual(results, [{ color: 'stable', disabled: 'true' }, { color: 'insiders', disabled: 'true' }]);
	});

	test('updates the scroll range when custom color validation adds content', () => {
		const { parent, widget, setInput } = createColorWidget(true);
		widget.layout(new DOM.Dimension(240, 240));
		const slider = parent.querySelector<HTMLElement>('.scrollbar.vertical .slider');
		const content = parent.querySelector<HTMLElement>('.chat-pet-achievements-content');
		assert.ok(slider && content);
		const before = { slider: Number.parseFloat(slider.style.height), scrollHeight: content.scrollHeight, clientHeight: content.clientHeight };
		setInput('#invalid');
		const after = { slider: Number.parseFloat(slider.style.height), scrollHeight: content.scrollHeight, clientHeight: content.clientHeight };
		assert.ok(after.slider < before.slider, JSON.stringify({ before, after }));
	});

	test('refreshes color cards after an external change and relocks custom controls when achievements reset', () => {
		const { service, parent, input, picker, apply } = createColorWidget(true);
		service.setColor('#ed83b5');
		const selected = parent.querySelector('.chat-pet-color-card.selected')?.getAttribute('data-color');
		service.resetAchievements();
		assert.deepStrictEqual({
			selected,
			locked: input.disabled && picker.disabled && apply.getAttribute('aria-disabled') === 'true',
			freeCards: Array.from(parent.querySelectorAll<HTMLElement>('.chat-pet-color-card')).filter(card => card.getAttribute('aria-disabled') !== 'true').map(card => card.dataset.color),
		}, { selected: '#ed83b5', locked: true, freeCards: ['stable', 'insiders'] });
	});

	test('recolors every animated and reduced-motion source without changing alpha, eyes, or props', async () => {
		const urls = new Set(Object.values(getChatPetSpriteSources('stable')).flatMap(sources => [sources.animated.url, sources.reducedMotion.url]));
		for (const effect of ['speech', 'respawn']) {
			for (const suffix of ['', '.spritesheet']) {
				urls.add(FileAccess.asBrowserUri(`vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-${effect}-stable-96${suffix}.png`).toString(true));
			}
		}
		const bodyColors = new Set([0x23a8f2, 0x0077b8, 0x004e7c]);
		const failures: string[] = [];
		for (const url of urls) {
			const image = await loadImage(url);
			const before = getPixels(image);
			const colored = getChatPetColoredSprite(image, '#cc44aa');
			const after = getPixels(colored);
			if (before.width !== after.width || before.height !== after.height) {
				failures.push(`Dimensions changed: ${url}`);
			}
			let changed = 0;
			for (let i = 0; i < before.data.length; i += 4) {
				const rgb = (before.data[i] << 16) | (before.data[i + 1] << 8) | before.data[i + 2];
				if (before.data[i + 3] !== after.data[i + 3]) {
					failures.push(`Alpha changed at ${i}: ${url}`);
					break;
				}
				if (!bodyColors.has(rgb)) {
					if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2]) {
						failures.push(`Non-body pixel changed at ${i}: ${url}`);
						break;
					}
				} else if (rgb === 0x23a8f2 && before.data[i + 3] !== 0) {
					changed++;
					if (after.data[i] !== 204 || after.data[i + 1] !== 68 || after.data[i + 2] !== 170) {
						failures.push(`Incorrect custom color at ${i}: ${url}`);
						break;
					}
				}
			}
			if (changed === 0) {
				failures.push(`No body pixels tested: ${url}`);
			}
		}
		assert.deepStrictEqual(failures, []);
	});

	test('caches recolored sheets and leaves original presets untouched', async () => {
		const image = await loadImage(getChatPetSpriteSources('stable').idle.reducedMotion.url);
		const first = getChatPetColoredSprite(image, '#ff8800');
		assert.strictEqual(getChatPetColoredSprite(image, '#ff8800'), first);
		const second = getChatPetColoredSprite(image, '#00ff00');
		assert.notStrictEqual(second, first);
		assert.strictEqual(getChatPetColoredSprite(image, 'stable'), image);
		assert.strictEqual(getChatPetColoredSprite(image, 'insiders'), image);
		setImageSource(image, getChatPetSpriteSources('stable').sleep.reducedMotion.url);
		await image.decode();
		assert.notStrictEqual(getChatPetColoredSprite(image, '#00ff00'), second);
	});

	test('network sprite sources request anonymous CORS without applying it to local schemes', () => {
		const image = DOM.$<HTMLImageElement>('img');
		const requests: { source: string; crossOrigin: string | null }[] = [];
		sinon.stub(image, 'src').set((source: string) => requests.push({ source, crossOrigin: image.crossOrigin }));
		const sources = [
			'https://vscode-cdn.example/sprite.png',
			'http://localhost/sprite.png',
			'vscode-file://vscode-app/sprite.png',
			'file:///sprite.png',
			'data:image/png;base64,',
		];
		for (const source of sources) {
			setChatPetImageSource(image, source);
		}
		assert.deepStrictEqual(requests, sources.map((source, index) => ({ source, crossOrigin: index < 2 ? 'anonymous' : null })));
	});

	test('reuses recolored sheets between image buffers and when returning to a previous state', async () => {
		const idle = getChatPetSpriteSources('stable').idle.animated.url;
		const first = await loadImage(idle);
		const second = await loadImage(idle);
		const colored = getChatPetColoredSprite(first, '#ef1234');
		const fromSecondBuffer = getChatPetColoredSprite(second, '#ef1234');
		setImageSource(first, getChatPetSpriteSources('stable').sleep.animated.url);
		await first.decode();
		getChatPetColoredSprite(first, '#ef1234');
		setImageSource(first, idle);
		await first.decode();
		assert.ok(fromSecondBuffer === colored && getChatPetColoredSprite(first, '#ef1234') === colored);
	});

	test('bounds shared recolor memory while preserving each active image cache', async () => {
		const source = getChatPetSpriteSources('stable').idle.animated.url;
		const image = await loadImage(source);
		const firstColor = '#120001';
		const first = getChatPetColoredSprite(image, firstColor);
		const temporary = await loadImage(source);
		for (const color of ['#120002', '#120003', '#120004', '#120005'] as const) {
			getChatPetColoredSprite(temporary, color);
		}
		const another = await loadImage(source);
		assert.deepStrictEqual({
			activePreserved: getChatPetColoredSprite(image, firstColor) === first,
			oldSourceEvicted: getChatPetColoredSprite(another, firstColor) !== first,
		}, { activePreserved: true, oldSourceEvicted: true });
	});

	test('keeps baked and runtime eyes readable on black and other dark colors', async () => {
		const colors: readonly ChatPetColor[] = [...chatPetColorPresets.map(preset => preset.color), '#191a1b', '#000080', '#004400'];
		assert.ok(colors.every(color => Color.fromHex(getChatPetEyeColor(color)).getContrastRatio(Color.fromHex(getChatPetBodyColor(color))) >= 3));
		const image = await loadImage(FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-idle-stable-96.png').toString(true));
		const before = getPixels(image).data;
		const after = getPixels(getChatPetColoredSprite(image, '#000000')).data;
		const eyePixels: number[][] = [];
		for (let i = 0; i < before.length; i += 4) {
			if (before[i] === 25 && before[i + 1] === 26 && before[i + 2] === 27 && before[i + 3] === 255) {
				eyePixels.push(Array.from(after.slice(i, i + 4)));
			}
		}
		assert.deepStrictEqual(eyePixels, Array.from({ length: 256 }, () => [245, 245, 245, 255]));
	});
});
