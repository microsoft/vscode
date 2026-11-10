/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISizeService } from '../../../../../platform/theme/common/sizeService.js';
import { IColorTheme, IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor } from '../../electron-browser/browserEditor.js';
import { WebContentsViewRendererFeature } from '../../electron-browser/features/webContentsViewRendererFeature.js';
import { WebContentsViewHost } from '../../electron-browser/webContentsViewHost.js';

suite('WebContentsViewRendererFeature', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('re-lays out native view corners after size styles propagate and cancels pending work on disposal', async () => {
		const sizesChanged = store.add(new Emitter<void>());
		const themeChanged = store.add(new Emitter<IColorTheme>());
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stubInstance(WebContentsViewHost, { dispose() { } });
		instantiation.stub(ISizeService, { onDidChangeSizes: sizesChanged.event });
		instantiation.stub(IThemeService, { onDidColorThemeChange: themeChanged.event });
		let radius = 8;
		const layouts: number[] = [];
		const model = new class extends mock<IBrowserViewModel>() { }();
		const editor = new class extends mock<BrowserEditor>() {
			override get window() { return mainWindow; }
			override get model() { return model; }
			override readonly onDidChangeModel = Event.None;
			override layout() { layouts.push(radius); }
		}();
		const feature = store.add(instantiation.createInstance(WebContentsViewRendererFeature, editor));
		sizesChanged.fire();
		sizesChanged.fire();
		await Promise.resolve().then(() => { radius = 0; });
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		themeChanged.fire(new TestColorTheme());
		radius = 4;
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		sizesChanged.fire();
		feature.dispose();
		radius = 8;
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		assert.deepStrictEqual(layouts, [0, 4]);
	});
});
