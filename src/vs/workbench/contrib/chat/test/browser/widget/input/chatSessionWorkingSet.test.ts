/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../../../editor/browser/editorBrowser.js';
import { EditorType } from '../../../../../../../editor/common/editorCommon.js';
import { IMenuService } from '../../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IEditorPane, isResourceDiffEditorInput, isResourceEditorInput, isResourceMultiDiffEditorInput, ITextDiffEditorPane, IUntypedEditorInput } from '../../../../../../common/editor.js';
import { EditorInput } from '../../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatSessionWorkingSet, IChatSessionWorkingSetReview } from '../../../../browser/widget/input/chatSessionWorkingSet.js';
import { AgentChatAccessibilityHelp } from '../../../../browser/actions/chatAccessibilityHelp.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatModeKind } from '../../../../common/constants.js';
import { emptySessionEntryDiff, IChatEditingSession, IEditSessionEntryDiff, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../../../common/editing/chatEditingService.js';

suite('ChatSessionWorkingSet', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWorkingSet(initialDiffs: readonly IEditSessionEntryDiff[], openInDiffEditor = true, review?: IChatSessionWorkingSetReview, getPane?: (input: EditorInput | IUntypedEditorInput) => IEditorPane | undefined) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configurationService = new TestConfigurationService({ [ChatConfiguration.OpenChangedFileInDiffEditor]: openInDiffEditor });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		const executed: string[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = Event.None;
			override readonly onDidExecuteCommand = Event.None;
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				executed.push([id, ...args.map(String)].join(' '));
				return undefined;
			}
		}());
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const opened: (EditorInput | IUntypedEditorInput)[] = [];
		instantiationService.stub(IEditorService, {
			openEditor: async (input: EditorInput | IUntypedEditorInput) => {
				opened.push(input);
				return getPane?.(input) as ITextDiffEditorPane | undefined;
			},
		});
		const diffs = observableValue('sessionDiffs', initialDiffs);
		const collapsed = observableValue('collapsed', false);
		const workingSet = store.add(instantiationService.createInstance(ChatSessionWorkingSet, diffs, collapsed, review));
		document.body.appendChild(workingSet.domNode);
		store.add(toDisposable(() => workingSet.domNode.remove()));
		return { workingSet, diffs, collapsed, opened, executed, instantiationService };
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

	suite('Keep and Undo', () => {

		function createEntry(path: string, state = ModifiedFileEntryState.Modified): IModifiedFileEntry {
			const uri = URI.file(path);
			return new class extends mock<IModifiedFileEntry>() {
				override readonly modifiedURI = uri;
				override readonly originalURI = uri.with({ scheme: 'chat-editing-text-model' });
				override readonly state = constObservable(state);
				override readonly linesAdded = constObservable(2);
				override readonly linesRemoved = constObservable(1);
			}();
		}

		function createReview(initialEntries: readonly IModifiedFileEntry[], supportsKeepUndo = true) {
			const entries = observableValue<readonly IModifiedFileEntry[]>('entries', initialEntries);
			const session = new class extends mock<IChatEditingSession>() {
				override readonly supportsKeepUndo = supportsKeepUndo;
				override readonly chatSessionResource = URI.parse('agent-host-copilot:/session');
				override readonly entries = entries;
			}();
			const review: IChatSessionWorkingSetReview = { editingSession: constObservable(session), getActionArg: () => undefined };
			return { review, entries };
		}

		const sessionDiffs = [
			{ ...emptySessionEntryDiff(URI.file('/before/reviewed.ts'), URI.file('/reviewed.ts')), added: 4, removed: 1 },
			{ ...emptySessionEntryDiff(URI.file('/before/kept.ts'), URI.file('/kept.ts')), added: 1 },
		];

		function isShown(element: Element | undefined | null): element is HTMLElement {
			return dom.isHTMLElement(element) && element.style.display !== 'none' && !element.classList.contains('collapsed');
		}

		function describeRows(list: Element | undefined) {
			if (!isShown(list)) {
				return undefined;
			}
			return [...list.querySelectorAll('.monaco-list-row')].map(row => {
				const actions = [...row.querySelectorAll('.chat-collapsible-list-action-bar .action-label')].map(label => label.getAttribute('aria-label'));
				return actions.length ? `${row.getAttribute('aria-label')} [${actions.join(', ')}]` : row.getAttribute('aria-label');
			});
		}

		function describeWorkingSet(workingSet: ChatSessionWorkingSet) {
			const tablist = workingSet.domNode.querySelector('.working-set-tabs');
			const [sessionList, reviewList] = workingSet.domNode.querySelectorAll('.chat-editing-session-list');
			return {
				heading: workingSet.domNode.querySelector('.working-set-title .monaco-button')?.getAttribute('aria-label'),
				tabs: isShown(tablist) ? [...tablist.querySelectorAll('.working-set-tab')].map(tab => `${tab.getAttribute('aria-label')}${tab.getAttribute('aria-selected') === 'true' ? ' (selected)' : ''}`) : undefined,
				actions: isShown(workingSet.domNode.querySelector('.chat-editing-session-actions')),
				session: describeRows(sessionList),
				review: describeRows(reviewList),
			};
		}

		function getTabs(workingSet: ChatSessionWorkingSet) {
			const [session, review] = workingSet.domNode.querySelectorAll<HTMLElement>('.working-set-tab');
			return { session, review };
		}

		test('shows the changes to review in a tab next to the session changes', () => {
			const { review } = createReview([createEntry('/reviewed.ts'), createEntry('/kept.ts', ModifiedFileEntryState.Accepted), createEntry('/new.ts')]);
			const { workingSet } = createWorkingSet(sessionDiffs, true, review);
			const tabs = getTabs(workingSet);
			const states = [describeWorkingSet(workingSet)];
			tabs.session.click();
			states.push(describeWorkingSet(workingSet));

			assert.deepStrictEqual(states, [{
				heading: 'Session changes, 2 files changed, 5 lines added, 1 line removed',
				tabs: ['Session Changes, 2 files changed, 5 lines added, 1 line removed', 'To Review, 2 files to review, 4 lines added, 2 lines removed (selected)'],
				actions: true,
				session: undefined,
				review: ['/reviewed.ts, 2 lines added, 1 line removed [Keep, Undo, Open Changes in Diff Editor]', '/new.ts, 2 lines added, 1 line removed [Keep, Undo, Open Changes in Diff Editor]'],
			}, {
				heading: 'Session changes, 2 files changed, 5 lines added, 1 line removed',
				tabs: ['Session Changes, 2 files changed, 5 lines added, 1 line removed (selected)', 'To Review, 2 files to review, 4 lines added, 2 lines removed'],
				actions: false,
				session: ['/reviewed.ts, 4 lines added, 1 line removed', '/kept.ts, 1 line added, 0 lines removed'],
				review: undefined,
			}]);
		});

		test('switches tabs with the arrow keys', () => {
			const { review } = createReview([createEntry('/reviewed.ts')]);
			const { workingSet } = createWorkingSet(sessionDiffs, true, review);
			const tabs = getTabs(workingSet);
			tabs.review.focus();
			tabs.review.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
			const sessionList = workingSet.domNode.querySelector('.chat-editing-session-list');

			assert.deepStrictEqual({
				selected: tabs.session.getAttribute('aria-selected'),
				focused: dom.getActiveElement() === tabs.session,
				tabIndexes: [tabs.session.tabIndex, tabs.review.tabIndex],
				panel: tabs.session.getAttribute('aria-controls') === sessionList?.id && sessionList?.getAttribute('aria-labelledby') === tabs.session.id,
			}, { selected: 'true', focused: true, tabIndexes: [0, -1], panel: true });
		});

		test('collapses the tabs with the files and keeps Keep and Undo at hand', () => {
			const { review } = createReview([createEntry('/reviewed.ts')]);
			const { workingSet, collapsed } = createWorkingSet(sessionDiffs, true, review);
			getTabs(workingSet).review.focus();
			collapsed.set(true, undefined);

			assert.deepStrictEqual({
				...describeWorkingSet(workingSet),
				focused: dom.getActiveElement() === workingSet.domNode.querySelector('.working-set-title .monaco-button'),
			}, {
				heading: 'Session changes, 2 files changed, 5 lines added, 1 line removed',
				tabs: undefined,
				actions: true,
				session: undefined,
				review: undefined,
				focused: true,
			});
		});

		test('keeps or undoes a file with the actions of the local chat working set', async () => {
			const { review } = createReview([createEntry('/reviewed.ts'), createEntry('/new.ts')]);
			const { workingSet, executed } = createWorkingSet(sessionDiffs, true, review);
			for (const label of workingSet.domNode.querySelectorAll<HTMLElement>('.chat-collapsible-list-action-bar .action-label')) {
				label.click();
			}
			await Promise.resolve();

			assert.deepStrictEqual(executed, [
				'chatEditing.acceptFile file:///reviewed.ts',
				'chatEditing.discardFile file:///reviewed.ts',
				'chatEditing.openFileInDiff file:///reviewed.ts',
				'chatEditing.acceptFile file:///new.ts',
				'chatEditing.discardFile file:///new.ts',
				'chatEditing.openFileInDiff file:///new.ts',
			]);
		});

		test('summarizes the session changes when nothing waits for review', () => {
			const { review: decided } = createReview([createEntry('/kept.ts', ModifiedFileEntryState.Accepted)]);
			const { review: unsupported } = createReview([createEntry('/reviewed.ts')], false);

			assert.deepStrictEqual([decided, unsupported].map(review => describeWorkingSet(createWorkingSet(sessionDiffs, true, review).workingSet)), [decided, unsupported].map(() => ({
				heading: 'Session changes, 2 files changed, 5 lines added, 1 line removed',
				tabs: undefined,
				actions: false,
				session: ['/reviewed.ts, 4 lines added, 1 line removed', '/kept.ts, 1 line added, 0 lines removed'],
				review: undefined,
			})));
		});

		test('returns to the session changes once every change is decided', () => {
			const { review, entries } = createReview([createEntry('/reviewed.ts')]);
			const { workingSet } = createWorkingSet(sessionDiffs, true, review);
			workingSet.domNode.querySelectorAll<HTMLElement>('.monaco-list')[1].focus();
			entries.set([createEntry('/reviewed.ts', ModifiedFileEntryState.Accepted)], undefined);

			assert.deepStrictEqual({
				...describeWorkingSet(workingSet),
				focused: dom.getActiveElement() === workingSet.domNode.querySelector('.working-set-title .monaco-button'),
			}, {
				heading: 'Session changes, 2 files changed, 5 lines added, 1 line removed',
				tabs: undefined,
				actions: false,
				session: ['/reviewed.ts, 4 lines added, 1 line removed', '/kept.ts, 1 line added, 0 lines removed'],
				review: undefined,
				focused: true,
			});
		});

		test('stays on the session changes the user is reading when changes to review arrive', () => {
			const { review, entries } = createReview([]);
			const { workingSet } = createWorkingSet(sessionDiffs, true, review);
			workingSet.domNode.querySelector<HTMLElement>('.monaco-list')!.focus();
			entries.set([createEntry('/reviewed.ts')], undefined);

			assert.deepStrictEqual({
				tabs: describeWorkingSet(workingSet).tabs,
				focused: dom.isAncestorOfActiveElement(workingSet.domNode.querySelector('.chat-editing-session-list')!),
			}, {
				tabs: ['Session Changes, 2 files changed, 5 lines added, 1 line removed (selected)', 'To Review, 1 file to review, 2 lines added, 1 line removed'],
				focused: true,
			});
		});

		test('explains a session without changes yet', () => {
			const { review } = createReview([createEntry('/reviewed.ts')]);
			const { workingSet } = createWorkingSet([], true, review);
			getTabs(workingSet).session.click();
			const empty = workingSet.domNode.querySelector('.working-set-empty');

			assert.deepStrictEqual({
				tabs: describeWorkingSet(workingSet).tabs,
				empty: isShown(empty) ? empty.textContent : undefined,
			}, {
				tabs: ['Session Changes, 0 files changed, 0 lines added, 0 lines removed (selected)', 'To Review, 1 file to review, 2 lines added, 1 line removed'],
				empty: 'No session changes yet.',
			});
		});

		test('opens a file to review in place, when its editor can show the changes', async () => {
			const revealed: string[] = [];
			const withEditorIntegration = (entry: IModifiedFileEntry) => Object.assign(entry, {
				getEditorIntegration: () => new class extends mock<IModifiedFileEntryEditorIntegration>() {
					override reveal() {
						revealed.push(entry.modifiedURI.path);
					}
				}(),
			});
			const { review } = createReview([withEditorIntegration(createEntry('/reviewed.ts')), withEditorIntegration(createEntry('/drawing.svg'))]);
			// Text files open in code editors, others in custom editors.
			const { workingSet, opened } = createWorkingSet(sessionDiffs, true, review, input => new class extends mock<IEditorPane>() {
				override getControl() {
					return isResourceEditorInput(input) && input.resource.path.endsWith('.ts') ? upcastPartial<ICodeEditor>({ getEditorType: () => EditorType.ICodeEditor }) : undefined;
				}
			}());
			for (const row of workingSet.domNode.querySelectorAll('.chat-editing-session-list')[1].querySelectorAll('.monaco-list-row')) {
				row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			}
			await timeout(0);

			assert.deepStrictEqual({
				opened: opened.map(input => isResourceEditorInput(input) ? input.resource.toString() : undefined),
				revealed,
			}, { opened: ['file:///reviewed.ts', 'file:///drawing.svg'], revealed: ['/reviewed.ts'] });
		});
	});
});
