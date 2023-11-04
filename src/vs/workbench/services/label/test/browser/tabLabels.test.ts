/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { CustomTabLabelService } from 'vs/workbench/services/label/common/customTabLabelService';
import { TestFileEditorInput, TestLifecycleService } from 'vs/workbench/test/browser/workbenchTestServices';

suite("custom tab labels", () => {
	let customTabLabelService: CustomTabLabelService;

	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditor';
	const GROUP_ID = 123;

	const disposables = new DisposableStore();

	setup(() => {
		customTabLabelService = new CustomTabLabelService(new TestLifecycleService());
	});

	teardown(() => {
		disposables.clear();
	});

	test('assign custom tab label to editor', function () {
		const editorInput = new TestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);

		disposables.add(editorInput);

		assert.strictEqual(
			customTabLabelService.getCustomTabLabelForEditor(editorInput, GROUP_ID),
			undefined,
		);

		customTabLabelService.setCustomTabLabelForEditor(editorInput, GROUP_ID, { name: "Custom label", description: "" });

		assert.deepEqual(
			customTabLabelService.getCustomTabLabelForEditor(editorInput, GROUP_ID),
			{ name: "Custom label", description: "" },
		);

		customTabLabelService.setCustomTabLabelForEditor(editorInput, GROUP_ID, undefined);

		assert.strictEqual(
			customTabLabelService.getCustomTabLabelForEditor(editorInput, GROUP_ID),
			undefined,
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
