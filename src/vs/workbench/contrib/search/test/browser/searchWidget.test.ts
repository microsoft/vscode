/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { defaultInputBoxStyles, defaultToggleStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SearchWidget } from '../../browser/searchWidget.js';

suite('SearchWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let fixture: HTMLElement;

	setup(() => {
		fixture = document.createElement('div');
		document.body.appendChild(fixture);
	});

	teardown(() => fixture.remove());

	test('disposes the context lines toggle', () => {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				search: { searchEditor: { defaultNumberOfContextLines: 1 } }
			})
		}, disposables);
		instantiationService.stub(IClipboardService, new TestClipboardService());
		const widget = disposables.add(instantiationService.createInstance(SearchWidget, fixture, {
			showContextToggle: true,
			inputBoxStyles: defaultInputBoxStyles,
			toggleStyles: defaultToggleStyles
		}));
		const toggle = fixture.querySelector<HTMLElement>('.codicon-search-show-context');
		assert.ok(toggle);

		widget.dispose();
		toggle.click();

		assert.strictEqual(toggle.getAttribute('aria-checked'), 'false');
	});
});
