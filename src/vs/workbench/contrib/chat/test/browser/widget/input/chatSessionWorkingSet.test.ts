/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAccessibilitySignalService } from '../../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IUntypedEditorInput, isResourceDiffEditorInput, isResourceMultiDiffEditorInput } from '../../../../../../common/editor.js';
import { EditorInput } from '../../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatSessionWorkingSet, ChatSessionWorkingSetKeptChanges, IChatSessionWorkingSetUndo } from '../../../../browser/widget/input/chatSessionWorkingSet.js';
import { AgentChatAccessibilityHelp } from '../../../../browser/actions/chatAccessibilityHelp.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatModeKind } from '../../../../common/constants.js';
import { emptySessionEntryDiff, IEditSessionEntryDiff } from '../../../../common/editing/chatEditingService.js';

suite('ChatSessionWorkingSet', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWorkingSet(initialDiffs: readonly IEditSessionEntryDiff[], openInDiffEditor = true, undo: IObservable<IChatSessionWorkingSetUndo | undefined> = constObservable(undefined)) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configurationService = new TestConfigurationService({ [ChatConfiguration.OpenChangedFileInDiffEditor]: openInDiffEditor });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		const signals: string[] = [];
		instantiationService.stub(IAccessibilitySignalService, upcastPartial<IAccessibilitySignalService>({
			playSignal: async signal => { signals.push(signal.name); },
		}));
		const opened: (EditorInput | IUntypedEditorInput)[] = [];
		instantiationService.stub(IEditorService, {
			openEditor: async (input: EditorInput | IUntypedEditorInput) => {
				opened.push(input);
				return undefined;
			},
		});
		const diffs = observableValue('sessionDiffs', initialDiffs);
		const collapsed = observableValue('collapsed', false);
		const kept: string[] = [];
		const workingSet = store.add(instantiationService.createInstance(ChatSessionWorkingSet, diffs, collapsed, {
			keep: keptDiffs => {
				kept.push(...keptDiffs.map(diff => diff.modifiedURI.path));
				diffs.set(diffs.get().filter(candidate => !keptDiffs.includes(candidate)), undefined);
			},
			undo,
		}));
		document.body.appendChild(workingSet.domNode);
		store.add(toDisposable(() => workingSet.domNode.remove()));
		const rows = () => [...workingSet.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')];
		const fileAction = (row: HTMLElement, label: string) => row.querySelector<HTMLElement>(`.action-label[aria-label="${label}"]`)!;
		const headerButtons = () => [...workingSet.domNode.querySelectorAll<HTMLElement>('.chat-editing-session-actions .monaco-button')];
		const headerButton = (label: string) => headerButtons().find(button => button.getAttribute('aria-label') === label)!;
		return { workingSet, diffs, collapsed, opened, instantiationService, kept, signals, rows, fileAction, headerButtons, headerButton };
	}

	const readFileActions = (rows: readonly HTMLElement[]) => rows.map(row => [...row.querySelectorAll('.action-label')]
		.map(action => action.getAttribute('aria-disabled') === 'true' ? `${action.getAttribute('aria-label')} (disabled)` : action.getAttribute('aria-label')));
	const readHeaderButtons = (buttons: readonly HTMLElement[]) => buttons.map(button => button.getAttribute('aria-disabled') === 'true' ? `${button.getAttribute('aria-label')} (disabled)` : button.getAttribute('aria-label'));

	test('shows session files and counts with Keep on each file and Keep and View All Edits in the heading', () => {
		const { workingSet, rows, headerButtons } = createWorkingSet([
			{ ...emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/src/first.ts')), added: 15, removed: 2 },
			{ ...emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/src/second.ts')), added: 3, removed: 1 },
		]);
		assert.deepStrictEqual({
			header: workingSet.domNode.querySelector('.monaco-button')?.getAttribute('aria-label'),
			expanded: workingSet.domNode.querySelector('.monaco-button')?.getAttribute('aria-expanded'),
			rows: rows().map(row => row.getAttribute('aria-label')),
			headerButtons: headerButtons().map(button => ({
				label: button.getAttribute('aria-label'),
				text: button.textContent,
				primary: !button.classList.contains('secondary'),
			})),
			fileActions: readFileActions(rows()),
		}, {
			header: 'Session changes, 2 files changed, 18 lines added, 3 lines removed',
			expanded: 'true',
			rows: ['/src/first.ts, 15 lines added, 2 lines removed', '/src/second.ts, 3 lines added, 1 line removed'],
			headerButtons: [
				{ label: 'Keep All Edits', text: 'Keep', primary: true },
				{ label: 'View All Edits', text: '', primary: false },
			],
			fileActions: [['Keep'], ['Keep']],
		});
	});

	test('offers Undo in the heading and on each file only while the session supports it, disabled while it cannot run', () => {
		const undo = observableValue<IChatSessionWorkingSetUndo | undefined>('undo', undefined);
		const enabled = observableValue('enabled', true);
		const { rows, headerButtons } = createWorkingSet([
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
			emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts')),
		], true, undo);
		const readState = () => ({ heading: readHeaderButtons(headerButtons()), files: readFileActions(rows()) });
		const states = [readState()];
		undo.set({ enabled, undo: async () => true }, undefined);
		states.push(readState());
		enabled.set(false, undefined);
		states.push(readState());
		undo.set(undefined, undefined);
		states.push(readState());
		assert.deepStrictEqual(states, [
			{ heading: ['Keep All Edits', 'View All Edits'], files: [['Keep'], ['Keep']] },
			{ heading: ['Keep All Edits', 'Undo All Edits', 'View All Edits'], files: [['Keep', 'Undo'], ['Keep', 'Undo']] },
			{ heading: ['Keep All Edits', 'Undo All Edits (disabled)', 'View All Edits'], files: [['Keep', 'Undo (disabled)'], ['Keep', 'Undo (disabled)']] },
			{ heading: ['Keep All Edits', 'View All Edits'], files: [['Keep'], ['Keep']] },
		]);
	});

	test('keeps and undoes single files from their rows and plays the edit signals', async () => {
		const first = emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts'));
		const second = emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts'));
		const undone: string[][] = [];
		const { rows, fileAction, kept, signals } = createWorkingSet([first, second], true, constObservable({
			enabled: constObservable(true),
			// The first file's undo is cancelled.
			undo: async undoneDiffs => {
				undone.push(undoneDiffs.map(diff => diff.modifiedURI.path));
				return undoneDiffs[0] === second;
			},
		}));
		fileAction(rows()[0], 'Undo').click();
		fileAction(rows()[1], 'Undo').click();
		await timeout(0);
		fileAction(rows()[0], 'Keep').click();
		assert.deepStrictEqual({ undone, kept, signals, rows: rows().map(row => row.getAttribute('aria-label')) }, {
			undone: [['/first.ts'], ['/second.ts']],
			kept: ['/first.ts'],
			signals: ['Undo Edits', 'Edits Kept'],
			rows: ['/second.ts, 0 lines added, 0 lines removed'],
		});
	});

	test('views, undoes, and keeps every listed file from the heading', async () => {
		const changed = (path: string) => ({
			...emptySessionEntryDiff(URI.parse(`snapshot:/before${path}`), URI.file(path)),
			modifiedSnapshotURI: URI.parse(`snapshot:/after${path}`),
		});
		const undone: string[][] = [];
		const { headerButton, rows, kept, signals, opened } = createWorkingSet([changed('/first.ts'), changed('/second.ts')], true, constObservable({
			enabled: constObservable(true),
			undo: async undoneDiffs => {
				undone.push(undoneDiffs.map(diff => diff.modifiedURI.path));
				return true;
			},
		}));
		headerButton('View All Edits').click();
		headerButton('Undo All Edits').click();
		await timeout(0);
		headerButton('Keep All Edits').click();
		assert.deepStrictEqual({
			opened: opened.map(input => isResourceMultiDiffEditorInput(input) ? {
				label: input.label,
				resources: input.resources?.map(resource => `${resource.original.resource} -> ${resource.modified.resource}`),
			} : undefined),
			undone,
			kept,
			signals,
			rows: rows().length,
		}, {
			opened: [{
				label: 'Session Changes',
				resources: ['snapshot:/before/first.ts -> snapshot:/after/first.ts', 'snapshot:/before/second.ts -> snapshot:/after/second.ts'],
			}],
			undone: [['/first.ts', '/second.ts']],
			kept: ['/first.ts', '/second.ts'],
			signals: ['Undo Edits', 'Edits Kept'],
			rows: 0,
		});
	});

	test('moves keyboard focus to the next file when Keep removes the focused file', () => {
		const { workingSet, rows, fileAction, kept } = createWorkingSet([
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
			emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts')),
		]);
		const list = workingSet.domNode.querySelector<HTMLElement>('.monaco-list')!;
		rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const keep = fileAction(rows()[0], 'Keep');
		keep.focus();
		const keepFocused = dom.getActiveElement() === keep;
		keep.click();
		assert.deepStrictEqual({
			keepFocused,
			kept,
			listFocused: dom.getActiveElement() === list,
			focusedFile: list.querySelector('.monaco-list-row.focused')?.getAttribute('aria-label'),
		}, {
			keepFocused: true,
			kept: ['/first.ts'],
			listFocused: true,
			focusedFile: '/second.ts, 0 lines added, 0 lines removed',
		});
	});

	test('keeps keyboard focus on a file\'s Undo when its undo is cancelled', async () => {
		let undoCalls = 0;
		const { rows, fileAction } = createWorkingSet([
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
		], true, constObservable({
			enabled: constObservable(true),
			undo: async () => {
				undoCalls++;
				return false;
			},
		}));
		rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const undo = fileAction(rows()[0], 'Undo');
		undo.focus();
		undo.click();
		await timeout(0);
		assert.deepStrictEqual({ undoCalls, undoFocused: dom.getActiveElement() === undo }, { undoCalls: 1, undoFocused: true });
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

	suite('ChatSessionWorkingSetKeptChanges', () => {
		const session = URI.parse('agent-host-copilot:/session');
		const changed = (path: string, added = 1) => ({
			...emptySessionEntryDiff(URI.parse(`snapshot:/before${path}`), URI.file(path)),
			modifiedSnapshotURI: URI.parse(`snapshot:/after${path}?added=${added}`),
			added,
		});
		const fileNames = (diffs: readonly IEditSessionEntryDiff[]) => diffs.map(diff => basename(diff.modifiedURI));

		test('hides a kept change in its session, in every working set, until the file changes again', () => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const keeping = store.add(instantiationService.createInstance(ChatSessionWorkingSetKeptChanges));
			const observing = store.add(instantiationService.createInstance(ChatSessionWorkingSetKeptChanges));
			const kept = changed('/kept.ts');
			const other = changed('/other.ts');
			const observed: string[][] = [];
			const filtered = derived(reader => fileNames(observing.filter(session, [kept, other], reader)));
			store.add(autorun(reader => { observed.push(filtered.read(reader)); }));
			keeping.keep(session, [kept]);
			assert.deepStrictEqual({
				observed,
				changedAgain: fileNames(observing.filter(session, [changed('/kept.ts', 2), other], undefined)),
				otherSession: fileNames(observing.filter(URI.parse('agent-host-copilot:/other'), [kept, other], undefined)),
				reloaded: fileNames(store.add(instantiationService.createInstance(ChatSessionWorkingSetKeptChanges)).filter(session, [kept, other], undefined)),
			}, {
				observed: [['kept.ts', 'other.ts'], ['other.ts']],
				changedAgain: ['kept.ts', 'other.ts'],
				otherSession: ['kept.ts', 'other.ts'],
				reloaded: ['other.ts'],
			});
		});

		test('forgets the sessions whose changes were kept least recently beyond its limit', () => {
			const keptChanges = store.add(workbenchInstantiationService(undefined, store).createInstance(ChatSessionWorkingSetKeptChanges));
			const kept = changed('/kept.ts');
			const sessions = Array.from({ length: 101 }, (_, index) => URI.parse(`agent-host-copilot:/session-${index}`));
			for (const keptSession of sessions) {
				keptChanges.keep(keptSession, [kept]);
			}
			assert.deepStrictEqual(sessions.slice(0, 2).map(keptSession => fileNames(keptChanges.filter(keptSession, [kept], undefined))), [['kept.ts'], []]);
		});

		test('tells apart files and changes whose paths have the same 32-bit string hash', () => {
			// "Aa" and "BB" have the same 32-bit string hash, so these paths do too.
			const keptChanges = store.add(workbenchInstantiationService(undefined, store).createInstance(ChatSessionWorkingSetKeptChanges));
			const kept = changed('/Aa.ts');
			keptChanges.keep(session, [kept]);
			const changedAgain = {
				...kept,
				originalURI: URI.parse('snapshot:/before/BB.ts'),
				modifiedSnapshotURI: URI.parse('snapshot:/after/BB.ts?added=1'),
			};
			assert.deepStrictEqual({
				otherFile: fileNames(keptChanges.filter(session, [kept, changed('/BB.ts')], undefined)),
				changedAgain: fileNames(keptChanges.filter(session, [changedAgain], undefined)),
			}, {
				otherFile: ['BB.ts'],
				changedAgain: ['Aa.ts'],
			});
		});
	});
});
