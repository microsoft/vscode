/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isNative } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IAuxiliaryWindow } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { ITitleService } from '../../../../../workbench/services/title/browser/titleService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { TitleService } from '../../../../browser/parts/titlebarPart.js';
import { ProjectBoardWindow } from '../../browser/projectBoardWindow.js';

suite('ProjectBoardWindow', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWindow() {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const window = frame.contentWindow!;
		ensureCodeWindow(window, 7001);
		const targetWindow = window;
		const container = mainWindow.document.createElement('div');
		window.document.body.appendChild(container);
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configuration = new TestConfigurationService({
			window: { titleBarStyle: 'custom', controlsStyle: 'custom', commandCenter: true }
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		const titleService = store.add(instantiationService.createInstance(TitleService));
		instantiationService.stub(ITitleService, titleService);
		const onWillLayout = store.add(new Emitter<Dimension>());
		let dimension = new Dimension(800, 600);
		const auxiliaryWindow = new class extends mock<IAuxiliaryWindow>() {
			override readonly window = targetWindow;
			override readonly container = container;
			override readonly onWillLayout = onWillLayout.event;
			override layout(): void { onWillLayout.fire(dimension); }
		}();
		return {
			window, container, instantiationService, titleService, auxiliaryWindow, configuration,
			resize(width: number, height: number) {
				dimension = new Dimension(width, height);
				auxiliaryWindow.layout();
			}
		};
	}

	test('shared titlebar renders a fixed board title without session navigation or editor observers', () => {
		const { container, window, titleService, instantiationService } = createWindow();
		const titlebar = store.add(titleService.createAuxiliaryWindowTitlebarPart(container, 'Agents Hub', instantiationService));
		titlebar.layout(800, titlebar.height, 0, 0);

		assert.deepStrictEqual({
			title: window.document.title,
			visibleTitle: container.querySelector('.session-editor-title')?.textContent,
			dragRegions: container.querySelectorAll('.titlebar-drag-region').length,
			toolbars: container.querySelectorAll('.monaco-toolbar, .command-center').length,
			registered: titleService.parts.length,
		}, {
			title: 'Agents Hub',
			visibleTitle: 'Agents Hub',
			dragRegions: 1,
			toolbars: 0,
			registered: 2,
		});

		titlebar.dispose();
		assert.strictEqual(titleService.parts.length, 1);
	});

	test('reserves titlebar height, relayouts on resize, and releases its window-scoped content', () => {
		const { auxiliaryWindow, container, titleService, instantiationService, resize } = createWindow();
		const host = store.add(instantiationService.createInstance(ProjectBoardWindow, auxiliaryWindow, 'Agents Hub'));
		const titlebarHeight = isNative ? titleService.getPart(container).minimumHeight : 0;
		const initialHeight = host.content.style.height;
		resize(900, 700);
		const resizedHeight = host.content.style.height;
		resize(900, 0);
		const minimumHeight = host.content.style.height;
		host.dispose();
		resize(800, 600);

		assert.deepStrictEqual({
			initialHeight, resizedHeight, minimumHeight,
			retainedHeight: host.content.style.height,
			remainingChildren: container.childElementCount,
			registeredParts: titleService.parts.length,
		}, {
			initialHeight: `${600 - titlebarHeight}px`,
			resizedHeight: `${700 - titlebarHeight}px`,
			minimumHeight: '0px',
			retainedHeight: '0px',
			remainingChildren: 0,
			registeredParts: 1,
		});
	});

	test('native titlebar configuration retains the full board content area', async () => {
		const { auxiliaryWindow, configuration, container, instantiationService } = createWindow();
		await configuration.setUserConfiguration('window', {
			titleBarStyle: 'native', customTitleBarVisibility: 'never'
		});
		const host = store.add(instantiationService.createInstance(ProjectBoardWindow, auxiliaryWindow, 'Agents Hub'));

		assert.deepStrictEqual({
			title: auxiliaryWindow.window.document.title,
			height: host.content.style.height,
			customTitlebars: container.querySelectorAll('.part.titlebar').length,
			visibleCustomTitlebars: [...container.querySelectorAll<HTMLElement>('.part.titlebar')].filter(titlebar => titlebar.style.display !== 'none').length,
		}, {
			title: 'Agents Hub',
			height: '600px',
			customTitlebars: isNative ? 1 : 0,
			visibleCustomTitlebars: 0,
		});
	});
});
