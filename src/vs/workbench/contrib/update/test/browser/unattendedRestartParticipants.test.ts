/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { describeEditors, hasNonEditorWindow, isRestorableEditor } from '../../browser/unattendedRestartParticipants.js';

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

suite('describeEditors', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('names the editors with their kind', () => {
		assert.strictEqual(describeEditors([
			{ typeId: 'workbench.editors.webviewInput', editorId: 'releaseNotes', getName: () => 'Release Notes: 1.145.0' },
			{ typeId: 'workbench.input.interactive', editorId: undefined, getName: () => 'Interactive-1' },
		]), 'Release Notes: 1.145.0 [workbench.editors.webviewInput, releaseNotes], Interactive-1 [workbench.input.interactive]');
	});
});

suite('hasNonEditorWindow', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('only windows with an editor part are restored', () => {
		const mainWindow = 1;
		const editorWindow = 2;
		const issueReporterWindow = 3;
		const parts = [{ windowId: mainWindow }, { windowId: editorWindow }];

		assert.deepStrictEqual({
			mainWindowOnly: hasNonEditorWindow([mainWindow], parts),
			withEditorWindow: hasNonEditorWindow([mainWindow, editorWindow], parts),
			withIssueReporter: hasNonEditorWindow([mainWindow, editorWindow, issueReporterWindow], parts),
		}, {
			mainWindowOnly: false,
			withEditorWindow: false,
			withIssueReporter: true,
		});
	});
});
