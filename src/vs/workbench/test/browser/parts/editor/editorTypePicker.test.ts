/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { IAvailableEditorTypes, hasDefaultEditorAssociation } from '../../../../browser/parts/editor/editorTypePicker.js';
import { RegisteredEditorInfo, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';

suite('Editor Type Picker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function editor(id: string, editorPriority: RegisteredEditorPriority, diffPriority = editorPriority): RegisteredEditorInfo {
		return {
			id,
			label: id,
			priority: {
				editor: editorPriority,
				diff: diffPriority,
				merge: editorPriority,
			}
		};
	}

	function available(customEditor: RegisteredEditorInfo, isDiffEditor = false): IAvailableEditorTypes {
		return {
			resource: URI.file('/test.txt'),
			isDiffEditor,
			currentId: DEFAULT_EDITOR_ASSOCIATION.id,
			editors: [
				editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
				customEditor,
			]
		};
	}

	test('default editor association visibility', () => {
		const optionalEditor = available(editor('test.optionalEditor', RegisteredEditorPriority.option));
		const defaultEditor = available(editor('test.defaultEditor', RegisteredEditorPriority.default));
		const builtinEditor = available(editor('test.builtinEditor', RegisteredEditorPriority.builtin));
		const diffDefaultEditor = available(editor('test.diffDefaultEditor', RegisteredEditorPriority.option, RegisteredEditorPriority.default), true);

		assert.deepStrictEqual({
			optionalEditor: hasDefaultEditorAssociation(optionalEditor, undefined),
			configuredOptionalEditor: hasDefaultEditorAssociation(optionalEditor, 'test.optionalEditor'),
			configuredTextEditor: hasDefaultEditorAssociation(optionalEditor, DEFAULT_EDITOR_ASSOCIATION.id),
			defaultEditor: hasDefaultEditorAssociation(defaultEditor, undefined),
			defaultEditorOverriddenWithText: hasDefaultEditorAssociation(defaultEditor, DEFAULT_EDITOR_ASSOCIATION.id),
			builtinEditor: hasDefaultEditorAssociation(builtinEditor, undefined),
			diffDefaultEditor: hasDefaultEditorAssociation(diffDefaultEditor, undefined),
		}, {
			optionalEditor: false,
			configuredOptionalEditor: true,
			configuredTextEditor: false,
			defaultEditor: true,
			defaultEditorOverriddenWithText: true,
			builtinEditor: true,
			diffDefaultEditor: true,
		});
	});
});