/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { isRestorableEditor } from '../../browser/unattendedRestartParticipants.js';

suite('isRestorableEditor', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function serializer(canSerialize: boolean, value: string | undefined): IEditorSerializer {
		return {
			canSerialize: () => canSerialize,
			serialize: () => value,
			deserialize: () => undefined,
		};
	}

	test('requires the serializer to produce a value', () => {
		const editor = upcastPartial<EditorInput>({ typeId: 'test' });

		assert.deepStrictEqual({
			noSerializer: isRestorableEditor(editor, undefined),
			cannotSerialize: isRestorableEditor(editor, serializer(false, '{}')),
			serializesNothing: isRestorableEditor(editor, serializer(true, undefined)), // e.g. a notebook output editor that was never opened
			serializes: isRestorableEditor(editor, serializer(true, '{}')),
		}, {
			noSerializer: false,
			cannotSerialize: false,
			serializesNothing: false,
			serializes: true,
		});
	});
});
