/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getEditorTelemetryId } from '../../../../browser/parts/editor/editorTelemetry.js';

suite('EditorTelemetry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getEditorTelemetryId only reports known editor IDs', () => {
		assert.deepStrictEqual(
			['default', 'vscode.markdown.editor', 'mainThreadWebview-markdown.preview', 'someExtension.secret-view-type', 'mainThreadWebview-someExtension.view', undefined].map(getEditorTelemetryId),
			['default', 'vscode.markdown.editor', 'mainThreadWebview-markdown.preview', 'other', 'other', 'none']
		);
	});
});
