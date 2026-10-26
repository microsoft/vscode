/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { toAction } from '../../../../../../../base/common/actions.js';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { isResourceDiffEditorInput, isResourceMultiDiffEditorInput } from '../../../../../../common/editor.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IChatResponseFileChangesService } from '../../../../browser/chatResponseFileChangesService.js';
import { ChatCheckpointFileChangesSummaryContentPart, renderChangesSummaryFileList } from '../../../../browser/widget/chatContentParts/chatChangesSummaryPart.js';
import { ChatCollapsibleContentPart } from '../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { emptySessionEntryDiff, IEditSessionEntryDiff } from '../../../../common/editing/chatEditingService.js';
import { IChatChangesSummaryPart } from '../../../../common/model/chatViewModel.js';

suite('ChatCheckpointFileChangesSummaryContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('updates visibility and aggregate counts when file changes arrive', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('testFileChanges', []);
		instantiationService.stub(IChatResponseFileChangesService, {
			_serviceBrand: undefined,
			registerProvider: () => Disposable.None,
			getChangesForRequest: () => diffs,
		});

		const content: IChatChangesSummaryPart = {
			kind: 'changesSummary',
			requestId: 'request',
			sessionResource: URI.parse('chat-session://test/session'),
		};
		const part = store.add(instantiationService.createInstance(
			ChatCheckpointFileChangesSummaryContentPart,
			content,
			{} as IChatContentPartRenderContext,
		));

		const readState = () => ({
			display: part.domNode.style.display,
			files: part.domNode.querySelector('.chat-file-changes-label')?.textContent,
			additions: part.domNode.querySelector('.insertions')?.textContent,
			deletions: part.domNode.querySelector('.deletions')?.textContent,
			headerOrder: Array.from(part.domNode.querySelector('summary')?.children ?? []).map(element => element.classList.item(0)),
		});
		const states = [readState()];

		diffs.set([
			{ ...emptySessionEntryDiff(URI.file('/file1.ts'), URI.file('/file1.ts')), added: 5, removed: 2 },
			{ ...emptySessionEntryDiff(URI.file('/file2.ts'), URI.file('/file2.ts')), added: 3, removed: 1 },
		], undefined);
		states.push(readState());

		assert.deepStrictEqual(states, [
			{
				display: 'none',
				files: '0 files changed',
				additions: '+0',
				deletions: '-0',
				headerOrder: ['chat-file-changes-label', 'chat-file-changes-counts', 'chat-view-changes-icon', 'chat-file-changes-chevron'],
			},
			{
				display: '',
				files: '2 files changed',
				additions: '+8',
				deletions: '-3',
				headerOrder: ['chat-file-changes-label', 'chat-file-changes-counts', 'chat-view-changes-icon', 'chat-file-changes-chevron'],
			},
		]);
	});

	test('signals user toggles and rotates the disclosure chevron', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatResponseFileChangesService, {
			_serviceBrand: undefined,
			registerProvider: () => Disposable.None,
			getChangesForRequest: () => observableValue('testFileChanges', [
				emptySessionEntryDiff(URI.file('/file.ts'), URI.file('/file.ts'))
			]),
		});
		const part = store.add(instantiationService.createInstance(
			ChatCheckpointFileChangesSummaryContentPart,
			{
				kind: 'changesSummary',
				requestId: 'request',
				sessionResource: URI.parse('chat-session://test/session'),
			},
			{} as IChatContentPartRenderContext,
		));
		let toggleCount = 0;
		const listener = () => toggleCount++;
		part.domNode.addEventListener(ChatCollapsibleContentPart.userToggleEvent, listener);
		store.add(toDisposable(() => part.domNode.removeEventListener(ChatCollapsibleContentPart.userToggleEvent, listener)));

		const header = part.domNode.querySelector<HTMLElement>('summary');
		const details = part.domNode.querySelector<HTMLDetailsElement>('details');
		const chevron = part.domNode.querySelector('.chat-file-changes-chevron');
		assert.ok(header);
		assert.ok(details);
		assert.ok(chevron);
		header.click();
		details.dispatchEvent(new Event('toggle'));

		assert.deepStrictEqual({
			open: details.open,
			expandedChevron: chevron.classList.contains('expanded'),
			toggleCount,
		}, {
			open: true,
			expandedChevron: true,
			toggleCount: 1,
		});
	});

	test('renders row actions before aligned change count columns', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const container = document.createElement('div');
		// Different digit lengths expose per-row sizing regressions.
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('testFileChanges', [
			{ ...emptySessionEntryDiff(URI.file('/file.md'), URI.file('/file.md')), added: 5, removed: 2 },
			{ ...emptySessionEntryDiff(URI.file('/other.md'), URI.file('/other.md')), added: 123, removed: 45 },
		]);
		const [editorService, configurationService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IEditorService),
			accessor.get(IConfigurationService),
		] as const);
		store.add(renderChangesSummaryFileList(container, diffs, instantiationService, editorService, configurationService, {
			getRowActions: () => [toAction({ id: 'preview', label: 'Preview', run: () => undefined })],
		}));

		const rows = Array.from(container.querySelectorAll('.chat-summary-list-row-with-actions'));
		assert.deepStrictEqual({
			rowOrder: rows.map(row => Array.from(row.children).map(element => element.classList.item(0))),
			counts: rows.map(row => Array.from(row.querySelectorAll('.insertions, .deletions')).map(element => element.textContent)),
			columnWidths: rows.map(row => Array.from(row.querySelectorAll<HTMLElement>('.insertions, .deletions')).map(element => element.style.width)),
		}, {
			rowOrder: [
				['monaco-icon-label', 'chat-summary-list-actions', 'insertions-and-deletions'],
				['monaco-icon-label', 'chat-summary-list-actions', 'insertions-and-deletions'],
			],
			counts: [
				['+5', '-2'],
				['+123', '-45'],
			],
			columnWidths: [
				['4ch', '3ch'],
				['4ch', '3ch'],
			],
		});
	});

	test('reveals icon row actions after the change counts and updates them when their state changes', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const container = document.createElement('div');
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('testFileChanges', [
			{ ...emptySessionEntryDiff(URI.file('/file.md'), URI.file('/file.md')), added: 5, removed: 2 },
		]);
		const undoOffered = observableValue('undoOffered', false);
		const [editorService, configurationService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IEditorService),
			accessor.get(IConfigurationService),
		] as const);
		store.add(renderChangesSummaryFileList(container, diffs, instantiationService, editorService, configurationService, {
			rowActionIcons: true,
			getRowActions: (_diff, reader) => [
				toAction({ id: 'keep', label: 'Keep', run: () => undefined }),
				...(undoOffered.read(reader) ? [toAction({ id: 'undo', label: 'Undo', run: () => undefined })] : []),
			],
		}));
		const readRow = () => {
			const row = container.querySelector('.monaco-list-row')!;
			return {
				withLinkActions: row.classList.contains('chat-summary-list-row-with-actions'),
				labelOrder: Array.from(row.querySelector('.monaco-icon-label')!.children).map(element => element.classList.item(0)),
				actions: Array.from(row.querySelectorAll('.action-label')).map(action => action.getAttribute('aria-label')),
			};
		};
		const states = [readRow()];
		undoOffered.set(true, undefined);
		states.push(readRow());

		const labelOrder = ['monaco-icon-label-container', 'insertions-and-deletions', 'chat-summary-list-icon-actions'];
		assert.deepStrictEqual(states, [
			{ withLinkActions: false, labelOrder, actions: ['Keep'] },
			{ withLinkActions: false, labelOrder, actions: ['Keep', 'Undo'] },
		]);
	});

	const file = (path: string): IEditSessionEntryDiff => ({ ...emptySessionEntryDiff(URI.file(path), URI.file(path)), added: 1 });

	function renderWithRowActions(initialDiffs: readonly IEditSessionEntryDiff[]) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('testFileChanges', initialDiffs);
		const [editorService, configurationService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IEditorService),
			accessor.get(IConfigurationService),
		] as const);
		store.add(renderChangesSummaryFileList(container, diffs, instantiationService, editorService, configurationService, {
			rowActionIcons: true,
			getRowActions: () => [
				toAction({ id: 'keep', label: 'Keep', run: () => undefined }),
				toAction({ id: 'undo', label: 'Undo', run: () => undefined }),
			],
		}));
		const list = container.querySelector<HTMLElement>('.monaco-list')!;
		const fileName = (element: Element | null | undefined) => element?.closest('.monaco-list-row')?.querySelector('.label-name')?.textContent;
		const rowOf = (name: string) => [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].find(row => fileName(row) === name)!;
		return {
			diffs,
			focusAction: (name: string, label: string) => rowOf(name).querySelector<HTMLElement>(`.action-label[aria-label="${label}"]`)!.focus(),
			readFocus: () => {
				const active = dom.getActiveElement();
				return active === list
					? { list: true, file: fileName(list.querySelector('.monaco-list-row.focused')) }
					: { action: active?.getAttribute('aria-label'), file: fileName(active) };
			},
		};
	}

	test('keeps keyboard focus on a row action while the rows are rebuilt, and on the list once its file leaves', () => {
		const { diffs, focusAction, readFocus } = renderWithRowActions([file('/a.ts'), file('/b.ts')]);
		focusAction('b.ts', 'Undo');
		const states = [readFocus()];
		diffs.set([file('/a.ts'), file('/b.ts')], undefined);
		states.push(readFocus());
		diffs.set([file('/c.ts'), file('/a.ts'), file('/b.ts')], undefined);
		states.push(readFocus());
		diffs.set([file('/c.ts'), file('/a.ts')], undefined);
		states.push(readFocus());
		diffs.set([], undefined);
		states.push(readFocus());

		assert.deepStrictEqual(states, [
			{ action: 'Undo', file: 'b.ts' },
			{ action: 'Undo', file: 'b.ts' },
			{ action: 'Undo', file: 'b.ts' },
			{ list: true, file: 'a.ts' },
			{ list: true, file: undefined },
		]);
	});

	test('keeps keyboard focus on a row action when an insertion moves its file out of view', () => {
		// Six files fill the list's view.
		const files = ['1', '2', '3', '4', '5', '6'].map(name => file(`/${name}.ts`));
		const { diffs, focusAction, readFocus } = renderWithRowActions(files);
		focusAction('6.ts', 'Keep');
		const states = [readFocus()];
		diffs.set([file('/a.ts'), file('/b.ts'), ...files], undefined);
		states.push(readFocus());

		assert.deepStrictEqual(states, [
			{ action: 'Keep', file: '6.ts' },
			{ action: 'Keep', file: '6.ts' },
		]);
	});

	test('opens row diffs using snapshots and missing create or delete sides', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const opened: unknown[] = [];
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				opened.push(args[0]);
				return undefined;
			}
		}();
		const configurationService = new class extends mock<IConfigurationService>() {
			override getValue<T>(): T {
				return true as T;
			}
		}();
		const container = document.createElement('div');
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('testFileChanges', [{
			...emptySessionEntryDiff(URI.file('/edited-before.ts'), URI.file('/edited.ts')),
			modifiedSnapshotURI: URI.file('/edited-snapshot.ts'),
		}, {
			...emptySessionEntryDiff(URI.file('/created.ts'), URI.file('/created.ts')),
			modifiedSnapshotURI: URI.file('/created-snapshot.ts'),
			isCreated: true,
		}, {
			...emptySessionEntryDiff(URI.file('/deleted-before.ts'), URI.file('/deleted.ts')),
			isDeleted: true,
		}]);
		store.add(renderChangesSummaryFileList(container, diffs, instantiationService, editorService, configurationService));

		for (const row of container.querySelectorAll<HTMLElement>('.monaco-list-row')) {
			row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		}

		assert.deepStrictEqual(opened.map(input => {
			if (isResourceDiffEditorInput(input)) {
				return {
					kind: 'diff',
					original: input.original.resource?.toString(),
					modified: input.modified.resource?.toString(),
				};
			}
			assert.ok(isResourceMultiDiffEditorInput(input));
			return {
				kind: 'multiDiff',
				resources: input.resources?.map(resource => ({
					original: resource.original.resource?.toString(),
					modified: resource.modified.resource?.toString(),
					goToFile: resource.goToFileResource?.toString(),
				})),
			};
		}), [{
			kind: 'diff',
			original: 'file:///edited-before.ts',
			modified: 'file:///edited-snapshot.ts',
		}, {
			kind: 'multiDiff',
			resources: [{
				original: undefined,
				modified: 'file:///created-snapshot.ts',
				goToFile: 'file:///created.ts',
			}],
		}, {
			kind: 'multiDiff',
			resources: [{
				original: 'file:///deleted-before.ts',
				modified: undefined,
				goToFile: 'file:///deleted.ts',
			}],
		}]);
	});
});
