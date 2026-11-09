/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { SIZE_CUSTOMIZATIONS_SETTING } from '../../../../../platform/theme/common/sizeService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { WorkbenchSizeService } from '../../../../services/themes/browser/workbenchSizeService.js';
import { WebviewThemeDataProvider } from '../../browser/themeing.js';

suite('Webview semantic sizes', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('exports resolved sizes and invalidates the cache when customizations change', async () => {
		const configuration = new TestConfigurationService({
			editor: {}, [SIZE_CUSTOMIZATIONS_SETTING]: {
				'default.cornerRadius': 3, 'toolsPanel.cornerRadius': 0, 'controls.cornerRadius': 2, 'popups.cornerRadius': 6, 'menus.cornerRadius': 0,
			}
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const sizes = store.add(new WorkbenchSizeService(configuration, store.add(new NullLogService())));
		const theme = ColorThemeData.createUnloadedThemeForThemeType(ColorScheme.DARK);
		const themes = new class extends mock<IWorkbenchThemeService>() {
			override getColorTheme() { return theme; }
			override onDidColorThemeChange = Event.None;
		}();
		const provider = store.add(new WebviewThemeDataProvider(themes, configuration, sizes));
		const read = () => {
			const styles = provider.getWebviewThemeData().styles;
			return [
				styles['vscode-toolsPanel-cornerRadius'], styles['vscode-primarySideBar-cornerRadius'], styles['vscode-cornerRadius-large'],
				styles['vscode-buttons-cornerRadius'], styles['vscode-inputs-cornerRadius'], styles['vscode-menus-cornerRadius'], styles['vscode-dialogs-cornerRadius'],
			];
		};
		const before = read();
		let events = 0;
		store.add(provider.onThemeDataChanged(() => events++));
		await configuration.setUserConfiguration(SIZE_CUSTOMIZATIONS_SETTING, { 'default.cornerRadius': 5 });
		configuration.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === SIZE_CUSTOMIZATIONS_SETTING,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([SIZE_CUSTOMIZATIONS_SETTING]),
			change: { keys: [SIZE_CUSTOMIZATIONS_SETTING], overrides: [] },
		});
		assert.deepStrictEqual({ before, after: read(), events }, {
			before: ['0px', '3px', '8px', '2px', '2px', '0px', '6px'], after: ['5px', '5px', '8px', '4px', '4px', '8px', '8px'], events: 1,
		});
	});
});
