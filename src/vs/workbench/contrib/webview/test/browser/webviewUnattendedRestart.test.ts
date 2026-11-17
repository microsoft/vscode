/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IUnattendedRestartService, UnattendedRestartService } from '../../../../services/lifecycle/common/unattendedRestart.js';
import { WebviewThemeDataProvider } from '../../browser/themeing.js';
import { IWebviewService, WebviewOptions } from '../../browser/webview.js';
import { WebviewElement } from '../../browser/webviewElement.js';
import { WebviewUnattendedRestartParticipant } from '../../browser/webviewUnattendedRestart.js';

suite('WebviewUnattendedRestartParticipant', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Returns what blocks an unattended restart while webviews with the given options are loaded.
	 */
	async function getBlockers(...webviewOptions: WebviewOptions[]): Promise<readonly string[]> {
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextMenuService, { onDidHideContextMenu: Event.None });
		instantiationService.stub(IAccessibilityService, {
			onDidChangeReducedMotion: Event.None,
			onDidChangeScreenReaderOptimized: Event.None,
			isMotionReduced: () => false,
			isScreenReaderOptimized: () => false,
		});
		const themeDataProvider = upcastPartial<WebviewThemeDataProvider>({
			onThemeDataChanged: Event.None,
			getWebviewThemeData: () => ({ styles: {}, activeTheme: 'vscode-dark', themeLabel: 'Dark', themeId: 'test' }),
		});
		const webviews = webviewOptions.map(options => store.add(instantiationService.createInstance(WebviewElement, { title: undefined, options, contentOptions: {}, extension: undefined }, themeDataProvider)));

		const unattendedRestartService = new UnattendedRestartService(store.add(new NullLogService()));
		instantiationService.stub(IUnattendedRestartService, unattendedRestartService);
		instantiationService.stub(IWebviewService, { webviews });
		store.add(instantiationService.createInstance(WebviewUnattendedRestartParticipant));

		return (await unattendedRestartService.canRestartUnattended()).blockers;
	}

	test('blocks while a webview retains a context that is not restorable', async () => {
		assert.deepStrictEqual({
			notRetained: await getBlockers({}),
			webviewPanel: await getBlockers({ retainContextWhenHidden: true }),
			customEditor: await getBlockers({ retainContextWhenHidden: true, restorable: false }),
			customTextEditor: await getBlockers({ retainContextWhenHidden: true, restorable: true }),
			customTextEditorAndWebviewPanel: await getBlockers({ retainContextWhenHidden: true, restorable: true }, { retainContextWhenHidden: true }),
		}, {
			notRetained: [],
			webviewPanel: ['webview.retainedContext'],
			customEditor: ['webview.retainedContext'],
			customTextEditor: [],
			customTextEditorAndWebviewPanel: ['webview.retainedContext'],
		});
	});
});
