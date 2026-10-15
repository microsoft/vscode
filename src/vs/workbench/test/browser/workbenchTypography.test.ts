/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DEFAULT_UI_TYPOGRAPHY, getUITypography, IUITypography, onDidChangeUITypography } from '../../../base/browser/fonts.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { getEditorTypographyResetCss, WorkbenchTypographyContribution, WorkbenchTypographySettings } from '../../browser/workbenchTypography.js';
import { IAuxiliaryWindowService } from '../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { TestLayoutService } from './workbenchTestServices.js';

class TypographyTestLayoutService extends TestLayoutService {

	override mainContainer: HTMLElement = document.createElement('div');
	override containers: HTMLElement[] = [this.mainContainer];

	readonly onDidAddContainerEmitter = new Emitter<{ container: HTMLElement; disposables: DisposableStore }>();
	override readonly onDidAddContainer = this.onDidAddContainerEmitter.event;
	layoutCount = 0;

	override layout(): void {
		this.layoutCount++;
	}

	addContainer(container: HTMLElement, disposables: DisposableStore): void {
		this.containers.push(container);
		this.onDidAddContainerEmitter.fire({ container, disposables });
	}
}

suite('WorkbenchTypographyContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(settings: Record<string, unknown>) {
		const configurationService = new TestConfigurationService(settings);
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const layoutService = new TypographyTestLayoutService();
		store.add(layoutService.onDidAddContainerEmitter);
		const auxiliaryWindowService = new class extends mock<IAuxiliaryWindowService>() {
			override getWindow() { return undefined; }
		};
		const contribution = store.add(new WorkbenchTypographyContribution(configurationService, new TestThemeService(), layoutService, auxiliaryWindowService));

		return { configurationService, layoutService, contribution };
	}

	async function updateSettings(configurationService: TestConfigurationService, settings: Record<string, unknown>): Promise<void> {
		const keys = Object.keys(settings);
		for (const key of keys) {
			await configurationService.setUserConfiguration(key, settings[key]);
		}

		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => keys.includes(key),
			source: ConfigurationTarget.USER,
			affectedKeys: new Set(keys),
			change: { keys, overrides: [] }
		});
	}

	function fontStyles(root: HTMLElement) {
		return {
			fontFamily: root.style.fontFamily,
			fontFamilyVariable: root.style.getPropertyValue('--vscode-font-family'),
			fontScale: root.style.getPropertyValue('--vscode-font-scale'),
			iconScale: root.style.getPropertyValue('--vscode-icon-scale'),
			listRowHeight: root.style.getPropertyValue('--vscode-list-row-height'),
			body1: root.style.getPropertyValue('--vscode-fontSize-body1'),
			label3: root.style.getPropertyValue('--vscode-fontSize-label3'),
			deprecatedBody: root.style.getPropertyValue('--vscode-bodyFontSize'),
			codicon: root.style.getPropertyValue('--vscode-codiconFontSize'),
		};
	}

	test('leaves the DOM untouched for default settings', () => {
		const { layoutService } = createContribution({ [WorkbenchTypographySettings.FontFamily]: 'default' });

		assert.deepStrictEqual({
			style: layoutService.mainContainer.getAttribute('style'),
			typography: getUITypography(),
			layoutCount: layoutService.layoutCount,
		}, {
			style: null,
			typography: DEFAULT_UI_TYPOGRAPHY,
			layoutCount: 0,
		});
	});

	test('applies the CSS before notifying listeners, then relayouts', async () => {
		const { configurationService, layoutService } = createContribution({});
		const root = layoutService.mainContainer;
		const events: { typography: IUITypography; body1: string; layoutCount: number }[] = [];
		store.add(onDidChangeUITypography(typography => events.push({ typography, body1: root.style.getPropertyValue('--vscode-fontSize-body1'), layoutCount: layoutService.layoutCount })));

		await updateSettings(configurationService, { [WorkbenchTypographySettings.FontSize]: 26, [WorkbenchTypographySettings.FontFamily]: ' Inter ' });

		assert.deepStrictEqual({ events, styles: fontStyles(root), layoutCount: layoutService.layoutCount }, {
			events: [{ typography: { fontSize: 26, fontFamily: 'Inter' }, body1: '26px', layoutCount: 0 }],
			styles: { fontFamily: 'Inter', fontFamilyVariable: 'Inter', fontScale: '2', iconScale: '2', listRowHeight: '44px', body1: '26px', label3: '20px', deprecatedBody: '26px', codicon: '32px' },
			layoutCount: 1,
		});
	});

	test('keeps the default typography in editors', async () => {
		const { configurationService } = createContribution({});
		const editorResetStyle = () => [...mainWindow.document.head.querySelectorAll('style')].some(style => style.textContent?.includes('.monaco-editor .view-lines'));
		const css = getEditorTypographyResetCss(new TestThemeService().getColorTheme());
		const declarations = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}')).trim().split(/;\s*/).filter(declaration => /^--vscode-(font-scale|icon-scale|list-row-height|bodyFontSize|fontSize-body1|fontSize-label3|codiconFontSize):/.test(declaration));

		const atDefault = editorResetStyle();
		await updateSettings(configurationService, { [WorkbenchTypographySettings.FontSize]: 20 });
		const atCustom = editorResetStyle();
		await updateSettings(configurationService, { [WorkbenchTypographySettings.FontSize]: 13 });

		assert.deepStrictEqual({ declarations, atDefault, atCustom, restored: editorResetStyle() }, {
			declarations: ['--vscode-font-scale: initial', '--vscode-icon-scale: initial', '--vscode-list-row-height: initial', '--vscode-bodyFontSize: 13px', '--vscode-fontSize-body1: 13px', '--vscode-fontSize-label3: 10px', '--vscode-codiconFontSize: 16px'],
			atDefault: false,
			atCustom: true,
			restored: false,
		});
	});

	test('shrinks text but not icons or rows for small font sizes', () => {
		const { layoutService } = createContribution({ [WorkbenchTypographySettings.FontSize]: 10 });
		const { body1, iconScale, codicon, listRowHeight } = fontStyles(layoutService.mainContainer);

		assert.deepStrictEqual({ body1, iconScale, codicon, listRowHeight }, { body1: '10px', iconScale: '', codicon: '', listRowHeight: '' });
	});

	test('applies to containers added later and restores the DOM for default settings', async () => {
		const { configurationService, layoutService } = createContribution({ [WorkbenchTypographySettings.FontSize]: 18 });
		const auxiliaryContainer = document.createElement('div');
		layoutService.addContainer(auxiliaryContainer, store.add(new DisposableStore()));
		const startup = {
			main: layoutService.mainContainer.style.getPropertyValue('--vscode-fontSize-body1'),
			auxiliary: auxiliaryContainer.style.getPropertyValue('--vscode-fontSize-body1'),
			layoutCount: layoutService.layoutCount,
		};

		await updateSettings(configurationService, { [WorkbenchTypographySettings.FontSize]: 13 });

		assert.deepStrictEqual({
			startup,
			restored: {
				main: layoutService.mainContainer.style.cssText,
				auxiliary: auxiliaryContainer.style.cssText,
				typography: getUITypography(),
				layoutCount: layoutService.layoutCount,
			}
		}, {
			startup: { main: '18px', auxiliary: '18px', layoutCount: 0 },
			restored: { main: '', auxiliary: '', typography: DEFAULT_UI_TYPOGRAPHY, layoutCount: 1 },
		});
	});

	test('validates settings', async () => {
		const { configurationService } = createContribution({});
		const read = async (fontSize: unknown, fontFamily: unknown) => {
			await updateSettings(configurationService, { [WorkbenchTypographySettings.FontSize]: fontSize, [WorkbenchTypographySettings.FontFamily]: fontFamily });
			return getUITypography();
		};

		assert.deepStrictEqual([
			await read(100, ''),
			await read(4, '  '),
			await read('large', 'Inter'),
			await read(Number.NaN, 'default'),
			await read(14.5, 'Inter, sans-serif'),
		], [
			{ fontSize: 28, fontFamily: undefined },
			{ fontSize: 10, fontFamily: undefined },
			{ fontSize: 13, fontFamily: 'Inter' },
			{ fontSize: 13, fontFamily: undefined },
			{ fontSize: 14.5, fontFamily: 'Inter, sans-serif' },
		]);
	});

	test('restores the DOM and the default typography when disposed', () => {
		const { layoutService, contribution } = createContribution({ [WorkbenchTypographySettings.FontSize]: 20, [WorkbenchTypographySettings.FontFamily]: 'Inter' });
		const applied = layoutService.mainContainer.style.cssText !== '';

		contribution.dispose();

		assert.deepStrictEqual({ applied, style: layoutService.mainContainer.style.cssText, typography: getUITypography() }, {
			applied: true,
			style: '',
			typography: DEFAULT_UI_TYPOGRAPHY,
		});
	});
});
