/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { TestContextService, TestStorageService } from '../../../common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MainStatusbarPart } from '../../../../browser/parts/statusbar/statusbarPart.js';
import { LayoutSettings } from '../../../../services/layout/browser/layoutService.js';
import { TestContextMenuService, TestHostService, TestLayoutService } from '../../workbenchTestServices.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { STATUS_BAR_BACKGROUND, STATUS_BAR_INACTIVE_BACKGROUND, STATUS_BAR_NO_FOLDER_BACKGROUND } from '../../../../common/theme.js';
import { WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mainWindow } from '../../../../../base/browser/window.js';

suite('StatusbarPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestMainStatusbarPart extends MainStatusbarPart {
		updateStylesCalls = 0;
		windowHasFocus = true;

		protected override hasWindowFocus(): boolean {
			return this.windowHasFocus;
		}

		override updateStyles(): void {
			this.updateStylesCalls++;
			super.updateStyles();
		}
	}

	class TestFloatingPanelsLayoutService extends TestLayoutService {
		floatingPanelsEnabled = false;
		modernUICompact = false;

		override isFloatingPanelsEnabled(): boolean {
			return this.floatingPanelsEnabled;
		}

		override isModernUICompact(): boolean {
			return this.modernUICompact;
		}
	}

	function fireConfigChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.DEFAULT,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: candidate => candidate === key,
		});
	}

	function createFocusTestPart(hostService: TestHostService, windowHasFocus: boolean): { part: TestMainStatusbarPart; container: HTMLElement } {
		const configurationService = new TestConfigurationService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() { });
		const part = store.add(new TestMainStatusbarPart(
			instantiationService,
			new TestThemeService(new TestColorTheme({
				[STATUS_BAR_BACKGROUND]: '#111111',
				[STATUS_BAR_INACTIVE_BACKGROUND]: '#222222',
			})),
			new TestContextService(),
			store.add(new TestStorageService()),
			new TestLayoutService(),
			new TestContextMenuService(),
			store.add(new ContextKeyService(configurationService)),
			configurationService,
			hostService,
		));
		part.windowHasFocus = windowHasFocus;
		const container = document.createElement('div');
		part.create(container);
		return { part, container };
	}

	test('initializes the inactive background before receiving focus events', () => {
		const hostService = new TestHostService();
		hostService.setFocus(false);
		const unfocusedHost = createFocusTestPart(hostService, false);
		const unfocusedWindow = createFocusTestPart(new TestHostService(), false);

		assert.deepStrictEqual({
			unfocusedHost: unfocusedHost.container.style.backgroundColor,
			unfocusedWindow: unfocusedWindow.container.style.backgroundColor,
		}, {
			unfocusedHost: 'rgb(34, 34, 34)',
			unfocusedWindow: 'rgb(34, 34, 34)',
		});
	});

	test('keeps window-specific backgrounds when the host regains focus', () => {
		const activeWindowEmitter = store.add(new Emitter<number>());
		const hostService = new class extends TestHostService {
			override readonly onDidChangeActiveWindow = activeWindowEmitter.event;
		}();
		const main = createFocusTestPart(hostService, true);
		const backgrounds = () => main.container.style.backgroundColor;
		const initially = backgrounds();

		hostService.setFocus(false);
		const blurred = backgrounds();
		hostService.setFocus(true);
		const returnedToMain = backgrounds();

		activeWindowEmitter.fire(mainWindow.vscodeWindowId + 1);
		const switchedToAuxiliary = backgrounds();
		hostService.setFocus(false);
		hostService.setFocus(true);
		const returnedToAuxiliary = backgrounds();
		activeWindowEmitter.fire(mainWindow.vscodeWindowId);
		const switchedBackToMain = backgrounds();

		assert.deepStrictEqual({ initially, blurred, returnedToMain, switchedToAuxiliary, returnedToAuxiliary, switchedBackToMain }, {
			initially: 'rgb(17, 17, 17)',
			blurred: 'rgb(34, 34, 34)',
			returnedToMain: 'rgb(17, 17, 17)',
			switchedToAuxiliary: 'rgb(34, 34, 34)',
			returnedToAuxiliary: 'rgb(34, 34, 34)',
			switchedBackToMain: 'rgb(17, 17, 17)',
		});
	});

	test('configuration changes update styles only after the part is created', () => {
		const configurationService = new TestConfigurationService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() { });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const part = store.add(new TestMainStatusbarPart(
			instantiationService,
			new TestThemeService(),
			new TestContextService(),
			store.add(new TestStorageService()),
			new TestLayoutService(),
			new TestContextMenuService(),
			contextKeyService,
			configurationService,
			new TestHostService(),
		));

		fireConfigChange(configurationService, LayoutSettings.MODERN_UI);
		const beforeCreate = part.updateStylesCalls;
		part.create(document.createElement('div'));
		const afterCreate = part.updateStylesCalls;
		fireConfigChange(configurationService, 'unrelated.setting');
		const afterUnrelatedChange = part.updateStylesCalls;
		fireConfigChange(configurationService, LayoutSettings.MODERN_UI);

		assert.deepStrictEqual({
			beforeCreate,
			afterCreate,
			afterUnrelatedChange,
			afterModernUIChange: part.updateStylesCalls,
		}, {
			beforeCreate: 0,
			afterCreate: 1,
			afterUnrelatedChange: 1,
			afterModernUIChange: 2,
		});
	});

	test('modern UI reserves compact vertical status bar padding', () => {
		const configurationService = new TestConfigurationService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() { });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const layoutService = new TestFloatingPanelsLayoutService();
		const part = store.add(new TestMainStatusbarPart(
			instantiationService,
			new TestThemeService(),
			new TestContextService(),
			store.add(new TestStorageService()),
			layoutService,
			new TestContextMenuService(),
			contextKeyService,
			configurationService,
			new TestHostService(),
		));

		const defaultConstraints = { minimumHeight: part.minimumHeight, maximumHeight: part.maximumHeight };
		layoutService.floatingPanelsEnabled = true;
		const modernUIConstraints = { minimumHeight: part.minimumHeight, maximumHeight: part.maximumHeight };
		layoutService.modernUICompact = true;
		const compactModernUIConstraints = { minimumHeight: part.minimumHeight, maximumHeight: part.maximumHeight };

		assert.deepStrictEqual({ defaultConstraints, modernUIConstraints, compactModernUIConstraints }, {
			defaultConstraints: { minimumHeight: 22, maximumHeight: 22 },
			modernUIConstraints: { minimumHeight: 28, maximumHeight: 28 },
			compactModernUIConstraints: { minimumHeight: 26, maximumHeight: 26 },
		});
	});

	test('uses the inactive background when the window loses focus', () => {
		const configurationService = new TestConfigurationService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() { });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const hostService = new TestHostService();
		const themeService = new TestThemeService(new TestColorTheme({
			[STATUS_BAR_BACKGROUND]: '#111111',
			[STATUS_BAR_INACTIVE_BACKGROUND]: '#222222',
			[STATUS_BAR_NO_FOLDER_BACKGROUND]: '#333333',
		}));
		const part = store.add(new TestMainStatusbarPart(
			instantiationService,
			themeService,
			new TestContextService(),
			store.add(new TestStorageService()),
			new TestLayoutService(),
			new TestContextMenuService(),
			contextKeyService,
			configurationService,
			hostService,
		));
		const container = document.createElement('div');
		part.create(container);
		const activeBackground = container.style.backgroundColor;

		hostService.setFocus(false);
		const inactiveBackground = container.style.backgroundColor;

		hostService.setFocus(true);
		const restoredBackground = container.style.backgroundColor;

		themeService.setTheme(new TestColorTheme({
			[STATUS_BAR_BACKGROUND]: '#333333',
			[STATUS_BAR_NO_FOLDER_BACKGROUND]: '#444444',
		}));
		hostService.setFocus(false);
		const fallbackBackground = container.style.backgroundColor;

		assert.deepStrictEqual({ activeBackground, inactiveBackground, restoredBackground, fallbackBackground }, {
			activeBackground: 'rgb(17, 17, 17)',
			inactiveBackground: 'rgb(34, 34, 34)',
			restoredBackground: 'rgb(17, 17, 17)',
			fallbackBackground: 'rgb(51, 51, 51)',
		});
	});

	test('keeps state backgrounds when the window is inactive', () => {
		// Not imported from the debug contribution to avoid depending on a higher layer here.
		const debuggingBackground = 'statusBar.debuggingBackground';
		const theme = new TestColorTheme({
			[STATUS_BAR_BACKGROUND]: '#111111',
			[STATUS_BAR_INACTIVE_BACKGROUND]: '#222222',
			[STATUS_BAR_NO_FOLDER_BACKGROUND]: '#333333',
			[debuggingBackground]: '#444444',
		});

		function createPart(contextService: TestContextService): { container: HTMLElement; hostService: TestHostService; part: TestMainStatusbarPart } {
			const configurationService = new TestConfigurationService();
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IHoverService, new class extends mock<IHoverService>() { });
			const hostService = new TestHostService();
			const part = store.add(new TestMainStatusbarPart(
				instantiationService,
				new TestThemeService(theme),
				contextService,
				store.add(new TestStorageService()),
				new TestLayoutService(),
				new TestContextMenuService(),
				store.add(new ContextKeyService(configurationService)),
				configurationService,
				hostService,
			));
			const container = document.createElement('div');
			part.create(container);

			return { container, hostService, part };
		}

		// A style override (as the debugger registers) must survive losing focus.
		const debugging = createPart(new TestContextService());
		const debuggingOverride = debugging.part.overrideStyle({ priority: 10, background: debuggingBackground });
		debugging.hostService.setFocus(false);
		const whileDebugging = debugging.container.style.backgroundColor;
		debuggingOverride.dispose();

		// The no folder background communicates state too and must survive losing focus.
		const empty = createPart(new class extends TestContextService {
			override getWorkbenchState(): WorkbenchState { return WorkbenchState.EMPTY; }
		}());
		empty.hostService.setFocus(false);
		const whileEmpty = empty.container.style.backgroundColor;

		assert.deepStrictEqual({ whileDebugging, whileEmpty }, {
			whileDebugging: 'rgb(68, 68, 68)',
			whileEmpty: 'rgb(51, 51, 51)',
		});
	});
});
