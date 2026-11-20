/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { EditorMatches, EditorMatchRuleSource, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { countOtherMarkdownEditors, countPreviewExtensions, defaultMarkdownEditorKind } from '../../browser/markdownEditorNudgeContext.js';

suite('Markdown Editor nudge context', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function extension(contributes: Record<string, unknown> | undefined, isBuiltin = false): IExtensionDescription {
		const partial: Partial<IExtensionDescription> = { contributes, isBuiltin };
		return partial as IExtensionDescription;
	}

	function matches(editors: readonly { readonly id: string; readonly globPattern?: string; readonly priority?: RegisteredEditorPriority }[], defaultEditorId: string): EditorMatches {
		const rules = editors.map(({ id, globPattern = '*.md', priority = RegisteredEditorPriority.option }) => ({
			editor: { id, label: id, priority: { editor: priority, diff: priority, merge: priority } },
			priority,
			source: EditorMatchRuleSource.EditorRegistration as const,
			globPattern,
			associationPattern: globPattern,
		}));
		const defaultIndex = rules.findIndex(rule => rule.editor.id === defaultEditorId);
		return new EditorMatches(rules, defaultIndex, defaultIndex, false);
	}

	test('counts non-built-in extensions that extend the Markdown preview', () => {
		assert.strictEqual(countPreviewExtensions([
			extension({ 'markdown.markdownItPlugins': true }),
			extension({ 'markdown.previewStyles': ['./a.css'], 'markdown.previewScripts': ['./a.js'] }),
			extension({ 'markdown.markdownItPlugins': true }, true),
			extension({ 'markdown.markdownItPlugins': false, 'markdown.previewScripts': [], 'markdown.previewStyles': [] }),
			extension({ languages: [] }),
			extension(undefined),
		]), 2);
	});

	test('counts other Markdown editors and the default editor kind', () => {
		const markdownMatches = matches([
			{ id: DEFAULT_EDITOR_ASSOCIATION.id, globPattern: '*', priority: RegisteredEditorPriority.builtin },
			{ id: 'vscode.markdown.editor' },
			{ id: 'vscode.markdown.preview.editor' },
			{ id: 'someone.markdownViewer' },
			{ id: 'someone.anyFileViewer', globPattern: '*' },
		], 'vscode.markdown.preview.editor');

		assert.deepStrictEqual({
			otherMarkdownEditorCount: countOtherMarkdownEditors(markdownMatches),
			defaultBefore: defaultMarkdownEditorKind(markdownMatches),
			defaultWhenText: defaultMarkdownEditorKind(matches([{ id: DEFAULT_EDITOR_ASSOCIATION.id, globPattern: '*' }], DEFAULT_EDITOR_ASSOCIATION.id)),
		}, {
			otherMarkdownEditorCount: 1,
			defaultBefore: 'markdownPreview',
			defaultWhenText: 'text',
		});
	});
});
