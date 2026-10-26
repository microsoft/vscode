/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getZoomFactor, setZoomFactor } from '../../../base/browser/browser.js';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { getMacOSWindowControlsPosition } from '../../../platform/window/common/window.js';
import { INativeWorkbenchEnvironmentService } from '../../../workbench/services/environment/electron-browser/environmentService.js';
import { LayoutSettings, ModernUIDensity, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { TestNativeHostService } from '../../../workbench/test/electron-browser/workbenchTestServices.js';
import { NativeTitlebarPart } from '../../electron-browser/parts/titlebarPart.js';

suite('Sessions - Native Titlebar Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the chat window chrome is opt-in and leaves a native title bar untouched', () => {
		const configuration = new TestConfigurationService({
			window: { titleBarStyle: 'custom' },
			[LayoutSettings.MODERN_UI_DENSITY]: ModernUIDensity.Default,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
		instantiationService.stub(INativeHostService, new TestNativeHostService());
		instantiationService.stub(INativeWorkbenchEnvironmentService, new class extends mock<INativeWorkbenchEnvironmentService>() {
			override readonly os = { release: '25.0.0', hostname: 'test', arch: 'arm64' };
		}());
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		const part = store.add(instantiationService.createInstance(NativeTitlebarPart, Parts.TITLEBAR_PART, mainWindow));
		const element = append(container, $('.part.titlebar'));
		part.create(element);

		const read = () => ({
			classes: [...element.classList].filter(c => c === 'chromeless' || c === 'hosts-session-header'),
			height: part.height,
			hostCount: element.querySelectorAll('.session-header-host').length,
		});
		const untouched = read();
		part.setChromeless(true);
		const optedIn = read();
		part.setChromeless(false);
		assert.deepStrictEqual({ untouched, optedIn, restored: read(), minimumHeight: part.minimumHeight }, {
			untouched: { classes: [], height: part.minimumHeight, hostCount: 0 },
			optedIn: { classes: ['chromeless'], height: 0, hostCount: 0 },
			restored: { classes: [], height: part.minimumHeight, hostCount: 0 },
			minimumHeight: part.minimumHeight,
		});
	});

	(isMacintosh ? test : test.skip)('centers the macOS traffic lights in the session header row of a chromeless title bar', async () => {
		const initialZoom = getZoomFactor(mainWindow);
		setZoomFactor(1, mainWindow);
		store.add(toDisposable(() => setZoomFactor(initialZoom, mainWindow)));
		const configuration = new TestConfigurationService({
			window: { titleBarStyle: 'custom' },
			[LayoutSettings.MODERN_UI_DENSITY]: ModernUIDensity.Default,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
		const updates: Parameters<INativeHostService['updateWindowControls']>[0][] = [];
		instantiationService.stub(INativeHostService, new class extends TestNativeHostService {
			override async updateWindowControls(options: Parameters<INativeHostService['updateWindowControls']>[0]): Promise<void> {
				updates.push(options);
			}
		}());
		instantiationService.stub(INativeWorkbenchEnvironmentService, new class extends mock<INativeWorkbenchEnvironmentService>() {
			override readonly os = { release: '25.0.0', hostname: 'test', arch: 'arm64' };
		}());
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.mac'));
		store.add(toDisposable(() => container.remove()));
		const part = store.add(instantiationService.createInstance(NativeTitlebarPart, Parts.TITLEBAR_PART, mainWindow));
		part.create(append(container, $('.part.titlebar')));

		const heights: (number | undefined)[] = [];
		const lastHeight = () => updates.at(-1)?.height;
		part.layout(800, part.minimumHeight);
		heights.push(lastHeight());
		part.setChromeless(true);
		heights.push(lastHeight());
		part.layout(800, 0);
		heights.push(lastHeight());
		await configuration.setUserConfiguration(LayoutSettings.MODERN_UI_DENSITY, ModernUIDensity.Compact);
		part.setChromeless(false);
		part.setChromeless(true);
		heights.push(lastHeight());
		part.setChromeless(false);
		part.layout(800, part.minimumHeight);
		heights.push(lastHeight());
		assert.deepStrictEqual(heights, [46, 32, 32, 28, 35]);
	});

	for (const release of ['24.0.0', '25.0.0']) {
		(isMacintosh ? test : test.skip)(`aligns macOS ${release} traffic lights with the optical toolbar center across densities and zoom levels`, async () => {
			const initialZoom = getZoomFactor(mainWindow);
			store.add(toDisposable(() => setZoomFactor(initialZoom, mainWindow)));
			const configuration = new TestConfigurationService({
				window: { titleBarStyle: 'custom' },
				[LayoutSettings.MODERN_UI_DENSITY]: ModernUIDensity.Default,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
			const updates: Parameters<INativeHostService['updateWindowControls']>[0][] = [];
			instantiationService.stub(INativeHostService, new class extends TestNativeHostService {
				override async updateWindowControls(options: Parameters<INativeHostService['updateWindowControls']>[0]): Promise<void> {
					updates.push(options);
				}
			}());
			instantiationService.stub(INativeWorkbenchEnvironmentService, new class extends mock<INativeWorkbenchEnvironmentService>() {
				override readonly os = { release, hostname: 'test', arch: 'arm64' };
			}());
			const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.mac'));
			store.add(toDisposable(() => container.remove()));
			const part = store.add(instantiationService.createInstance(NativeTitlebarPart, Parts.TITLEBAR_PART, mainWindow));
			part.create(append(container, $('.part.titlebar')));

			const positions = [];
			for (const zoom of [0.8, 1, 1.25]) {
				setZoomFactor(zoom, mainWindow);
				for (const density of [ModernUIDensity.Default, ModernUIDensity.Compact, ModernUIDensity.Default]) {
					await configuration.setUserConfiguration(LayoutSettings.MODERN_UI_DENSITY, density);
					part.layout(800, part.minimumHeight);
					const update = updates.at(-1);
					assert.ok(update?.height !== undefined);
					const count = updates.length;
					part.layout(800, part.minimumHeight);
					positions.push({
						height: update.height,
						position: getMacOSWindowControlsPosition(update.height, release, update.horizontalInset),
						redundantUpdates: updates.length - count,
					});
				}
			}

			const x = release === '24.0.0' ? 10 : 11;
			const y = release === '24.0.0' ? 15 : 16;
			const defaultPosition = { height: 46, position: { x, y }, redundantUpdates: 0 };
			const compactPosition = { height: 35, position: { x, y: y - 6 }, redundantUpdates: 0 };
			assert.deepStrictEqual(positions, [
				defaultPosition, compactPosition, defaultPosition,
				defaultPosition, compactPosition, defaultPosition,
				{ height: 58, position: { x: x + 5, y: y + 6 }, redundantUpdates: 0 },
				{ height: 44, position: { x: x + 5, y: y - 1 }, redundantUpdates: 0 },
				{ height: 58, position: { x: x + 5, y: y + 6 }, redundantUpdates: 0 },
			]);
		});
	}
});
