/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorInputWithDiffResources } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { getAvailableEditorTypes, IAvailableEditorTypes, hasDefaultEditorAssociation } from '../../../../browser/parts/editor/editorTypePicker.js';
import { IEditorResolverService, RegisteredEditorInfo, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';

suite('Editor Type Picker', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
	test('inline custom diff editor is classified as a diff editor', () => {
		const original = URI.file('/original/test.md');
		const modified = URI.file('/modified/test.md');
		const registeredEditors = [
			editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
			editor('test.markdownEditor', RegisteredEditorPriority.option, RegisteredEditorPriority.explicit),
		];
		const input = disposables.add(new class extends EditorInput implements IEditorInputWithDiffResources {
			override get typeId(): string { return 'test.inlineCustomDiffEditor'; }
			override get editorId(): string { return 'test.markdownEditor'; }
			override get resource(): URI { return modified; }
			get diffResources(): IEditorInputWithDiffResources['diffResources'] { return { original, modified }; }
			override getName(): string { return 'test'; }
		}());
		const requestedResources: URI[] = [];
		const editorResolverService = new class extends mock<IEditorResolverService>() {
			override getEditors(resource?: URI): RegisteredEditorInfo[] {
				if (resource) {
					requestedResources.push(resource);
				}
				return registeredEditors;
			}
		};

		const result = getAvailableEditorTypes(input, editorResolverService);

		assert.deepStrictEqual({ requestedResources, result }, {
			requestedResources: [modified],
			result: {
				resource: modified,
				isDiffEditor: true,
				originalResource: original,
				modifiedResource: modified,
				currentId: 'test.markdownEditor',
				editors: registeredEditors,
			}
		});
	});
});