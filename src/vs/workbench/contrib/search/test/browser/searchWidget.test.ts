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
import { SearchContextLinesMode } from '../../../searchEditor/browser/constants.js';
import { SearchWidget } from '../../browser/searchWidget.js';

suite('SearchWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let fixture: HTMLElement;

	setup(() => {
		fixture = document.createElement('div');
		document.body.appendChild(fixture);
	});

	teardown(() => fixture.remove());

	const createSearchWidget = () => {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				search: { searchEditor: { defaultNumberOfContextLines: 1 } }
			})
		}, disposables);
		instantiationService.stub(IClipboardService, new TestClipboardService());
		return disposables.add(instantiationService.createInstance(SearchWidget, fixture, {
			showContextToggle: true,
			inputBoxStyles: defaultInputBoxStyles,
			toggleStyles: defaultToggleStyles
		}));
	};

	test('sets the context line count and placement', () => {
		const widget = createSearchWidget();

		widget.setContextLines(3, SearchContextLinesMode.Before);

		assert.deepStrictEqual({
			contextLines: widget.getContextLines(),
			contextLinesMode: widget.getContextLinesMode(),
		}, {
			contextLines: 3,
			contextLinesMode: SearchContextLinesMode.Before,
		});
	});

	test('fires one change event when normalizing negative context lines', () => {
		const widget = createSearchWidget();
		let changeCount = 0;
		disposables.add(widget.onDidToggleContext(() => changeCount++));

		widget.contextLinesInput.value = '-1';

		assert.deepStrictEqual({
			value: widget.contextLinesInput.value,
			changeCount,
		}, {
			value: '0',
			changeCount: 1,
		});
	});

	test('disposes the context lines toggle', () => {
		const widget = createSearchWidget();
		const toggle = fixture.querySelector<HTMLElement>('.codicon-search-show-context');
		assert.ok(toggle);

		widget.dispose();
		toggle.click();

		assert.strictEqual(toggle.getAttribute('aria-checked'), 'false');
	});
});
