/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, LayoutSettings } from '../../../../services/layout/browser/layoutService.js';
import { FrostedGlassContribution } from '../../electron-browser/frostedGlass.contribution.js';
import '../../../../browser/workbench.contribution.js';

suite('FrostedGlassContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(enabled = true, isSessionsWindow = false) {
		const configuration = new TestConfigurationService({
			[LayoutSettings.MODERN_UI]: true,
			[LayoutSettings.MODERN_UI_FROSTED_GLASS]: enabled,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const addedContainer = store.add(new Emitter<{ container: HTMLElement; disposables: DisposableStore }>());
		const layout = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = document.createElement('div');
			override readonly containers = [this.mainContainer];
			override readonly onDidAddContainer = addedContainer.event;
		}();
		const transparencyChanged = store.add(new Emitter<void>());
		const accessibility = new class extends TestAccessibilityService {
			reduced = false;
			override onDidChangeReducedTransparency = transparencyChanged.event;
			override isTransparencyReduced(): boolean { return this.reduced; }
		}();
		const theme = new TestThemeService();
		store.add(theme._onThemeChange);
		store.add(theme._onFileIconThemeChange);
		store.add(theme._onProductIconThemeChange);
		const gpuChanged = store.add(new Emitter<boolean>());
		const nativeHost = new class extends mock<INativeHostService>() {
			checks = 0;
			result: Promise<boolean> = Promise.resolve(true);
			override readonly onDidChangeGPUCompositing = gpuChanged.event;
			override isGPUCompositingEnabled(): Promise<boolean> {
				this.checks++;
				return this.result;
			}
		}();
		const warnings: string[] = [];
		const log = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const environment = new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = isSessionsWindow;
		}();
		const createContribution = () => store.add(new FrostedGlassContribution(configuration, layout, accessibility, theme, nativeHost, log, environment));
		const state = () => layout.containers.map(container => container.classList.contains('modern-ui-frosted-glass'));
		const styleState = () => layout.containers.map(container => ({
			glass: container.classList.contains('modern-ui-frosted-glass'),
			opacity: container.style.getPropertyValue('--modern-ui-glass-opacity'),
		}));
		const configure = async (key: string, value: boolean | number) => {
			await configuration.setUserConfiguration(key, value);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: setting => setting === key,
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([key]),
				change: { keys: [key], overrides: [] }
			});
		};
		return { configuration, layout, addedContainer, accessibility, transparencyChanged, theme, nativeHost, gpuChanged, warnings, createContribution, state, styleState, configure };
	}

	test('shares enabled and opacity defaults with the Agents window', () => {
		const properties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
		assert.deepStrictEqual({
			enabled: properties[LayoutSettings.MODERN_UI_FROSTED_GLASS].default,
			agentsWindow: properties[LayoutSettings.MODERN_UI_FROSTED_GLASS].agentsWindow,
			opacity: properties[LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY].default,
			agentsOpacity: properties[LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY].agentsWindow,
		}, {
			enabled: true,
			agentsWindow: undefined,
			opacity: 92,
			agentsOpacity: undefined,
		});
	});

	test('registers both settings without experimental names or tags', () => {
		const properties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
		const keys = [LayoutSettings.MODERN_UI_FROSTED_GLASS, LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY];
		assert.deepStrictEqual({
			keys,
			experimental: keys.map(key => properties[key].tags?.includes('experimental') ?? false),
		}, {
			keys: ['workbench.modernUIFrostedGlass', 'workbench.modernUIFrostedGlassOpacity'],
			experimental: [false, false],
		});
	});

	test('does not query the GPU or change surfaces when explicitly disabled', async () => {
		const services = createServices(false);
		services.createContribution();
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY, 75);
		assert.deepStrictEqual({ state: services.styleState(), checks: services.nativeHost.checks }, { state: [{ glass: false, opacity: '' }], checks: 0 });
	});

	for (const { name, value, opacity, warns } of [
		{ name: 'unset', value: undefined, opacity: 92, warns: false },
		{ name: 'minimum', value: 50, opacity: 50, warns: false },
		{ name: 'fractional', value: 75.5, opacity: 75.5, warns: false },
		{ name: 'maximum', value: 100, opacity: 100, warns: false },
		{ name: 'below minimum', value: 25, opacity: 50, warns: true },
		{ name: 'above maximum', value: 125, opacity: 100, warns: true },
		{ name: 'NaN', value: NaN, opacity: 92, warns: true },
		{ name: 'positive infinity', value: Infinity, opacity: 92, warns: true },
		{ name: 'negative infinity', value: -Infinity, opacity: 92, warns: true },
		{ name: 'string', value: '75', opacity: 92, warns: true },
		{ name: 'boolean', value: true, opacity: 92, warns: true },
		{ name: 'null', value: null, opacity: 92, warns: true },
	]) {
		test(`normalizes ${name} opacity and reports invalid values`, async () => {
			const services = createServices();
			await services.configuration.setUserConfiguration('workbench', {
				modernUIFrostedGlassOpacity: value,
			});
			services.createContribution();
			await Promise.resolve();
			assert.deepStrictEqual({
				state: services.styleState(),
				warnings: services.warnings.map(warning => warning.includes(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY)),
			}, {
				state: [{ glass: true, opacity: `${opacity}%` }],
				warnings: warns ? [true] : [],
			});
		});
	}

	test('requires Modern UI as well as the glass setting', async () => {
		const services = createServices();
		await services.configure(LayoutSettings.MODERN_UI, false);
		services.createContribution();
		await Promise.resolve();
		assert.deepStrictEqual({ state: services.state(), checks: services.nativeHost.checks }, { state: [false], checks: 0 });
	});

	test('Agents overlays do not depend on the editor-window Modern UI setting', async () => {
		const services = createServices(true, true);
		await services.configure(LayoutSettings.MODERN_UI, false);
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY, 75);
		services.createContribution();
		await Promise.resolve();
		const enabledState = services.styleState();
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS, false);
		assert.deepStrictEqual({ enabledState, disabledState: services.styleState() }, {
			enabledState: [{ glass: true, opacity: '75%' }],
			disabledState: [{ glass: false, opacity: '' }],
		});
	});

	for (const fallback of ['disabled', 'reduced transparency', 'high contrast', 'software compositing']) {
		test(`Agents overlays retain the ${fallback} fallback`, async () => {
			const services = createServices(fallback !== 'disabled', true);
			await services.configure(LayoutSettings.MODERN_UI, false);
			services.accessibility.reduced = fallback === 'reduced transparency';
			if (fallback === 'high contrast') {
				services.theme.setTheme(new TestColorTheme({}, ColorScheme.HIGH_CONTRAST_DARK));
			}
			if (fallback === 'software compositing') {
				services.nativeHost.result = Promise.resolve(false);
			}
			services.createContribution();
			await Promise.resolve();
			assert.deepStrictEqual(services.styleState(), [{ glass: false, opacity: '' }]);
		});
	}

	for (const accelerated of [true, false]) {
		test(`stays solid until compositing is known, then uses accelerated=${accelerated}`, async () => {
			const services = createServices();
			const pending = new DeferredPromise<boolean>();
			services.nativeHost.result = pending.p;
			services.createContribution();
			const pendingState = services.state();
			await pending.complete(accelerated);
			assert.deepStrictEqual({ pendingState, resolvedState: services.state() }, { pendingState: [false], resolvedState: [accelerated] });
		});
	}

	test('uses the latest opacity when a pending capability check completes', async () => {
		const services = createServices();
		const pending = new DeferredPromise<boolean>();
		services.nativeHost.result = pending.p;
		services.createContribution();
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY, 75);
		const pendingState = services.styleState();
		await pending.complete(true);
		assert.deepStrictEqual({ pendingState, resolvedState: services.styleState(), checks: services.nativeHost.checks }, {
			pendingState: [{ glass: false, opacity: '' }],
			resolvedState: [{ glass: true, opacity: '75%' }],
			checks: 1,
		});
	});

	test('logs a failed capability check and retains solid backgrounds', async () => {
		const services = createServices();
		const pending = new DeferredPromise<boolean>();
		services.nativeHost.result = pending.p;
		services.createContribution();
		await pending.error(new Error('GPU status unavailable'));
		assert.deepStrictEqual({ state: services.state(), warnings: services.warnings }, {
			state: [false],
			warnings: ['Unable to check GPU compositing for frosted glass. Keeping solid overlays.'],
		});
	});

	test('updates existing and newly added auxiliary windows and cleans them up', async () => {
		const services = createServices();
		const existing = document.createElement('div');
		services.layout.containers.push(existing);
		const contribution = services.createContribution();
		await Promise.resolve();
		const initialState = services.styleState();
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY, 75);
		const updatedState = services.styleState();
		const added = document.createElement('div');
		const auxiliaryStore = store.add(new DisposableStore());
		services.layout.containers.push(added);
		services.addedContainer.fire({ container: added, disposables: auxiliaryStore });
		const enabledState = services.styleState();
		auxiliaryStore.dispose();
		const closedState = services.styleState();
		contribution.dispose();
		assert.deepStrictEqual({ initialState, updatedState, enabledState, closedState, disposedState: services.styleState(), checks: services.nativeHost.checks }, {
			initialState: [{ glass: true, opacity: '92%' }, { glass: true, opacity: '92%' }],
			updatedState: [{ glass: true, opacity: '75%' }, { glass: true, opacity: '75%' }],
			enabledState: [{ glass: true, opacity: '75%' }, { glass: true, opacity: '75%' }, { glass: true, opacity: '75%' }],
			closedState: [{ glass: true, opacity: '75%' }, { glass: true, opacity: '75%' }, { glass: false, opacity: '' }],
			disposedState: [{ glass: false, opacity: '' }, { glass: false, opacity: '' }, { glass: false, opacity: '' }],
			checks: 1,
		});
	});

	test('turns off immediately when GPU compositing is lost and can recover', async () => {
		const services = createServices();
		services.createContribution();
		await Promise.resolve();
		const initialState = services.styleState();
		services.gpuChanged.fire(false);
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY, 75);
		const lostState = services.styleState();
		services.gpuChanged.fire(true);
		assert.deepStrictEqual({ initialState, lostState, recoveredState: services.styleState() }, {
			initialState: [{ glass: true, opacity: '92%' }],
			lostState: [{ glass: false, opacity: '' }],
			recoveredState: [{ glass: true, opacity: '75%' }],
		});
	});

	test('a GPU loss event wins over a stale startup response', async () => {
		const services = createServices();
		const pending = new DeferredPromise<boolean>();
		services.nativeHost.result = pending.p;
		services.createContribution();
		services.gpuChanged.fire(false);
		await pending.complete(true);
		assert.deepStrictEqual(services.state(), [false]);
	});

	test('disabling during the capability check prevents late enablement', async () => {
		const services = createServices();
		const pending = new DeferredPromise<boolean>();
		services.nativeHost.result = pending.p;
		services.createContribution();
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS, false);
		services.gpuChanged.fire(true);
		await pending.complete(true);
		assert.deepStrictEqual(services.state(), [false]);
	});

	test('disposing during the capability check prevents late enablement', async () => {
		const services = createServices();
		const pending = new DeferredPromise<boolean>();
		services.nativeHost.result = pending.p;
		const contribution = services.createContribution();
		contribution.dispose();
		await pending.complete(true);
		services.gpuChanged.fire(true);
		assert.deepStrictEqual(services.state(), [false]);
	});

	test('rechecks capabilities after turning glass back on', async () => {
		const services = createServices();
		services.createContribution();
		await Promise.resolve();
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS, false);
		const disabledState = services.state();
		services.nativeHost.result = Promise.resolve(false);
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS, true);
		await Promise.resolve();
		assert.deepStrictEqual({ disabledState, reenabledState: services.state(), checks: services.nativeHost.checks }, {
			disabledState: [false], reenabledState: [false], checks: 2,
		});
	});

	test('responds immediately to reduced transparency and resumes when allowed', async () => {
		const services = createServices();
		services.createContribution();
		await Promise.resolve();
		services.accessibility.reduced = true;
		services.transparencyChanged.fire();
		await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY, 50);
		services.gpuChanged.fire(true);
		const reducedState = services.styleState();
		services.accessibility.reduced = false;
		services.transparencyChanged.fire();
		await Promise.resolve();
		assert.deepStrictEqual({ reducedState, restoredState: services.styleState() }, {
			reducedState: [{ glass: false, opacity: '' }],
			restoredState: [{ glass: true, opacity: '50%' }],
		});
	});

	for (const scheme of [ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]) {
		test(`retains solid surfaces in ${scheme} and resumes in a normal theme`, async () => {
			const services = createServices();
			services.createContribution();
			await Promise.resolve();
			services.theme.setTheme(new TestColorTheme({}, scheme));
			await services.configure(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY, 50);
			const highContrastState = services.styleState();
			services.theme.setTheme(new TestColorTheme({}, ColorScheme.LIGHT));
			await Promise.resolve();
			assert.deepStrictEqual({ highContrastState, restoredState: services.styleState() }, {
				highContrastState: [{ glass: false, opacity: '' }],
				restoredState: [{ glass: true, opacity: '50%' }],
			});
		});
	}
});
