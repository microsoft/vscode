/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Color, RGBA } from '../../../../../../../../base/common/color.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { NullOpenerService } from '../../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { IModelCardOptions, IPricingDisclosure, ModelCard } from '../../../../../browser/widget/input/modelPicker/modelPickerCard.js';
import { getModelHoverContent } from '../../../../../browser/widget/input/modelPicker/modelPickerHover.js';
import { getModelConfigSummary, IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';
import '../../../../../browser/widget/input/modelPicker/media/modelPicker.css';

function createModel(metadata: Partial<ILanguageModelChatMetadata> = {}): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/test-model',
		metadata: upcastPartial<ILanguageModelChatMetadata>({
			id: 'test-model',
			name: 'Test Model',
			vendor: 'copilot',
			priceCategory: 'high',
			inputCost: 40,
			outputCost: 200,
			longContextInputCost: 80,
			configurationSchema: {
				properties: {
					effort: { type: 'string', group: 'navigation', enum: ['low', 'medium', 'high'], enumItemLabels: ['Low', 'Medium', 'High'], default: 'medium' },
					context: { type: 'number', group: 'tokens', enum: [264000, 1000000], enumItemLabels: ['264K', '1M'], default: 264000 },
					unrelated: { type: 'boolean', default: false },
				},
			},
			...metadata,
		}),
	};
}

suite('ModelCard', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createDisclosure(expanded = false): IPricingDisclosure {
		const emitter = disposables.add(new Emitter<void>());
		return {
			isExpanded: () => expanded,
			setExpanded: next => { expanded = next; emitter.fire(); },
			onDidChange: emitter.event,
		};
	}

	function createCard(configuration: IStringDictionary<unknown> = {}, options: Partial<IModelCardOptions> = {}) {
		const values = { ...configuration };
		const writes: IStringDictionary<unknown>[] = [];
		const changes: Parameters<NonNullable<IModelCardOptions['onDidChangeConfiguration']>>[] = [];
		let accepted = 0;
		const configurationAccess: IModelConfigurationAccess = options.configurationAccess ?? {
			getModelConfiguration: () => values,
			setModelConfiguration: async (_modelId, next) => {
				writes.push({ ...next });
				Object.assign(values, next);
			},
			getModelConfigurationActions: () => [],
		};
		const card = disposables.add(new ModelCard({
			model: createModel(),
			configurationAccess,
			isUBB: true,
			openerService: NullOpenerService,
			pricingDisclosure: createDisclosure(),
			onDidChangeConfiguration: (...change) => changes.push(change),
			onDidAccept: () => accepted++,
			...options,
		}));
		card.element.classList.add('monaco-reduce-motion');
		card.element.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 280px;
			font-family: sans-serif;
			--vscode-spacing-sizeNone: 0px;
			--vscode-spacing-size20: 2px;
			--vscode-spacing-size40: 4px;
			--vscode-spacing-size60: 6px;
			--vscode-spacing-size80: 8px;
			--vscode-spacing-size100: 10px;
			--vscode-spacing-size160: 16px;
			--vscode-spacing-size240: 24px;
			--vscode-strokeThickness: 1px;
			--vscode-fontSize-label2: 11px;
			--vscode-fontWeight-semiBold: 600;
		`;
		mainWindow.document.body.appendChild(card.element);
		disposables.add(toDisposable(() => card.element.remove()));
		return { card, values, writes, changes, configurationAccess, get accepted() { return accepted; } };
	}

	function element(container: ParentNode, selector: string): HTMLElement {
		const result = container.querySelector<HTMLElement>(selector);
		assert.ok(result, selector);
		return result;
	}

	function selectedOptions(card: ModelCard): string[] {
		return Array.from(card.element.querySelectorAll('[role="radio"][aria-checked="true"]'), option => option.textContent ?? '');
	}

	async function createAnimatedCard(options: Partial<IModelCardOptions> = {}) {
		const result = createCard({}, options);
		result.card.element.classList.remove('monaco-reduce-motion');
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve())));
		return result;
	}

	function pausePricingAnimations(body: HTMLElement): Animation[] {
		const animations = body.getAnimations();
		for (const animation of animations) {
			disposables.add(toDisposable(() => animation.cancel()));
			animation.pause();
		}
		return animations;
	}

	function getTextContrast(badge: HTMLElement, root: HTMLElement): number {
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		assert.ok(context);
		const backgrounds: string[] = [];
		for (let current: HTMLElement | null = badge; current; current = current.parentElement) {
			const style = getWindow(current).getComputedStyle(current);
			if (style.opacity !== '1' || style.backgroundImage !== 'none' || style.filter !== 'none' || style.mixBlendMode !== 'normal') {
				throw new Error('The contrast test requires unfiltered, opaque element groups');
			}
			backgrounds.unshift(style.backgroundColor);
			if (current === root) {
				break;
			}
		}
		const paint = (color: string) => {
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
		};
		const readColor = () => {
			const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
			assert.strictEqual(alpha, 255);
			return new Color(new RGBA(red, green, blue));
		};
		// Resolve CSS color-mix and alpha without sampling antialiased glyph pixels.
		backgrounds.forEach(paint);
		const background = readColor();
		paint(getWindow(badge).getComputedStyle(badge).color);
		return background.getContrastRatio(readColor());
	}

	for (const theme of [
		{ name: 'Dark', className: 'vs-dark', foreground: '#cccccc', background: '#1f1f1f', description: '#9d9d9d', warning: '#cca700' },
		{ name: 'Light', className: 'vs', foreground: '#3b3b3b', background: '#ffffff', description: '#3b3b3b', warning: '#bf8803' },
		{ name: 'High Contrast Dark', className: 'hc-black', foreground: '#ffffff', background: '#000000', description: 'rgba(255, 255, 255, 0.7)', warning: '#ffd370' },
		{ name: 'High Contrast Light', className: 'hc-light', foreground: '#292929', background: '#ffffff', description: 'rgba(41, 41, 41, 0.7)', warning: '#895503' },
	]) {
		for (const priceCategory of ['low', 'medium', 'high', 'very_high']) {
			test(`${priceCategory} cost badges use readable foreground text in ${theme.name}`, () => {
				const model = createModel({ priceCategory });
				const { card } = createCard({}, { model });
				const hover = getModelHoverContent(model, false, undefined, NullOpenerService);
				assert.ok(hover);
				disposables.add(hover.disposable);
				mainWindow.document.body.appendChild(hover.element);
				disposables.add(toDisposable(() => hover.element.remove()));
				for (const root of [card.element, hover.element]) {
					root.classList.add(theme.className);
					root.style.setProperty('--vscode-foreground', theme.foreground);
					root.style.setProperty('--vscode-menu-background', theme.background);
					root.style.setProperty('--vscode-descriptionForeground', theme.description);
					root.style.setProperty('--vscode-editorWarning-foreground', theme.warning);
					root.style.backgroundColor = 'var(--vscode-menu-background)';
				}
				const cardBadge = element(card.element, '.chat-model-card-badge');
				const hoverBadge = element(hover.element, '.chat-model-hover-price-badge');
				const cardContrast = getTextContrast(cardBadge, card.element);
				const hoverContrast = getTextContrast(hoverBadge, hover.element);
				const usesForeground = (badge: HTMLElement) => Color.Format.CSS.parse(getWindow(badge).getComputedStyle(badge).color)?.equals(Color.fromHex(theme.foreground));
				assert.deepStrictEqual({
					card: { usesForeground: usesForeground(cardBadge), passesAA: cardContrast >= 4.5 },
					hover: { usesForeground: usesForeground(hoverBadge), passesAA: hoverContrast >= 4.5 },
				}, {
					card: { usesForeground: true, passesAA: true },
					hover: { usesForeground: true, passesAA: true },
				}, `Card contrast: ${cardContrast}; hover contrast: ${hoverContrast}`);
			});
		}
	}

	test('the pricing pill stays with its disclosure heading when collapsed and expanded', () => {
		const { card } = createCard();
		const controls = Array.from(card.element.querySelectorAll('[role="radio"]'));
		const body = element(card.element, '.chat-model-card-pricing-body');
		const initiallyHidden = body.inert && body.getAttribute('aria-hidden') === 'true' && body.getBoundingClientRect().height === 0;
		const readPricing = () => ({
			headerBadge: card.element.querySelector('.chat-model-card-header .chat-model-card-badge')?.textContent,
			pricingBadge: card.element.querySelector('.chat-model-card-pricing-toggle .chat-model-card-badge')?.textContent,
			highCost: !!card.element.querySelector('.chat-model-card-pricing-toggle .chat-model-card-badge.high-cost'),
			expanded: element(card.element, '.chat-model-card-pricing-toggle').getAttribute('aria-expanded'),
		});
		const collapsed = readPricing();
		const toggle = element(card.element, '.chat-model-card-pricing-toggle');
		toggle.focus();
		toggle.click();

		assert.deepStrictEqual({
			collapsed,
			expanded: readPricing(),
			focused: mainWindow.document.activeElement === toggle,
			sameToggle: toggle === element(card.element, '.chat-model-card-pricing-toggle'),
			sameControls: controls.every((control, index) => control === card.element.querySelectorAll('[role="radio"]')[index]),
			initiallyHidden,
			hidden: body.inert,
			controlsBody: toggle.getAttribute('aria-controls') === body.id,
		}, {
			collapsed: { headerBadge: undefined, pricingBadge: 'High cost', highCost: true, expanded: 'false' },
			expanded: { headerBadge: undefined, pricingBadge: 'High cost', highCost: true, expanded: 'true' },
			focused: true,
			sameToggle: true,
			sameControls: true,
			initiallyHidden: true,
			hidden: false,
			controlsBody: true,
		});
	});

	test('pricing disclosures synchronize and collapse without rebuilding cards or losing focus', () => {
		const pricingDisclosure = createDisclosure();
		const first = createCard({}, { pricingDisclosure }).card;
		const second = createCard({}, { pricingDisclosure, model: { ...createModel(), identifier: 'copilot/second-model' } }).card;
		const toggles = [first, second].map(card => element(card.element, '.chat-model-card-pricing-toggle'));
		const bodies = [first, second].map(card => element(card.element, '.chat-model-card-pricing-body'));
		toggles[0].focus();
		toggles[0].click();
		const expanded = bodies.map(body => !body.inert);
		toggles[0].click();

		assert.deepStrictEqual({
			expanded,
			collapsed: bodies.map(body => body.inert),
			connected: toggles.map(toggle => toggle.isConnected),
			states: toggles.map(toggle => toggle.getAttribute('aria-expanded')),
			focused: mainWindow.document.activeElement === toggles[0],
		}, { expanded: [true, true], collapsed: [true, true], connected: [true, true], states: ['false', 'false'], focused: true });
	});

	test('pricing reveals only its height and settles immediately when motion is reduced', async () => {
		const { card } = await createAnimatedCard();
		const body = element(card.element, '.chat-model-card-pricing-body');
		const content = element(body, '.chat-model-card-pricing-body-content');
		const toggle = element(card.element, '.chat-model-card-pricing-toggle');
		const targetWindow = getWindow(body);
		const systemReduced = targetWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const controls = () => Array.from(card.element.querySelectorAll('.chat-model-card-header, [role="radiogroup"]'), control => {
			const { x, y, width, height } = control.getBoundingClientRect();
			return { x, y, width, height };
		});
		const before = controls();
		toggle.focus();
		toggle.click();
		const expanding = pausePricingAnimations(body);
		expanding.forEach(animation => { animation.currentTime = 75; });
		const fullHeight = content.getBoundingClientRect().height;
		const expandingHeight = body.getBoundingClientRect().height;
		const expandedState = {
			timing: expanding.map(animation => animation.effect?.getTiming().duration).filter(duration => duration !== 0),
			height: expandingHeight > 0 && expandingHeight < fullHeight ? 'partial' : 'full',
			controls: controls(),
			opaque: targetWindow.getComputedStyle(body).opacity === '1',
		};
		expanding.forEach(animation => animation.finish());
		toggle.click();
		const collapsing = pausePricingAnimations(body);
		collapsing.forEach(animation => { animation.currentTime = 75; });
		const collapsingHeight = body.getBoundingClientRect().height;
		const collapsedState = {
			height: collapsingHeight > 0 && collapsingHeight < fullHeight ? 'partial' : 'closed',
			inert: body.inert,
			ariaHidden: body.getAttribute('aria-hidden'),
			expanded: toggle.getAttribute('aria-expanded'),
			controls: controls(),
			opaque: targetWindow.getComputedStyle(body).opacity === '1',
		};
		card.element.classList.add('monaco-reduce-motion');

		assert.deepStrictEqual({
			expandedState,
			collapsedState,
			reduced: {
				height: body.getBoundingClientRect().height,
				visibility: targetWindow.getComputedStyle(body).visibility,
				animations: body.getAnimations().length,
			},
			focused: mainWindow.document.activeElement === toggle,
		}, {
			expandedState: { timing: systemReduced ? [] : [150], height: systemReduced ? 'full' : 'partial', controls: before, opaque: true },
			collapsedState: { height: systemReduced ? 'closed' : 'partial', inert: true, ariaHidden: 'true', expanded: 'false', controls: before, opaque: true },
			reduced: { height: 0, visibility: 'hidden', animations: 0 },
			focused: true,
		});
	});

	test('rapid pricing toggles reverse from the current height and retain the latest state', async () => {
		const { card } = await createAnimatedCard();
		const body = element(card.element, '.chat-model-card-pricing-body');
		const toggle = element(card.element, '.chat-model-card-pricing-toggle');
		const systemReduced = getWindow(body).matchMedia('(prefers-reduced-motion: reduce)').matches;
		toggle.click();
		pausePricingAnimations(body).forEach(animation => { animation.currentTime = 75; });
		const openingHeight = body.getBoundingClientRect().height;
		toggle.click();
		const closingStart = body.getBoundingClientRect().height;
		pausePricingAnimations(body).forEach(animation => { animation.currentTime = 25; });
		const closingHeight = body.getBoundingClientRect().height;
		toggle.click();
		const reopeningStart = body.getBoundingClientRect().height;
		pausePricingAnimations(body).forEach(animation => animation.finish());

		assert.deepStrictEqual({
			noJumpWhenClosing: systemReduced || Math.abs(openingHeight - closingStart) < 1,
			noJumpWhenReopening: systemReduced || Math.abs(closingHeight - reopeningStart) < 1,
			expanded: toggle.getAttribute('aria-expanded'),
			inert: body.inert,
			ariaHidden: body.getAttribute('aria-hidden'),
			visible: getWindow(body).getComputedStyle(body).visibility,
			fullHeight: Math.abs(body.getBoundingClientRect().height - element(body, '.chat-model-card-pricing-body-content').getBoundingClientRect().height) < 1,
		}, {
			noJumpWhenClosing: true,
			noJumpWhenReopening: true,
			expanded: 'true',
			inert: false,
			ariaHidden: 'false',
			visible: 'visible',
			fullHeight: true,
		});
	});

	test('restored expanded pricing does not animate on initial render', async () => {
		const { card } = await createAnimatedCard({ pricingDisclosure: createDisclosure(true) });
		const body = element(card.element, '.chat-model-card-pricing-body');
		assert.deepStrictEqual({
			animations: body.getAnimations().length,
			inert: body.inert,
			ariaHidden: body.getAttribute('aria-hidden'),
			fullHeight: Math.abs(body.getBoundingClientRect().height - element(body, '.chat-model-card-pricing-body-content').getBoundingClientRect().height) < 1,
		}, { animations: 0, inert: false, ariaHidden: 'false', fullHeight: true });
	});

	test('pricing without a disclosure still has a heading and price pill', () => {
		const { card } = createCard({}, { pricingDisclosure: undefined });
		assert.deepStrictEqual({
			headerBadge: card.element.querySelector('.chat-model-card-header .chat-model-card-badge')?.textContent,
			title: card.element.querySelector('.chat-model-card-pricing .chat-model-card-section-title')?.textContent,
			badge: card.element.querySelector('.chat-model-card-pricing .chat-model-card-badge')?.textContent,
			rows: card.element.querySelectorAll('.chat-model-card-pricing-row').length,
		}, { headerBadge: undefined, title: 'Pricing details', badge: 'High cost', rows: 2 });
	});

	for (const options of [{ isUBB: false }, { model: createModel({ inputCost: undefined, outputCost: undefined, longContextInputCost: undefined }) }]) {
		test(`retains the header pill when ${options.isUBB === false ? 'not credit billed' : 'no pricing breakdown is available'}`, () => {
			const { card } = createCard({}, options);
			assert.deepStrictEqual({
				headerBadge: card.element.querySelector('.chat-model-card-header .chat-model-card-badge')?.textContent,
				pricing: card.element.querySelector('.chat-model-card-pricing'),
			}, { headerBadge: 'High cost', pricing: null });
		});
	}

	for (const { name, configuration, reset } of [
		{ name: 'implicit defaults', configuration: {}, reset: false },
		{ name: 'explicit defaults', configuration: { effort: 'medium', context: 264000 }, reset: false },
		{ name: 'unrelated changes', configuration: { unrelated: true }, reset: false },
		{ name: 'changed effort', configuration: { effort: 'high' }, reset: true },
		{ name: 'changed context', configuration: { context: 1000000 }, reset: true },
		{ name: 'both settings changed', configuration: { effort: 'high', context: 1000000 }, reset: true },
	]) {
		test(`reset visibility follows ${name}`, () => {
			const { card } = createCard(configuration, { onTogglePin: () => { } });
			assert.deepStrictEqual({
				reset: !!card.element.querySelector('[aria-label="Reset to Default"]'),
				actions: Array.from(card.element.querySelectorAll('.chat-model-card-actions .action-label'), action => action.getAttribute('aria-label')),
			}, { reset, actions: reset ? ['Reset to Default', 'Pin Model'] : ['Pin Model'] });
		});
	}

	test('reset restores both defaults in one write, preserves other settings and pinning, and accepts once', async () => {
		const result = createCard({ effort: 'high', context: 1000000, unrelated: true }, { isPinned: true, onTogglePin: () => { } });
		const reset = element(result.card.element, '[aria-label="Reset to Default"]');
		reset.focus();
		reset.click();
		await timeout(0);

		assert.deepStrictEqual({
			writes: result.writes,
			values: result.values,
			changes: result.changes,
			accepted: result.accepted,
			selected: selectedOptions(result.card),
			summary: getModelConfigSummary(createModel(), result.configurationAccess),
			reset: !!result.card.element.querySelector('[aria-label="Reset to Default"]'),
			pinned: element(result.card.element, '[aria-label="Unpin Model"]').getAttribute('aria-pressed'),
			focused: mainWindow.document.activeElement === element(result.card.element, '[aria-label="Unpin Model"]'),
		}, {
			writes: [{ effort: 'medium', context: 264000 }],
			values: { effort: 'medium', context: 264000, unrelated: true },
			changes: [['navigation', 'effort', 'high', 'medium'], ['tokens', 'context', 1000000, 264000]],
			accepted: 1,
			selected: ['Medium', '264K'],
			summary: undefined,
			reset: false,
			pinned: 'true',
			focused: true,
		});
	});

	test('reset uses the provider defaults and returns focus to a setting when pinning is unavailable', async () => {
		const model = createModel({
			configurationSchema: {
				properties: {
					effort: { type: 'string', group: 'navigation', enum: ['low', 'high'], default: 'high' },
					context: { type: 'number', group: 'tokens', enum: [100, 200], default: 200 },
				},
			},
		});
		const result = createCard({ effort: 'low', context: 100 }, { model });
		const reset = element(result.card.element, '[aria-label="Reset to Default"]');
		reset.focus();
		reset.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		reset.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		reset.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
		await timeout(0);

		assert.deepStrictEqual({
			values: result.values,
			accepted: result.accepted,
			selected: selectedOptions(result.card),
			focused: mainWindow.document.activeElement === element(result.card.element, '[role="radio"][aria-checked="true"]'),
		}, { values: { effort: 'high', context: 200 }, accepted: 1, selected: ['high', '200'], focused: true });
	});

	test('configuration is applied before animation completes, then accepted without an extra click', async () => {
		const result = createCard();
		const group = element(result.card.element, '[role="radiogroup"]');
		const indicator = element(group, '.monaco-radio-selection');
		const animation = indicator.animate([{ opacity: 1 }, { opacity: 0.9 }], { duration: 160 });
		disposables.add(toDisposable(() => animation.cancel()));
		animation.pause();
		group.querySelectorAll<HTMLElement>('[role="radio"]')[2].click();
		await timeout(0);
		const duringAnimation = { values: { ...result.values }, accepted: result.accepted, controlConnected: group.isConnected };
		animation.finish();
		await timeout(0);

		assert.deepStrictEqual({ duringAnimation, accepted: result.accepted, selected: selectedOptions(result.card) }, {
			duringAnimation: { values: { effort: 'high' }, accepted: 0, controlConnected: true },
			accepted: 1,
			selected: ['High', '264K'],
		});
	});

	test('reduced motion accepts a configuration change immediately without an animation delay', async () => {
		const result = createCard();
		const group = element(result.card.element, '[role="radiogroup"]');
		group.querySelectorAll<HTMLElement>('[role="radio"]')[0].click();
		await timeout(0);
		assert.deepStrictEqual({ values: result.values, accepted: result.accepted, selected: selectedOptions(result.card) }, {
			values: { effort: 'low' }, accepted: 1, selected: ['Low', '264K'],
		});
	});

	test('rapid changes followed by reset save in order and accept only the final state', async () => {
		const firstSave = new DeferredPromise<void>();
		const values: IStringDictionary<unknown> = { context: 1000000 };
		const writes: IStringDictionary<unknown>[] = [];
		const result = createCard({}, {
			configurationAccess: {
				getModelConfiguration: () => values,
				setModelConfiguration: async (_modelId, next) => {
					writes.push(next);
					if (writes.length === 1) {
						await firstSave.p;
					}
					Object.assign(values, next);
				},
				getModelConfigurationActions: () => [],
			},
		});
		element(result.card.element, '[role="radiogroup"]').querySelectorAll<HTMLElement>('[role="radio"]')[2].click();
		element(result.card.element, '[aria-label="Reset to Default"]').click();
		await firstSave.complete();
		await timeout(0);

		assert.deepStrictEqual({ writes, values, accepted: result.accepted, selected: selectedOptions(result.card) }, {
			writes: [{ effort: 'high' }, { effort: 'medium', context: 264000 }],
			values: { effort: 'medium', context: 264000 },
			accepted: 1,
			selected: ['Medium', '264K'],
		});
	});

	test('failed resets report the error and preserve configuration without accepting', async () => {
		const failure = new Error('Cannot save model settings');
		const result = createCard({}, {
			configurationAccess: {
				getModelConfiguration: () => ({ effort: 'high' }),
				setModelConfiguration: async () => { throw failure; },
				getModelConfigurationActions: () => [],
			},
		});
		const reported: Error[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error));
		try {
			element(result.card.element, '[aria-label="Reset to Default"]').click();
			await timeout(0);
		} finally {
			setUnexpectedErrorHandler(previousHandler);
		}
		assert.deepStrictEqual({ reported, changes: result.changes, accepted: result.accepted, selected: selectedOptions(result.card) }, {
			reported: [failure], changes: [], accepted: 0, selected: ['High', '264K'],
		});
	});

	test('disposing during a save does not rebuild or accept the disposed card', async () => {
		const saved = new DeferredPromise<void>();
		const result = createCard({}, {
			configurationAccess: {
				getModelConfiguration: () => undefined,
				setModelConfiguration: () => saved.p,
				getModelConfigurationActions: () => [],
			},
		});
		element(result.card.element, '[role="radiogroup"]').querySelectorAll<HTMLElement>('[role="radio"]')[2].click();
		const group = element(result.card.element, '[role="radiogroup"]');
		result.card.dispose();
		await saved.complete();
		await timeout(0);
		assert.deepStrictEqual({ accepted: result.accepted, sameControl: group === element(result.card.element, '[role="radiogroup"]') }, { accepted: 0, sameControl: true });
	});

	test('speed changes apply immediately and accept after the selection animation', async () => {
		const standard = createModel();
		const fast = { ...standard, identifier: 'copilot/test-model-fast' };
		const selected: string[] = [];
		const result = createCard({}, { speedVariants: { standard, fast }, onSelectVariant: model => selected.push(model.identifier) });
		const group = element(result.card.element, '[role="radiogroup"][aria-label="Speed"]');
		const animation = element(group, '.monaco-radio-selection').animate([{ opacity: 1 }, { opacity: 0.9 }], { duration: 160 });
		disposables.add(toDisposable(() => animation.cancel()));
		animation.pause();
		group.querySelectorAll<HTMLElement>('[role="radio"]')[1].click();
		const duringAnimation = { selected: [...selected], accepted: result.accepted };
		animation.finish();
		await timeout(0);
		assert.deepStrictEqual({ duringAnimation, accepted: result.accepted }, {
			duringAnimation: { selected: [fast.identifier], accepted: 0 }, accepted: 1,
		});
	});
});
