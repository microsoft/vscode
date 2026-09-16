/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INativeHostOptions, INativeHostService } from '../../../../../platform/native/common/native.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { NativeTitlebarPart } from '../../../../electron-browser/parts/titlebarPart.js';

suite('ProjectBoardNativeTitlebar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTitlebar(controlsStyle: 'native' | 'custom') {
		const ownerTitle = mainWindow.document.title;
		store.add(toDisposable(() => mainWindow.document.title = ownerTitle));
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const window = frame.contentWindow!;
		ensureCodeWindow(window, 7002);
		const container = mainWindow.document.createElement('div');
		window.document.body.appendChild(container);
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configuration = new TestConfigurationService({ window: { titleBarStyle: 'custom', controlsStyle } });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		const controlsTargets: (number | undefined)[] = [];
		const actions: { action: string; target: number | undefined }[] = [];
		let maximized = false;
		instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
			override readonly onDidChangeWindowAlwaysOnTop = Event.None;
			override readonly onDidTriggerWindowSystemContextMenu = Event.None;
			override async isWindowAlwaysOnTop(): Promise<boolean> { return false; }
			override async updateWindowControls(options: INativeHostOptions): Promise<void> {
				controlsTargets.push(options.targetWindowId);
			}
			override async isMaximized(): Promise<boolean> { return maximized; }
			override async minimizeWindow(options?: INativeHostOptions): Promise<void> {
				actions.push({ action: 'minimize', target: options?.targetWindowId });
			}
			override async maximizeWindow(options?: INativeHostOptions): Promise<void> {
				maximized = true;
				actions.push({ action: 'maximize', target: options?.targetWindowId });
			}
			override async unmaximizeWindow(options?: INativeHostOptions): Promise<void> {
				maximized = false;
				actions.push({ action: 'restore', target: options?.targetWindowId });
			}
			override async closeWindow(options?: INativeHostOptions): Promise<void> {
				actions.push({ action: 'close', target: options?.targetWindowId });
			}
		}());
		const titlebar = store.add(instantiationService.createInstance(NativeTitlebarPart, 'test.projectBoard.titlebar', window));
		titlebar.setAuxiliaryWindowTitle('Agents Hub');
		titlebar.create(container);
		titlebar.layout(800, titlebar.minimumHeight);
		return { ownerTitle, window, container, controlsTargets, actions };
	}

	test('initializes only the board document title and targets its native controls overlay', () => {
		const { ownerTitle, window, controlsTargets } = createTitlebar('native');
		assert.deepStrictEqual({
			ownerTitle: mainWindow.document.title,
			boardTitle: window.document.title,
			controlsTargets: [...new Set(controlsTargets)],
		}, {
			ownerTitle,
			boardTitle: 'Agents Hub',
			controlsTargets: [7002],
		});
	});

	(isMacintosh ? test.skip : test)('custom minimize, maximize, restore and close controls target only the board', async () => {
		const { container, actions } = createTitlebar('custom');
		container.querySelector<HTMLElement>('.window-minimize')!.click();
		container.querySelector<HTMLElement>('.window-max-restore')!.click();
		await Promise.resolve();
		container.querySelector<HTMLElement>('.window-max-restore')!.click();
		await Promise.resolve();
		container.querySelector<HTMLElement>('.window-close')!.click();
		assert.deepStrictEqual(actions, [
			{ action: 'minimize', target: 7002 },
			{ action: 'maximize', target: 7002 },
			{ action: 'restore', target: 7002 },
			{ action: 'close', target: 7002 },
		]);
	});
});
