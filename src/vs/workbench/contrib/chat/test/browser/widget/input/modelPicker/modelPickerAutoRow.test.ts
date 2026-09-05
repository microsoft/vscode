/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import '../../../../../browser/widget/input/modelPicker/media/modelPicker.css';
import { ModelPickerAutoRow } from '../../../../../browser/widget/input/modelPicker/modelPickerAutoRow.js';
import { IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

function createAutoModel(withTiers = false): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/auto',
		metadata: {
			id: 'auto',
			name: 'Auto',
			vendor: 'copilot',
			version: '1.0',
			family: 'auto',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			detail: withTiers ? 'Automatic model selection' : undefined,
			configurationSchema: withTiers ? {
				properties: {
					tier: {
						type: 'string',
						title: 'Optimize for',
						group: 'navigation',
						enum: ['eco', 'balanced', 'max'],
						enumItemLabels: ['Efficiency', 'Balance', 'Intelligence'],
						enumDescriptions: ['Cheaper models', 'Balances capability and cost', 'Most capable models'],
						default: 'balanced',
					},
				},
			} : undefined,
		} as ILanguageModelChatMetadata,
	};
}

function createConfigurationAccess(configuration: IStringDictionary<unknown> = {}): IModelConfigurationAccess {
	const values: IStringDictionary<IStringDictionary<unknown>> = { 'copilot/auto': configuration };
	return {
		getModelConfiguration: modelId => values[modelId],
		setModelConfiguration: async (modelId, next) => { values[modelId] = { ...values[modelId], ...next }; },
		getModelConfigurationActions: () => [],
	};
}

suite('ModelPickerAutoRow', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createRow(initiallyEnabled: boolean, options: {
		autoModel?: ILanguageModelChatMetadataAndIdentifier;
		configurationAccess?: IModelConfigurationAccess;
		onToggle?: (enabled: boolean) => void;
	} = {}) {
		const toggles: boolean[] = [];
		let enabled = initiallyEnabled;
		const configurationAccess = options.configurationAccess ?? createConfigurationAccess();
		const row: ModelPickerAutoRow = disposables.add(new ModelPickerAutoRow({
			autoModel: options.autoModel ?? createAutoModel(),
			configurationAccess,
			isEnabled: () => enabled,
			onToggle: next => {
				enabled = next;
				toggles.push(next);
				options.onToggle?.(next);
				row.render();
			},
		}));
		const element = row.element;
		mainWindow.document.body.appendChild(element);
		disposables.add(toDisposable(() => element.remove()));
		element.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 300px;
			font-family: sans-serif;
			--vscode-spacing-sizeNone: 0px;
			--vscode-spacing-size20: 2px;
			--vscode-spacing-size60: 6px;
			--vscode-spacing-size80: 8px;
			--vscode-spacing-size240: 24px;
			--vscode-strokeThickness: 1px;
			--vscode-fontSize-label2: 11px;
			--vscode-fontWeight-semiBold: 600;
			--vscode-foreground: #ffffff;
			--vscode-descriptionForeground: #cccccc;
			--vscode-menu-background: #202020;
			--vscode-radio-inactiveBorder: #888888;
			--vscode-radio-activeBorder: #0099ff;
		`;
		return {
			row,
			toggles,
			configurationAccess,
			get tiers() { return Array.from(element.querySelectorAll<HTMLElement>('[role="radio"]')); },
			main: element.querySelector('.chat-model-picker-auto-main') as HTMLElement,
			label: element.querySelector('.chat-model-picker-auto-label') as HTMLElement,
			description: element.querySelector('.chat-model-picker-auto-description') as HTMLElement,
			toggle: element.querySelector('.monaco-switch') as HTMLElement,
		};
	}

	test('clicking the label toggles Auto on', () => {
		const { toggles, label, toggle } = createRow(false);

		label.click();

		assert.deepStrictEqual({ toggles, checked: toggle.getAttribute('aria-checked') }, { toggles: [true], checked: 'true' });
	});

	test('clicking the label toggles Auto back off', () => {
		const { toggles, label, toggle } = createRow(true);

		label.click();

		assert.deepStrictEqual({ toggles, checked: toggle.getAttribute('aria-checked') }, { toggles: [false], checked: 'false' });
	});

	test('clicking the switch itself reports one change, not two', () => {
		const { toggles, toggle } = createRow(false);

		toggle.click();

		assert.deepStrictEqual({ toggles, checked: toggle.getAttribute('aria-checked') }, { toggles: [true], checked: 'true' });
	});

	test('clicking the strip beside the label toggles Auto', () => {
		const { toggles, main, toggle } = createRow(false);

		main.click();

		assert.deepStrictEqual({ toggles, checked: toggle.getAttribute('aria-checked') }, { toggles: [true], checked: 'true' });
	});

	// The row sits in the popup's footer, which is dismissed when focus leaves it.
	// Pressing inert parts of the row must not move focus, or the popup closes first.
	test('pressing the strip and the description does not move focus', () => {
		const { main, description } = createRow(false);
		const defaultPrevented = (target: HTMLElement) => {
			const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return event.defaultPrevented;
		};

		assert.deepStrictEqual(
			{ strip: defaultPrevented(main), description: defaultPrevented(description) },
			{ strip: true, description: true });
	});

	test('inactive tiers remain visible and interactive with the remembered tier and description', () => {
		const { row, tiers, description, toggle, configurationAccess } = createRow(false, {
			autoModel: createAutoModel(true),
			configurationAccess: createConfigurationAccess({ tier: 'max' }),
		});

		assert.deepStrictEqual({
			enabled: row.element.classList.contains('enabled'),
			toggle: toggle.getAttribute('aria-checked'),
			group: row.element.querySelector('[role="radiogroup"]')?.getAttribute('aria-label'),
			tiers: tiers.map(element => ({
				text: element.textContent,
				checked: element.getAttribute('aria-checked'),
				disabled: element.classList.contains('disabled'),
				ariaDisabled: element.getAttribute('aria-disabled'),
				visible: element.getBoundingClientRect().height > 0,
			})),
			description: description.textContent,
			descriptionVisible: description.getBoundingClientRect().height > 0,
			savedTier: configurationAccess.getModelConfiguration('copilot/auto')?.tier,
		}, {
			enabled: false,
			toggle: 'false',
			group: 'Optimize for',
			tiers: [
				{ text: 'Efficiency', checked: 'false', disabled: false, ariaDisabled: 'false', visible: true },
				{ text: 'Balance', checked: 'false', disabled: false, ariaDisabled: 'false', visible: true },
				{ text: 'Intelligence', checked: 'true', disabled: false, ariaDisabled: 'false', visible: true },
			],
			description: 'Automatic model selection · Most capable models',
			descriptionVisible: true,
			savedTier: 'max',
		});
	});

	for (const [index, tier, description] of [
		[0, 'eco', 'Cheaper models'],
		[1, 'balanced', 'Balances capability and cost'],
	] as const) {
		test(`clicking the ${tier} tier saves it before enabling Auto, including the remembered tier`, async () => {
			const configurationAccess = createConfigurationAccess({ tier: 'balanced' });
			const savedAtToggle: unknown[] = [];
			const result = createRow(false, {
				autoModel: createAutoModel(true),
				configurationAccess,
				onToggle: () => savedAtToggle.push(configurationAccess.getModelConfiguration('copilot/auto')?.tier),
			});
			const previousButton = result.tiers[index];
			previousButton.focus();
			previousButton.click();
			await timeout(0);

			assert.deepStrictEqual({
				toggles: result.toggles,
				savedAtToggle,
				savedTier: configurationAccess.getModelConfiguration('copilot/auto')?.tier,
				enabled: result.row.element.classList.contains('enabled'),
				checked: result.tiers.map(element => element.getAttribute('aria-checked')),
				description: result.description.textContent,
				focused: mainWindow.document.activeElement === result.tiers[index],
				previousConnected: previousButton.isConnected,
			}, {
				toggles: [true],
				savedAtToggle: [tier],
				savedTier: tier,
				enabled: true,
				checked: [0, 1, 2].map(candidate => String(candidate === index)),
				description: `Automatic model selection · ${description}`,
				focused: true,
				previousConnected: false,
			});
		});
	}

	for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
		for (const index of [0, 1]) {
			test(`${key === ' ' ? 'Space' : key} activates ${index === 1 ? 'the remembered' : 'a different'} tier while Auto is off`, async () => {
				const result = createRow(false, { autoModel: createAutoModel(true) });
				result.tiers[index].focus();
				result.tiers[index].dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
				await timeout(0);

				assert.deepStrictEqual({
					toggles: result.toggles,
					savedTier: result.configurationAccess.getModelConfiguration('copilot/auto')?.tier,
					checked: result.tiers.map(element => element.getAttribute('aria-checked')),
					focused: mainWindow.document.activeElement === result.tiers[index],
				}, {
					toggles: [true],
					savedTier: index === 0 ? 'eco' : 'balanced',
					checked: [0, 1, 2].map(candidate => String(candidate === index)),
					focused: true,
				});
			});
		}
	}

	test('arrows and re-rendering preserve focus without changing the tier or enabling Auto', async () => {
		const result = createRow(false, {
			autoModel: createAutoModel(true),
			configurationAccess: createConfigurationAccess({ tier: 'balanced' }),
		});
		result.tiers[1].focus();
		const focus: number[] = [];
		for (const [key, keyCode] of [['ArrowRight', 39], ['ArrowDown', 40], ['ArrowLeft', 37], ['ArrowUp', 38]] as const) {
			mainWindow.document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
			result.row.render();
			focus.push(result.tiers.findIndex(element => element === mainWindow.document.activeElement));
		}
		await timeout(0);

		assert.deepStrictEqual({
			focus,
			toggles: result.toggles,
			savedTier: result.configurationAccess.getModelConfiguration('copilot/auto')?.tier,
			checked: result.tiers.map(element => element.getAttribute('aria-checked')),
			tabIndexes: result.tiers.map(element => element.tabIndex),
			description: result.description.textContent,
		}, {
			focus: [2, 0, 2, 1],
			toggles: [],
			savedTier: 'balanced',
			checked: ['false', 'true', 'false'],
			tabIndexes: [-1, 0, -1],
			description: 'Automatic model selection · Balances capability and cost',
		});
	});

	test('toggling Auto off and back on retains the tiers, description, selection, and layout', () => {
		const result = createRow(true, {
			autoModel: createAutoModel(true),
			configurationAccess: createConfigurationAccess({ tier: 'max' }),
		});
		const measure = () => [result.row.element, ...result.tiers, result.description, result.toggle].map(element => {
			const { x, y, width, height } = element.getBoundingClientRect();
			return { x, y, width, height };
		});
		const readState = () => ({
			description: result.description.textContent,
			checked: result.tiers.map(element => element.getAttribute('aria-checked')),
			bounds: measure(),
		});
		const initial = readState();
		result.toggle.focus();
		result.toggle.click();
		const inactive = readState();
		const inactiveStyle = getWindow(result.tiers[2]).getComputedStyle(result.tiers[2]);
		const inactiveAppearance = { color: inactiveStyle.color, background: inactiveStyle.backgroundColor, opacity: inactiveStyle.opacity };
		result.toggle.click();

		assert.deepStrictEqual({
			toggles: result.toggles,
			inactive,
			restored: readState(),
			inactiveAppearance,
			savedTier: result.configurationAccess.getModelConfiguration('copilot/auto')?.tier,
			toggleFocused: mainWindow.document.activeElement === result.toggle,
		}, {
			toggles: [false, true],
			inactive: initial,
			restored: initial,
			inactiveAppearance: { color: 'rgb(204, 204, 204)', background: 'rgb(32, 32, 32)', opacity: '1' },
			savedTier: 'max',
			toggleFocused: true,
		});
	});

	test('saving a tier while Auto is on does not toggle it again', async () => {
		const result = createRow(true, { autoModel: createAutoModel(true) });
		result.tiers[2].click();
		await timeout(0);

		assert.deepStrictEqual({
			toggles: result.toggles,
			savedTier: result.configurationAccess.getModelConfiguration('copilot/auto')?.tier,
			description: result.description.textContent,
			toggle: result.toggle.getAttribute('aria-checked'),
		}, {
			toggles: [],
			savedTier: 'max',
			description: 'Automatic model selection · Most capable models',
			toggle: 'true',
		});
	});

	test('Auto is enabled only after the tier is saved without stealing focus moved elsewhere', async () => {
		const saved = new DeferredPromise<void>();
		const access = createConfigurationAccess({ tier: 'balanced' });
		const result = createRow(false, {
			autoModel: createAutoModel(true),
			configurationAccess: {
				...access,
				setModelConfiguration: async (modelId, values) => {
					await saved.p;
					await access.setModelConfiguration(modelId, values);
				},
			},
		});
		result.tiers[2].focus();
		result.tiers[2].click();
		const beforeSave = { toggles: [...result.toggles], savedTier: access.getModelConfiguration('copilot/auto')?.tier };
		result.toggle.focus();
		await saved.complete();
		await timeout(0);

		assert.deepStrictEqual({
			beforeSave,
			toggles: result.toggles,
			savedTier: access.getModelConfiguration('copilot/auto')?.tier,
			toggleFocused: mainWindow.document.activeElement === result.toggle,
		}, {
			beforeSave: { toggles: [], savedTier: 'balanced' },
			toggles: [true],
			savedTier: 'max',
			toggleFocused: true,
		});
	});

	test('configuration failures are reported and restore the remembered tier without enabling Auto', async () => {
		const failure = new Error('Cannot save tier');
		const result = createRow(false, {
			autoModel: createAutoModel(true),
			configurationAccess: {
				...createConfigurationAccess({ tier: 'balanced' }),
				setModelConfiguration: async () => { throw failure; },
			},
		});
		const reported: Error[] = [];
		const originalHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error));
		try {
			result.tiers[0].focus();
			result.tiers[0].click();
			await timeout(0);
		} finally {
			setUnexpectedErrorHandler(originalHandler);
		}

		assert.deepStrictEqual({
			reported,
			toggles: result.toggles,
			checked: result.tiers.map(element => element.getAttribute('aria-checked')),
			description: result.description.textContent,
			focused: mainWindow.document.activeElement === result.tiers[0],
		}, {
			reported: [failure],
			toggles: [],
			checked: ['false', 'true', 'false'],
			description: 'Automatic model selection · Balances capability and cost',
			focused: true,
		});
	});

	test('rapid tier activations save in order and enable Auto once', async () => {
		const firstSave = new DeferredPromise<void>();
		const access = createConfigurationAccess({ tier: 'balanced' });
		const writes: unknown[] = [];
		const result = createRow(false, {
			autoModel: createAutoModel(true),
			configurationAccess: {
				...access,
				setModelConfiguration: async (modelId, values) => {
					writes.push(values.tier);
					if (writes.length === 1) {
						await firstSave.p;
					}
					await access.setModelConfiguration(modelId, values);
				},
			},
		});
		result.tiers[0].click();
		result.tiers[2].click();
		await timeout(0);
		const pendingWrites = [...writes];
		await firstSave.complete();
		await timeout(0);

		assert.deepStrictEqual({
			pendingWrites,
			writes,
			toggles: result.toggles,
			savedTier: access.getModelConfiguration('copilot/auto')?.tier,
			checked: result.tiers.map(element => element.getAttribute('aria-checked')),
			description: result.description.textContent,
		}, {
			pendingWrites: ['eco'],
			writes: ['eco', 'max'],
			toggles: [true],
			savedTier: 'max',
			checked: ['false', 'false', 'true'],
			description: 'Automatic model selection · Most capable models',
		});
	});

	for (const initiallyEnabled of [false, true]) {
		test(`turning Auto off during a pending save is respected when initially ${initiallyEnabled ? 'on' : 'off'}`, async () => {
			const saved = new DeferredPromise<void>();
			const access = createConfigurationAccess({ tier: 'balanced' });
			const result = createRow(initiallyEnabled, {
				autoModel: createAutoModel(true),
				configurationAccess: {
					...access,
					setModelConfiguration: async (modelId, values) => {
						await saved.p;
						await access.setModelConfiguration(modelId, values);
					},
				},
			});
			result.tiers[2].click();
			await timeout(0);
			if (!initiallyEnabled) {
				result.toggle.click();
			}
			result.toggle.click();
			await saved.complete();
			await timeout(0);

			assert.deepStrictEqual({
				toggles: result.toggles,
				enabled: result.row.element.classList.contains('enabled'),
				savedTier: access.getModelConfiguration('copilot/auto')?.tier,
				checked: result.tiers.map(element => element.getAttribute('aria-checked')),
				description: result.description.textContent,
			}, {
				toggles: initiallyEnabled ? [false] : [true, false],
				enabled: false,
				savedTier: 'max',
				checked: ['false', 'false', 'true'],
				description: 'Automatic model selection · Most capable models',
			});
		});
	}

	test('a disposed row does not enable Auto or recreate controls after a pending save', async () => {
		const saved = new DeferredPromise<void>();
		const result = createRow(false, {
			autoModel: createAutoModel(true),
			configurationAccess: {
				...createConfigurationAccess(),
				setModelConfiguration: () => saved.p,
			},
		});
		const previousButton = result.tiers[0];
		previousButton.click();
		await timeout(0);
		result.row.dispose();
		await saved.complete();
		await timeout(0);
		result.row.render();
		previousButton.click();

		assert.deepStrictEqual({
			toggles: result.toggles,
			tierCount: result.tiers.length,
			previousConnected: previousButton.isConnected,
		}, {
			toggles: [],
			tierCount: 0,
			previousConnected: false,
		});
	});

	test('an unrecognized saved tier uses the same fallback for selection and description', () => {
		const result = createRow(false, {
			autoModel: createAutoModel(true),
			configurationAccess: createConfigurationAccess({ tier: 'retired' }),
		});

		assert.deepStrictEqual({
			checked: result.tiers.map(element => element.getAttribute('aria-checked')),
			description: result.description.textContent,
		}, {
			checked: ['true', 'false', 'false'],
			description: 'Automatic model selection · Cheaper models',
		});
	});
});
