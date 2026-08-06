/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorInputCapabilities } from '../../../../../workbench/common/editor.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';

suite('SessionChangesEditorInput', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('declares managed Changes editor capabilities', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const input = disposables.add(new SessionChangesEditorInput(URI.parse('test-changes:session'), instantiationService));

		assert.strictEqual(input.capabilities,
			EditorInputCapabilities.ExcludeFromEditorLimit |
			EditorInputCapabilities.Singleton |
			EditorInputCapabilities.Readonly |
			EditorInputCapabilities.CannotClose);
	});
});
