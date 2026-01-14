/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserEditorInput, IBrowserEditorInputData } from '../browserEditorInput.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';

suite('BrowserEditorInput', () => {
	let instantiationService: TestInstantiationService;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() { });
	});

	test('truncates long titles to MAX_TITLE_LENGTH characters', () => {
		const longTitle = 'a'.repeat(200); // 200 characters
		const data: IBrowserEditorInputData = {
			id: 'test-browser',
			url: 'https://example.com',
			title: longTitle
		};

		const input = instantiationService.createInstance(BrowserEditorInput, data);
		const name = input.getName();

		// Should be truncated to 100 characters + ellipsis (…)
		assert.strictEqual(name.length, 101); // 100 chars + 1 ellipsis char
		assert.ok(name.endsWith('…'));
		assert.ok(name.startsWith('a'.repeat(100)));

		input.dispose();
	});

	test('does not truncate short titles', () => {
		const shortTitle = 'Short Title';
		const data: IBrowserEditorInputData = {
			id: 'test-browser',
			url: 'https://example.com',
			title: shortTitle
		};

		const input = instantiationService.createInstance(BrowserEditorInput, data);
		const name = input.getName();

		assert.strictEqual(name, shortTitle);

		input.dispose();
	});

	test('truncates title at exactly MAX_TITLE_LENGTH', () => {
		const exactTitle = 'a'.repeat(100); // Exactly 100 characters
		const data: IBrowserEditorInputData = {
			id: 'test-browser',
			url: 'https://example.com',
			title: exactTitle
		};

		const input = instantiationService.createInstance(BrowserEditorInput, data);
		const name = input.getName();

		// Should not be truncated since it's exactly at the limit
		assert.strictEqual(name, exactTitle);

		input.dispose();
	});

	test('truncates title at MAX_TITLE_LENGTH + 1', () => {
		const overLimitTitle = 'a'.repeat(101); // 101 characters
		const data: IBrowserEditorInputData = {
			id: 'test-browser',
			url: 'https://example.com',
			title: overLimitTitle
		};

		const input = instantiationService.createInstance(BrowserEditorInput, data);
		const name = input.getName();

		// Should be truncated to 100 characters + ellipsis
		assert.strictEqual(name.length, 101);
		assert.ok(name.endsWith('…'));

		input.dispose();
	});

	test('getDescription returns full URL for tooltip', () => {
		const longTitle = 'a'.repeat(200);
		const url = 'https://example.com/very/long/path';
		const data: IBrowserEditorInputData = {
			id: 'test-browser',
			url: url,
			title: longTitle
		};

		const input = instantiationService.createInstance(BrowserEditorInput, data);
		const description = input.getDescription();

		// Description should be the full URL (used for tooltip)
		assert.strictEqual(description, url);

		input.dispose();
	});
});
