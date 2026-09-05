/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SubmenuAction } from '../../../../../base/common/actions.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorInputWithDiffResources } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { createEditorTypeActions, getAvailableEditorTypes } from '../../../../browser/parts/editor/editorTypePicker.js';
import { EditorMatchRuleSource, EditorMatches, IEditorResolverService, IEditorResolverServiceGetEditorMatchesOptions, RegisteredEditorInfo, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

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

	function editorMatches(editors: readonly RegisteredEditorInfo[], defaultEditorId = DEFAULT_EDITOR_ASSOCIATION.id): EditorMatches {
		const matches = editors.map(editor => ({
			editor,
			priority: editor.priority.editor,
			source: EditorMatchRuleSource.EditorRegistration as const,
			globPattern: '*.test',
			associationPattern: '*.test'
		}));
		const defaultRuleIndex = matches.findIndex(match => match.editor.id === defaultEditorId);
		return new EditorMatches(matches, defaultRuleIndex, defaultRuleIndex, false);
	}

	test('inline custom diff editor is classified as a diff editor', () => {
		const original = URI.file('/original/test.md');
		const modified = URI.file('/modified/test.md');
		const registeredEditors = [
			editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
			editor('test.markdownEditor', RegisteredEditorPriority.option, RegisteredEditorPriority.explicit),
		];
		const matches = editorMatches(registeredEditors);
		const input = disposables.add(new class extends EditorInput implements IEditorInputWithDiffResources {
			override get typeId(): string { return 'test.inlineCustomDiffEditor'; }
			override get editorId(): string { return 'test.markdownEditor'; }
			override get resource(): URI { return modified; }
			get diffResources(): IEditorInputWithDiffResources['diffResources'] { return { original, modified }; }
			override getName(): string { return 'test'; }
		}());
		const requestedResources: URI[] = [];
		const requestedOptions: (IEditorResolverServiceGetEditorMatchesOptions | undefined)[] = [];
		const editorResolverService = new class extends mock<IEditorResolverService>() {
			override getEditorMatches(resource: URI, options?: IEditorResolverServiceGetEditorMatchesOptions): EditorMatches {
				requestedResources.push(resource);
				requestedOptions.push(options);
				return matches;
			}
		};

		const result = getAvailableEditorTypes(input, editorResolverService);

		assert.deepStrictEqual({ requestedResources, requestedOptions, result }, {
			requestedResources: [modified],
			requestedOptions: [{
				isDiffEditor: true,
			}],
			result: {
				resource: modified,
				isDiffEditor: true,
				originalResource: original,
				modifiedResource: modified,
				currentId: 'test.markdownEditor',
				editorMatches: matches,
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
		const matches = editorMatches(registeredEditors);
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
			override getEditorMatches(): EditorMatches {
				return matches;
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

	test('exclusive matches suppress the editor type picker', () => {
		const resource = URI.file('/workspace/test.hex');
		const registeredEditors = [
			editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
			editor('test.hexEditor', RegisteredEditorPriority.exclusive),
		];
		const matches = editorMatches(registeredEditors, 'test.hexEditor');
		const input = disposables.add(new class extends EditorInput {
			override get typeId(): string { return 'test.hexEditorInput'; }
			override get editorId(): string { return 'test.hexEditor'; }
			override get resource(): URI { return resource; }
			override getName(): string { return 'test'; }
		}());
		const editorResolverService = new class extends mock<IEditorResolverService>() {
			override getEditorMatches(): EditorMatches {
				return matches;
			}
		};

		assert.strictEqual(getAvailableEditorTypes(input, editorResolverService), undefined);
	});

	test('unconfigured universal optional matches only make the picker visible while active', () => {
		const resource = URI.file('/workspace/test.md');
		const registeredEditors = [
			editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
			editor('test.universalPreview', RegisteredEditorPriority.option),
		];
		const matches = new EditorMatches(registeredEditors.map(editor => ({
			editor,
			priority: editor.priority.editor,
			source: EditorMatchRuleSource.EditorRegistration,
			globPattern: '*',
			associationPattern: '*.md'
		})), 0, 0, false);
		class TestEditorInput extends EditorInput {
			constructor(private readonly id: string) {
				super();
			}

			override get typeId(): string { return 'test.editorInput'; }
			override get editorId(): string { return this.id; }
			override get resource(): URI { return resource; }
			override getName(): string { return 'test'; }
		}
		const editorResolverService = new class extends mock<IEditorResolverService>() {
			override getEditorMatches(): EditorMatches {
				return matches;
			}
		};
		const textEditor = disposables.add(new TestEditorInput(DEFAULT_EDITOR_ASSOCIATION.id));
		const universalPreview = disposables.add(new TestEditorInput('test.universalPreview'));

		assert.deepStrictEqual({
			inactive: getAvailableEditorTypes(textEditor, editorResolverService),
			activeEditorIds: getAvailableEditorTypes(universalPreview, editorResolverService)?.editors.map(editor => editor.id)
		}, {
			inactive: undefined,
			activeEditorIds: [DEFAULT_EDITOR_ASSOCIATION.id, 'test.universalPreview']
		});
	});

	test('set default uses the effective default scope instead of the active editor type', async () => {
		const resource = URI.file('/workspace/example.component.html');
		const registeredEditors = [
			editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
			editor('test.componentEditor', RegisteredEditorPriority.default),
		];
		const updates: Array<{ resource: URI; editorId: string; forDiffEditor: boolean | undefined }> = [];
		const commands: Array<{ id: string; args: unknown[] }> = [];
		const matches = new EditorMatches(registeredEditors.map(editor => ({
			editor,
			priority: editor.priority.editor,
			source: EditorMatchRuleSource.EditorRegistration,
			globPattern: editor.id === 'test.componentEditor' ? '*.component.html' : '*',
			associationPattern: editor.id === 'test.componentEditor' ? '*.component.html' : '*.html'
		})), 1, 1, false);
		const editorResolverService = new class extends mock<IEditorResolverService>() {
			override setDefaultEditor(resource: URI, editorId: string, forDiffEditor?: boolean): void {
				updates.push({ resource, editorId, forDiffEditor });
			}
		};
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
				commands.push({ id, args });
				return undefined;
			}
		};
		const actions = createEditorTypeActions({
			resource,
			isDiffEditor: false,
			currentId: DEFAULT_EDITOR_ASSOCIATION.id,
			editorMatches: matches,
			editors: registeredEditors
		}, editorResolverService, commandService, new class extends mock<IEditorService>() { });
		const setDefaultSubmenu = actions.find((action): action is SubmenuAction => action instanceof SubmenuAction);
		assert.ok(setDefaultSubmenu);

		await setDefaultSubmenu.actions[0].run();

		assert.deepStrictEqual({
			label: setDefaultSubmenu.label,
			checked: setDefaultSubmenu.actions.map(action => action.checked),
			updates,
			commands
		}, {
			label: 'Set Default for \'*.component.html\'',
			checked: [false, true],
			updates: [{
				resource,
				editorId: DEFAULT_EDITOR_ASSOCIATION.id,
				forDiffEditor: false
			}],
			commands: [{
				id: 'reopenActiveEditorWith',
				args: [DEFAULT_EDITOR_ASSOCIATION.id]
			}]
		});
	});

});
