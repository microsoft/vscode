/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { IAction } from '../../../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAccessibilitySignalService } from '../../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IMenuService } from '../../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { IUntypedEditorInput, isResourceDiffEditorInput, isResourceEditorInput, isResourceMultiDiffEditorInput } from '../../../../../../common/editor.js';
import { EditorInput } from '../../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatWidget, IChatWidgetService } from '../../../../browser/chat.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { ChatSessionWorkingSet, ChatSessionWorkingSetKeptChanges, IChatSessionWorkingSetUndo } from '../../../../browser/widget/input/chatSessionWorkingSet.js';
import { AgentChatAccessibilityHelp } from '../../../../browser/actions/chatAccessibilityHelp.js';
import '../../../../browser/chatEditing/chatEditingActions.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatModeKind } from '../../../../common/constants.js';
import { emptySessionEntryDiff, IChatEditingService, IChatEditingSession, IEditSessionEntryDiff } from '../../../../common/editing/chatEditingService.js';
import { ChatSessionReviewPreferencesService, IChatSessionReviewPreferencesService } from '../../../../common/editing/chatSessionReviewPreferences.js';
import { IChatModel } from '../../../../common/model/chatModel.js';
import { IChatViewModel } from '../../../../common/model/chatViewModel.js';

suite('ChatSessionWorkingSet', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWorkingSet(initialDiffs: readonly IEditSessionEntryDiff[], openInDiffEditor = true, undo: IObservable<IChatSessionWorkingSetUndo | undefined> = constObservable(undefined), keepEnabled?: IObservable<boolean>, keepResult?: Promise<boolean>) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configurationService = new TestConfigurationService({ [ChatConfiguration.OpenChangedFileInDiffEditor]: openInDiffEditor, [ChatConfiguration.EditorWorkingSetEnabled]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IConfigurationService, 'updateValue', (key: string, value: boolean) => configurationService.setUserConfiguration(key, value));
		const reviewPreferences = store.add(instantiationService.createInstance(ChatSessionReviewPreferencesService));
		instantiationService.stub(IChatSessionReviewPreferencesService, reviewPreferences);
		let menuActions: readonly IAction[] = [];
		let closeMenu = () => { };
		let inputFocusCalls = 0;
		instantiationService.stub(IContextMenuService, {
			showContextMenu: delegate => {
				assert.ok(delegate.getActions);
				menuActions = delegate.getActions();
				closeMenu = () => delegate.onHide?.(false);
			},
		});
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		// Runs the commands of the rows' menu, which the working set's file actions are.
		const executed: { readonly id: string; readonly resource: string | undefined }[] = [];
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async <R>(id: string, ...args: unknown[]) => {
				executed.push({ id, resource: URI.isUri(args[0]) ? args[0].path : undefined });
				return instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)?.handler(accessor, ...args)) as R;
			},
		}));
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
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
			keep: async (keptDiffs, automatic) => {
				if (keepResult) {
					return keepResult;
				}
				kept.push(...keptDiffs.map(diff => automatic ? `${diff.modifiedURI.path} (automatic)` : diff.modifiedURI.path));
				diffs.set(diffs.get().filter(candidate => !keptDiffs.includes(candidate)), undefined);
				return true;
			},
			keepEnabled,
			undo,
		}, () => { inputFocusCalls++; }));
		document.body.appendChild(workingSet.domNode);
		store.add(toDisposable(() => workingSet.domNode.remove()));
		const rows = () => [...workingSet.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')];
		const fileAction = (row: HTMLElement, label: string) => row.querySelector<HTMLElement>(`.action-label[aria-label="${label}"]`)!;
		const headerButtons = () => [...workingSet.domNode.querySelectorAll<HTMLElement>('.chat-editing-session-actions .monaco-button')];
		const headerButton = (label: string) => headerButtons().find(button => button.getAttribute('aria-label') === label)!;
		return { workingSet, diffs, collapsed, opened, instantiationService, configurationService, reviewPreferences, kept, signals, executed, rows, fileAction, headerButtons, headerButton, menuActions: () => menuActions, closeMenu: () => closeMenu(), inputFocusCalls: () => inputFocusCalls };
	}

	const readFileActions = (rows: readonly HTMLElement[]) => rows.map(row => [...row.querySelectorAll('.action-label')]
		.map(action => action.getAttribute('aria-disabled') === 'true' ? `${action.getAttribute('aria-label')} (disabled)` : action.getAttribute('aria-label')));
	const readHeaderButtons = (buttons: readonly HTMLElement[]) => buttons.map(button => button.getAttribute('aria-disabled') === 'true' ? `${button.getAttribute('aria-label')} (disabled)` : button.getAttribute('aria-label'));

	test('the context menu toggles header and file review controls without hiding diffs', async () => {
		const undone: string[] = [];
		const { workingSet, rows, headerButtons, menuActions, kept, signals } = createWorkingSet([
			emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts')),
		], true, constObservable({
			enabled: constObservable(true),
			undo: async diffs => { undone.push(...diffs.map(diff => diff.modifiedURI.path)); return true; },
		}));
		const read = () => ({ header: readHeaderButtons(headerButtons()), rows: readFileActions(rows()) });
		const states = [read()];
		rows()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const menu = menuActions().map(action => ({ label: action.label, checked: action.checked }));
		await menuActions()[0].run();
		await timeout(0);
		states.push(read());
		await workingSet.keepFiles([URI.file('/after.ts')]);
		await workingSet.undoFiles([URI.file('/after.ts')]);
		workingSet.domNode.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const unchecked = menuActions()[0].checked;
		await menuActions()[0].run();
		await timeout(0);
		states.push(read());

		assert.deepStrictEqual({ states, menu, unchecked, kept, undone, signals }, {
			states: [
				{ header: ['Keep All Edits', 'Undo All Edits', 'View All Edits'], rows: [['Keep', 'Undo', 'Open Changes in Diff Editor']] },
				{ header: ['View All Edits'], rows: [['Open Changes in Diff Editor']] },
				{ header: ['Keep All Edits', 'Undo All Edits', 'View All Edits'], rows: [['Keep', 'Undo', 'Open Changes in Diff Editor']] },
			],
			menu: [{ label: 'Keep and Undo', checked: true }, { label: '', checked: undefined }, { label: 'Show Pill', checked: undefined }],
			unchecked: false, kept: [], undone: [], signals: [],
		});
	});

	test('keyboard context menu toggles review and restores focus when an action disappears', async () => {
		const { workingSet, rows, fileAction, menuActions, closeMenu } = createWorkingSet([emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts'))]);
		const keep = fileAction(rows()[0], 'Keep');
		keep.focus();
		const event = new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true });
		keep.dispatchEvent(event);
		await menuActions()[0].run();
		await timeout(0);
		closeMenu();

		assert.deepStrictEqual({ prevented: event.defaultPrevented, enabled: workingSet.keepUndoEnabled, focused: dom.getActiveElement() === workingSet.domNode.querySelector('.monaco-button') }, {
			prevented: true, enabled: false, focused: true,
		});
	});

	test('Show Pill disables the existing Working Set setting without changing the review preference', async () => {
		const { workingSet, configurationService, menuActions, closeMenu, inputFocusCalls } = createWorkingSet([emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts'))]);
		workingSet.domNode.querySelector<HTMLElement>('.monaco-button')!.focus();
		workingSet.domNode.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		const showPill = menuActions().find(action => action.label === 'Show Pill')!;
		closeMenu();
		await showPill.run();
		workingSet.domNode.remove();

		assert.deepStrictEqual({ workingSet: configurationService.getValue(ChatConfiguration.EditorWorkingSetEnabled), review: workingSet.keepUndoEnabled, inputFocusCalls: inputFocusCalls() }, {
			workingSet: false, review: true, inputFocusCalls: 1,
		});
	});

	test('shows session files and counts with Keep and Open Changes in Diff Editor on each file and Keep and View All Edits in the heading', () => {
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
			fileActions: [['Keep', 'Open Changes in Diff Editor'], ['Keep', 'Open Changes in Diff Editor']],
		});
	});

	test('offers Undo in the heading and on each file only while the session supports it, disabled while it cannot run', async () => {
		const undo = observableValue<IChatSessionWorkingSetUndo | undefined>('undo', undefined);
		const enabled = observableValue('enabled', true);
		const { rows, headerButtons } = createWorkingSet([
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
			emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts')),
		], true, undo);
		// The rows show their menu's actions once it reports the change.
		const readState = async () => {
			await timeout(0);
			return { heading: readHeaderButtons(headerButtons()), files: readFileActions(rows()) };
		};
		const states = [await readState()];
		undo.set({ enabled, undo: async () => true }, undefined);
		states.push(await readState());
		enabled.set(false, undefined);
		states.push(await readState());
		undo.set(undefined, undefined);
		states.push(await readState());
		const keepAndOpen = ['Keep', 'Open Changes in Diff Editor'];
		assert.deepStrictEqual(states, [
			{ heading: ['Keep All Edits', 'View All Edits'], files: [keepAndOpen, keepAndOpen] },
			{ heading: ['Keep All Edits', 'Undo All Edits', 'View All Edits'], files: [['Keep', 'Undo', 'Open Changes in Diff Editor'], ['Keep', 'Undo', 'Open Changes in Diff Editor']] },
			{ heading: ['Keep All Edits', 'Undo All Edits (disabled)', 'View All Edits'], files: [['Keep', 'Undo (disabled)', 'Open Changes in Diff Editor'], ['Keep', 'Undo (disabled)', 'Open Changes in Diff Editor']] },
			{ heading: ['Keep All Edits', 'View All Edits'], files: [keepAndOpen, keepAndOpen] },
		]);
	});

	test('disables Keep in the heading and on each file while the session cannot keep changes', async () => {
		const enabled = observableValue('keepEnabled', true);
		const { rows, headerButtons } = createWorkingSet([
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
		], true, constObservable(undefined), enabled);
		const readState = async () => {
			await timeout(0);
			return { heading: readHeaderButtons(headerButtons()), files: readFileActions(rows()) };
		};
		const states = [await readState()];
		enabled.set(false, undefined);
		states.push(await readState());
		enabled.set(true, undefined);
		states.push(await readState());
		assert.deepStrictEqual(states, [
			{ heading: ['Keep All Edits', 'View All Edits'], files: [['Keep', 'Open Changes in Diff Editor']] },
			{ heading: ['Keep All Edits (disabled)', 'View All Edits'], files: [['Keep (disabled)', 'Open Changes in Diff Editor']] },
			{ heading: ['Keep All Edits', 'View All Edits'], files: [['Keep', 'Open Changes in Diff Editor']] },
		]);
	});

	for (const all of [false, true]) {
		for (const success of [false, true]) {
			test(`announces Keep only after it succeeds (all: ${all}, success: ${success})`, async () => {
				const completion = new DeferredPromise<boolean>();
				const { rows, fileAction, headerButton, signals } = createWorkingSet([
					emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
				], true, constObservable(undefined), undefined, completion.p);
				(all ? headerButton('Keep All Edits') : fileAction(rows()[0], 'Keep')).click();
				const pending = [...signals];

				await completion.complete(success);
				await timeout(0);

				assert.deepStrictEqual({ pending, completed: signals }, {
					pending: [],
					completed: success ? ['Edits Kept'] : [],
				});
			});
		}
	}

	test('keeps and undoes single files from their rows with the editing session\'s commands and plays the edit signals', async () => {
		const first = emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts'));
		const second = emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts'));
		const undone: { readonly files: string[]; readonly all: boolean }[] = [];
		const { rows, fileAction, kept, signals, executed } = createWorkingSet([first, second], true, constObservable({
			enabled: constObservable(true),
			// The first file's undo is cancelled.
			undo: async (undoneDiffs, all) => {
				undone.push({ files: undoneDiffs.map(diff => diff.modifiedURI.path), all });
				return undoneDiffs[0] === second;
			},
		}));
		await timeout(0);
		fileAction(rows()[0], 'Undo').click();
		fileAction(rows()[1], 'Undo').click();
		await timeout(0);
		fileAction(rows()[0], 'Keep').click();
		await timeout(0);
		assert.deepStrictEqual({ executed, undone, kept, signals, rows: rows().map(row => row.getAttribute('aria-label')) }, {
			executed: [
				{ id: 'chatEditing.discardFile', resource: '/first.ts' },
				{ id: 'chatEditing.discardFile', resource: '/second.ts' },
				{ id: 'chatEditing.acceptFile', resource: '/first.ts' },
			],
			undone: [{ files: ['/first.ts'], all: false }, { files: ['/second.ts'], all: false }],
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
		const undone: { readonly files: string[]; readonly all: boolean }[] = [];
		const { headerButton, rows, kept, signals, opened } = createWorkingSet([changed('/first.ts'), changed('/second.ts')], true, constObservable({
			enabled: constObservable(true),
			undo: async (undoneDiffs, all) => {
				undone.push({ files: undoneDiffs.map(diff => diff.modifiedURI.path), all });
				return true;
			},
		}));
		headerButton('View All Edits').click();
		headerButton('Undo All Edits').click();
		await timeout(0);
		headerButton('Keep All Edits').click();
		await timeout(0);
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
			undone: [{ files: ['/first.ts', '/second.ts'], all: true }],
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

	test('keeps keyboard focus on a file\'s Undo while the undo runs and the rows show it disabled', async () => {
		const enabled = observableValue('enabled', true);
		const completion = new DeferredPromise<boolean>();
		const { rows, fileAction } = createWorkingSet([
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
		], true, constObservable({
			enabled,
			undo: async () => {
				enabled.set(false, undefined);
				const result = await completion.p;
				enabled.set(true, undefined);
				return result;
			},
		}));
		await timeout(0);
		rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
		fileAction(rows()[0], 'Undo').focus();
		fileAction(rows()[0], 'Undo').click();
		await timeout(0);
		const focusedAction = () => {
			const active = dom.getActiveElement();
			return active?.closest('.monaco-list-row') === rows()[0] ? `${active.getAttribute('aria-label')}${active.getAttribute('aria-disabled') === 'true' ? ' (disabled)' : ''}` : undefined;
		};
		const whileRunning = focusedAction();
		await completion.complete(false);
		await timeout(0);

		assert.deepStrictEqual({ whileRunning, afterwards: focusedAction() }, { whileRunning: 'Undo (disabled)', afterwards: 'Undo' });
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
		test(`opens a file itself, and a deleted file's content before the deletion (response setting: ${openInDiffEditor})`, () => {
			const { workingSet, opened } = createWorkingSet([{
				...emptySessionEntryDiff(URI.parse('snapshot:/before/changed.ts'), URI.file('/changed.ts')),
				modifiedSnapshotURI: URI.parse('snapshot:/after/changed.ts'),
			}, {
				...emptySessionEntryDiff(URI.parse('snapshot:/before/deleted.ts'), URI.file('/deleted.ts')),
				isDeleted: true,
			}], openInDiffEditor);
			for (const row of workingSet.domNode.querySelectorAll('.monaco-list-row')) {
				row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			}

			assert.deepStrictEqual(opened.map(input => isResourceEditorInput(input) ? input.resource.toString() : undefined), ['file:///changed.ts', 'snapshot:/before/deleted.ts']);
		});
	}

	test('opens changes in a diff editor from their rows, with the absent side of additions and deletions empty', async () => {
		const { rows, fileAction, opened } = createWorkingSet([{
			...emptySessionEntryDiff(URI.parse('snapshot:/before/changed.ts'), URI.file('/changed.ts')),
			modifiedSnapshotURI: URI.parse('snapshot:/after/changed.ts'),
		}, {
			...emptySessionEntryDiff(URI.file('/created.ts'), URI.file('/created.ts')),
			modifiedSnapshotURI: URI.parse('snapshot:/created.ts'),
			isCreated: true,
		}, {
			...emptySessionEntryDiff(URI.parse('snapshot:/deleted.ts'), URI.file('/deleted.ts')),
			isDeleted: true,
		}]);
		for (const row of rows()) {
			fileAction(row, 'Open Changes in Diff Editor').click();
		}
		await timeout(0);

		assert.deepStrictEqual(opened.map(input => isResourceDiffEditorInput(input)
			? { original: input.original.resource?.toString(), modified: input.modified.resource?.toString() }
			: isResourceMultiDiffEditorInput(input) ? input.resources?.map(resource => ({
				original: resource.original.resource?.toString(),
				modified: resource.modified.resource?.toString(),
				file: resource.goToFileResource?.toString(),
			})) : undefined), [
			{ original: 'snapshot:/before/changed.ts', modified: 'snapshot:/after/changed.ts' },
			[{ original: undefined, modified: 'snapshot:/created.ts', file: 'file:///created.ts' }],
			[{ original: 'snapshot:/deleted.ts', modified: undefined, file: 'file:///deleted.ts' }],
		]);
	});

	test('runs the editing session\'s working set commands on the selected files of the focused chat\'s session working set', async () => {
		const first = emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts'));
		const second = emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts'));
		const undone: string[][] = [];
		const editingSessionKept: string[] = [];
		const { workingSet, instantiationService, kept, rows } = createWorkingSet([first, second], true, constObservable({
			enabled: constObservable(true),
			undo: async undoneDiffs => {
				undone.push(undoneDiffs.map(diff => diff.modifiedURI.path));
				return true;
			},
		}));
		const sessionResource = URI.parse('agent-host-copilot:/session');
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
				viewModel: upcastPartial<IChatViewModel>({ sessionResource, model: upcastPartial<IChatModel>({ sessionResource }) }),
				input: upcastPartial<ChatInputPart>({ sessionWorkingSet: workingSet }),
			}),
		}));
		instantiationService.stub(IChatEditingService, upcastPartial<IChatEditingService>({
			getEditingSession: () => upcastPartial<IChatEditingSession>({
				accept: async (...uris: URI[]) => { editingSessionKept.push(...uris.map(uri => uri.path)); },
			}),
		}));
		const commandService = instantiationService.get(ICommandService);
		rows()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const selected = workingSet.selectedResources.map(resource => resource.path);

		await commandService.executeCommand('chatEditing.discardFile');
		await commandService.executeCommand('chatEditing.acceptFile', URI.file('/first.ts'));
		// A file the working set doesn't list is left to the editing session, unless a working set's row passed it.
		await commandService.executeCommand('chatEditing.acceptFile', URI.file('/other.ts'));
		await commandService.executeCommand('chatEditing.acceptFile', URI.file('/gone.ts'), workingSet);

		assert.deepStrictEqual({ selected, undone, kept, editingSessionKept }, { selected: ['/second.ts'], undone: [['/second.ts']], kept: ['/first.ts'], editingSessionKept: ['/other.ts'] });
	});

	test('keeps files staged or committed with Git in the session working set of each chat once, even while Keep is disabled', async () => {
		// Keep is disabled while another Keep is in progress, for example; the session decides whether it can keep the staged files.
		const { workingSet, instantiationService, kept } = createWorkingSet([
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
			emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts')),
		], true, constObservable(undefined), constObservable(false));
		const widget = (sessionResource: URI, sessionWorkingSet: ChatSessionWorkingSet | undefined) => upcastPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ sessionResource }),
			input: upcastPartial<ChatInputPart>({ sessionWorkingSet }),
		});
		const session = URI.parse('agent-host-copilot:/session');
		// The session is shown twice, and a local chat has no session working set.
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getAllWidgets: () => [widget(session, workingSet), widget(session, workingSet), widget(URI.parse('vscode-chat-session:/local'), undefined)],
		}));
		instantiationService.stub(IChatEditingService, upcastPartial<IChatEditingService>({ editingSessionsObs: constObservable([]) }));

		await instantiationService.get(ICommandService).executeCommand('_chat.editSessions.accept', [URI.file('/second.ts'), URI.file('/other.ts')]);
		// Keep run as a command isn't automatic, so it does nothing while Keep is disabled.
		await instantiationService.get(ICommandService).executeCommand('chatEditing.acceptFile', URI.file('/first.ts'), workingSet);

		assert.deepStrictEqual(kept, ['/second.ts (automatic)']);
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
