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
import { getAvailableEditorTypes } from '../../../../browser/parts/editor/editorTypePicker.js';
import { IEditorResolverService, IEditorResolverServiceGetAllEditorsOptions, IEditorResolverServiceGetEditorsOptions, RegisteredEditorInfo, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';

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
		const requestedOptions: (IEditorResolverServiceGetEditorsOptions | undefined)[] = [];
		const editorResolverService = new class extends mock<IEditorResolverService>() {
			override getEditors(resourceOrOptions?: URI | IEditorResolverServiceGetAllEditorsOptions, options?: IEditorResolverServiceGetEditorsOptions): RegisteredEditorInfo[] {
				if (URI.isUri(resourceOrOptions)) {
					requestedResources.push(resourceOrOptions);
				}
				requestedOptions.push(options);
				return registeredEditors;
			}
		};

		const result = getAvailableEditorTypes(input, editorResolverService);

		assert.deepStrictEqual({ requestedResources, requestedOptions, result }, {
			requestedResources: [modified],
			requestedOptions: [{
				excludeUnconfiguredUniversalOptionalEditors: true,
				currentEditorId: 'test.markdownEditor',
				isDiffEditor: true,
			}],
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
	test('hidden editor types are omitted unless currently active', () => {
		const resource = URI.file('/workspace/test.md');
		const registeredEditors = [
			editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
			editor('test.markdownEditor', RegisteredEditorPriority.option),
			editor('test.markdownPreview', RegisteredEditorPriority.option),
		];
		class TestEditorInput extends EditorInput {
			constructor(private readonly id: string) {
				super();
			}

			override get typeId(): string { return 'test.editor'; }
			override get editorId(): string { return this.id; }
			override get resource(): URI { return resource; }
			override getName(): string { return 'test'; }
		}
		const editorResolverService = new class extends mock<IEditorResolverService>() {
			override getEditors(): RegisteredEditorInfo[] {
				return registeredEditors;
			}
		};
		const markdownEditor = disposables.add(new TestEditorInput('test.markdownEditor'));
		const markdownPreview = disposables.add(new TestEditorInput('test.markdownPreview'));
		const getEditorIds = (input: EditorInput) => getAvailableEditorTypes(input, editorResolverService, ['test.markdownPreview'])?.editors.map(editor => editor.id);

		assert.deepStrictEqual({
			hidden: getEditorIds(markdownEditor),
			active: getEditorIds(markdownPreview),
		}, {
			hidden: [DEFAULT_EDITOR_ASSOCIATION.id, 'test.markdownEditor'],
			active: [DEFAULT_EDITOR_ASSOCIATION.id, 'test.markdownEditor', 'test.markdownPreview'],
		});
	});

});