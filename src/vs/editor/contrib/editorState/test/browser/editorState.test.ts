/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { Position } from '../../../../common/core/position.js';
import { Selection } from '../../../../common/core/selection.js';
import { ITextModel } from '../../../../common/model.js';
import { CodeEditorStateFlag, EditorState } from '../../browser/editorState.js';

interface IStubEditorState {
	model?: { uri?: URI; version?: number };
	position?: Position;
	selection?: Selection;
	scroll?: { left?: number; top?: number };
}

suite('Editor Core - Editor State', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const allFlags = (
		CodeEditorStateFlag.Value
		| CodeEditorStateFlag.Selection
		| CodeEditorStateFlag.Position
		| CodeEditorStateFlag.Scroll
	);

	test('empty editor state should be valid', () => {
		const result = validate({}, {});
		assert.strictEqual(result, true);
	});

	test('different model URIs should be invalid', () => {
		const result = validate(
			{ model: { uri: URI.parse('http://test1') } },
			{ model: { uri: URI.parse('http://test2') } }
		);

		assert.strictEqual(result, false);
	});

	test('different model versions should be invalid', () => {
		const result = validate(
			{ model: { version: 1 } },
			{ model: { version: 2 } }
		);

		assert.strictEqual(result, false);
	});

	test('different positions should be invalid', () => {
		const result = validate(
			{ position: new Position(1, 2) },
			{ position: new Position(2, 3) }
		);

		assert.strictEqual(result, false);
	});

	test('different selections should be invalid', () => {
		const result = validate(
			{ selection: new Selection(1, 2, 3, 4) },
			{ selection: new Selection(5, 2, 3, 4) }
		);

		assert.strictEqual(result, false);
	});

	test('different scroll positions should be invalid', () => {
		const result = validate(
			{ scroll: { left: 1, top: 2 } },
			{ scroll: { left: 3, top: 2 } }
		);

		assert.strictEqual(result, false);
	});


	function validate(source: IStubEditorState, target: IStubEditorState) {
		const sourceEditor = createEditor(source),
			targetEditor = createEditor(target);

		const result = new EditorState(sourceEditor, allFlags).validate(targetEditor);

		return result;
	}

	function createEditor({ model, position, selection, scroll }: IStubEditorState = {}): ICodeEditor {
		const mappedModel = model ? { uri: model.uri ? model.uri : URI.parse('http://dummy.org'), getVersionId: () => model.version } : null;

		return {
			// eslint-disable-next-line local/code-no-any-casts
			getModel: (): ITextModel => <any>mappedModel,
			getPosition: (): Position | undefined => position,
			getSelection: (): Selection | undefined => selection,
			getScrollLeft: (): number | undefined => scroll && scroll.left,
			getScrollTop: (): number | undefined => scroll && scroll.top
		} as ICodeEditor;
	}

});
