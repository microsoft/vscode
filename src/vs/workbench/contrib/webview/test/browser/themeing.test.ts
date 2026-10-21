/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DEFAULT_FONT_FAMILY, DEFAULT_UI_TYPOGRAPHY, setUITypography } from '../../../../../base/browser/fonts.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IWorkbenchColorTheme, IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { WebviewThemeDataProvider } from '../../browser/themeing.js';

suite('WebviewThemeDataProvider', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => setUITypography(DEFAULT_UI_TYPOGRAPHY));

	test('follows the UI typography', () => {
		const provider = store.add(new WebviewThemeDataProvider(upcastPartial<IWorkbenchThemeService>({
			onDidColorThemeChange: Event.None,
			getColorTheme: () => upcastPartial<IWorkbenchColorTheme>(new TestColorTheme()),
		}), new TestConfigurationService({ editor: {} })));
		let changes = 0;
		store.add(provider.onThemeDataChanged(() => changes++));

		const readStyles = () => {
			const { styles } = provider.getWebviewThemeData();
			return [styles['vscode-font-family'], styles['vscode-font-size'], styles['vscode-fontSize-body1'], styles['vscode-codiconFontSize'], styles['vscode-cornerRadius-medium']];
		};

		const defaults = readStyles();
		setUITypography({ fontSize: 26, fontFamily: 'Georgia' });
		const custom = readStyles();
		setUITypography({ fontSize: 10, fontFamily: undefined });
		const small = readStyles();
		setUITypography(DEFAULT_UI_TYPOGRAPHY);

		assert.deepStrictEqual({ defaults, custom, small, restored: readStyles(), changes }, {
			defaults: [DEFAULT_FONT_FAMILY, '13px', '13px', '16px', '6px'],
			custom: ['Georgia', '26px', '26px', '32px', '6px'],
			small: [DEFAULT_FONT_FAMILY, '10px', '10px', '16px', '6px'],
			restored: defaults,
			changes: 3,
		});
	});
});
