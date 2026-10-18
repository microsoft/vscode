/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IUntypedEditorInput, isResourceDiffEditorInput, isResourceMultiDiffEditorInput } from '../../../../../../common/editor.js';
import { EditorInput } from '../../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatSessionWorkingSet } from '../../../../browser/widget/input/chatSessionWorkingSet.js';
import { AgentChatAccessibilityHelp } from '../../../../browser/actions/chatAccessibilityHelp.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatModeKind } from '../../../../common/constants.js';
import { emptySessionEntryDiff, IEditSessionEntryDiff } from '../../../../common/editing/chatEditingService.js';

suite('ChatSessionWorkingSet', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWorkingSet(initialDiffs: readonly IEditSessionEntryDiff[], openInDiffEditor = true) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configurationService = new TestConfigurationService({ [ChatConfiguration.OpenChangedFileInDiffEditor]: openInDiffEditor });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		const opened: (EditorInput | IUntypedEditorInput)[] = [];
		instantiationService.stub(IEditorService, {
			openEditor: async (input: EditorInput | IUntypedEditorInput) => {
				opened.push(input);
				return undefined;
			},
		});
		const diffs = observableValue('sessionDiffs', initialDiffs);
		const collapsed = observableValue('collapsed', false);
		const workingSet = store.add(instantiationService.createInstance(ChatSessionWorkingSet, diffs, collapsed));
		document.body.appendChild(workingSet.domNode);
		store.add(toDisposable(() => workingSet.domNode.remove()));
		return { workingSet, diffs, collapsed, opened, instantiationService };
	}

	test('shows session files and counts without header or file action toolbars', () => {
		const { workingSet } = createWorkingSet([
			{ ...emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/src/first.ts')), added: 15, removed: 2 },
			{ ...emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/src/second.ts')), added: 3, removed: 1 },
		]);
		assert.deepStrictEqual({
			header: workingSet.domNode.querySelector('.monaco-button')?.getAttribute('aria-label'),
			expanded: workingSet.domNode.querySelector('.monaco-button')?.getAttribute('aria-expanded'),
			rows: [...workingSet.domNode.querySelectorAll('.monaco-list-row')].map(row => row.getAttribute('aria-label')),
			buttons: workingSet.domNode.querySelectorAll('.monaco-button').length,
			toolbars: workingSet.domNode.querySelectorAll('.monaco-action-bar, .chat-editing-session-actions, .chat-summary-list-actions').length,
		}, {
			header: 'Session changes, 2 files changed, 18 lines added, 3 lines removed',
			expanded: 'true',
			rows: ['/src/first.ts, 15 lines added, 2 lines removed', '/src/second.ts, 3 lines added, 1 line removed'],
			buttons: 1,
			toolbars: 0,
		});
	});

	for (const [added, removed, lineCounts] of [
		[0, 0, '0 lines added, 0 lines removed'],
		[1, 1, '1 line added, 1 line removed'],
		[1, 2, '1 line added, 2 lines removed'],
		[2, 1, '2 lines added, 1 line removed'],
		[2, 3, '2 lines added, 3 lines removed'],
	] as const) {
		for (const kind of ['modified', 'created', 'deleted'] as const) {
			test(`announces ${kind} file counts with correct singular and plural forms (${added}, ${removed})`, () => {
				const { workingSet } = createWorkingSet([{
					...emptySessionEntryDiff(URI.file('/before/file.ts'), URI.file('/file.ts')),
					added,
					removed,
					isCreated: kind === 'created',
					isDeleted: kind === 'deleted',
				}]);
				const kindLabel = kind === 'created' ? 'added, ' : kind === 'deleted' ? 'deleted, ' : '';
				assert.deepStrictEqual({
					header: workingSet.domNode.querySelector('.monaco-button')?.getAttribute('aria-label'),
					row: workingSet.domNode.querySelector('.monaco-list-row')?.getAttribute('aria-label'),
				}, {
					header: `Session changes, 1 file changed, ${lineCounts}`,
					row: `/file.ts, ${kindLabel}${lineCounts}`,
				});
			});
		}
	}

	test('keeps disclosure state while cumulative changes update', () => {
		const first = { ...emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')), added: 1 };
		const { workingSet, diffs } = createWorkingSet([first]);
		const heading = workingSet.domNode.querySelector<HTMLElement>('.monaco-button')!;
		heading.click();
		diffs.set([first, { ...emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts')), added: 2 }], undefined);
		const collapsedState = {
			header: heading.getAttribute('aria-label'),
			expanded: heading.getAttribute('aria-expanded'),
			collapsed: workingSet.domNode.querySelector('.chat-editing-session-list')?.classList.contains('collapsed'),
		};
		heading.click();

		assert.deepStrictEqual({
			collapsedState,
			expanded: heading.getAttribute('aria-expanded'),
			rows: workingSet.domNode.querySelectorAll('.monaco-list-row').length,
		}, {
			collapsedState: {
				header: 'Session changes, 2 files changed, 3 lines added, 0 lines removed',
				expanded: 'false',
				collapsed: true,
			},
			expanded: 'true',
			rows: 2,
		});
	});

	test('reserves scrollbar space only when more than six files are shown', () => {
		const initialDiffs = Array.from({ length: 9 }, (_, index) =>
			emptySessionEntryDiff(URI.file(`/before/file${index}.ts`), URI.file(`/file${index}.ts`)));
		const { workingSet, diffs } = createWorkingSet(initialDiffs);
		const list = workingSet.domNode.querySelector<HTMLElement>('.monaco-list')!;
		const state = () => ({
			overflowing: workingSet.domNode.querySelector('.chat-summary-list')?.classList.contains('overflowing'),
			height: list.style.height,
			rows: list.querySelectorAll('.monaco-list-row').length,
		});
		const states = [state()];
		diffs.set(initialDiffs.slice(0, 3), undefined);
		states.push(state());
		assert.deepStrictEqual(states, [
			{ overflowing: true, height: '132px', rows: 6 },
			{ overflowing: false, height: '66px', rows: 3 },
		]);
	});

	for (const openInDiffEditor of [false, true]) {
		for (const altKey of [false, true]) {
			test(`always opens file diffs (response setting: ${openInDiffEditor}, Alt: ${altKey})`, () => {
				const { workingSet, opened } = createWorkingSet([{
					...emptySessionEntryDiff(URI.parse('snapshot:/before/changed.ts'), URI.file('/changed.ts')),
					modifiedSnapshotURI: URI.parse('snapshot:/after/changed.ts'),
				}], openInDiffEditor);
				workingSet.domNode.querySelector('.monaco-list-row')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, altKey }));

				assert.deepStrictEqual(opened.map(input => isResourceDiffEditorInput(input) ? {
					original: input.original.resource?.toString(),
					modified: input.modified.resource?.toString(),
				} : undefined), [{ original: 'snapshot:/before/changed.ts', modified: 'snapshot:/after/changed.ts' }]);
			});
		}
	}

	test('opens additions and deletions with the absent side empty', () => {
		const { workingSet, opened } = createWorkingSet([{
			...emptySessionEntryDiff(URI.file('/created.ts'), URI.file('/created.ts')),
			modifiedSnapshotURI: URI.parse('snapshot:/created.ts'),
			isCreated: true,
		}, {
			...emptySessionEntryDiff(URI.parse('snapshot:/deleted.ts'), URI.file('/deleted.ts')),
			isDeleted: true,
		}]);
		for (const row of workingSet.domNode.querySelectorAll('.monaco-list-row')) {
			row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		}

		assert.deepStrictEqual(opened.map(input => isResourceMultiDiffEditorInput(input) ? input.resources?.map(resource => ({
			original: resource.original.resource?.toString(),
			modified: resource.modified.resource?.toString(),
			file: resource.goToFileResource?.toString(),
		})) : undefined), [
			[{ original: undefined, modified: 'snapshot:/created.ts', file: 'file:///created.ts' }],
			[{ original: 'snapshot:/deleted.ts', modified: undefined, file: 'file:///deleted.ts' }],
		]);
	});

	test('returns focus to the heading when the focused file list collapses', () => {
		const { workingSet, collapsed } = createWorkingSet([emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts'))]);
		workingSet.domNode.querySelector<HTMLElement>('.monaco-list')!.focus();
		collapsed.set(true, undefined);
		assert.strictEqual(dom.getActiveElement(), workingSet.domNode.querySelector('.monaco-button'));
	});

	test('supports accessibility help without enabling composer shortcuts in the working set', () => {
		const { workingSet, instantiationService } = createWorkingSet([emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts'))]);
		const contextKeyService = instantiationService.get(IContextKeyService);
		ChatContextKeys.chatModeKind.bindTo(contextKeyService).set(ChatModeKind.Agent);
		const context = contextKeyService.getContext(workingSet.domNode.querySelector<HTMLElement>('.monaco-list')!);
		assert.deepStrictEqual({
			workingSet: context.getValue(ChatContextKeys.inChatSessionWorkingSet.key),
			input: context.getValue(ChatContextKeys.inChatInput.key) === true,
			help: new AgentChatAccessibilityHelp().when?.evaluate(context),
		}, { workingSet: true, input: false, help: true });
	});
});
