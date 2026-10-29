/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { Orientation, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ChangesEmptyState } from '../../browser/changesEmptyState.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { OpenEditorCommandId } from '../../../../../workbench/contrib/searchEditor/browser/constants.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { SessionsChangesAccessibilityHelp } from '../../browser/sessionsChangesAccessibilityHelp.js';
import { ChangesViewPane } from '../../browser/changesView.js';
import '../../browser/media/changesView.css';

suite('Sessions - Changes empty state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('retains the status and offers keyboard-accessible workspace actions', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		const commands: string[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string): Promise<T | undefined> {
				commands.push(id);
				return undefined;
			}
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const container = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		store.add(instantiationService.createInstance(ChangesEmptyState, container));
		const rows = [...container.querySelectorAll<HTMLElement>('.sessions-add-tab-watermark-entry')];
		rows.forEach(row => row.click());
		assert.deepStrictEqual({
			heading: container.querySelector('h2')?.textContent,
			status: container.querySelector('.sessions-empty-state-description')?.textContent,
			actions: rows.map(row => ({ label: row.textContent, role: row.getAttribute('role') })),
			commands,
		}, {
			heading: undefined,
			status: 'No changed files',
			actions: [{ label: 'Open Files', role: 'button' }, { label: 'Search in Files', role: 'button' }],
			commands: [NEW_FILE_TAB_COMMAND_ID, OpenEditorCommandId],
		});
	});

	test('aligns the first Changes action to the main panel action with status text above it', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const group = append(mainWindow.document.body, $('.editor-group-container'));
		group.style.cssText = 'height: 400px; width: 400px; display: flex; flex-direction: column; --vscode-spacing-size160: 16px; --vscode-spacing-size280: 28px;';
		store.add(toDisposable(() => group.remove()));
		const header = append(group, $('div'));
		header.style.flex = '0 0 35px';
		const container = append(group, $('div'));
		container.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center;';
		store.add(instantiationService.createInstance(ChangesEmptyState, container));
		const content = container.firstElementChild;
		assert.ok(content);
		const actions = content.querySelector<HTMLElement>('.changes-empty-state-actions');
		const status = content.querySelector<HTMLElement>('.sessions-empty-state-description');
		assert.ok(actions && status);
		const panelBounds = group.getBoundingClientRect();
		const firstActionTop = actions.getBoundingClientRect().top;
		assert.deepStrictEqual({
			firstActionAligned: Math.abs(firstActionTop - (panelBounds.top + panelBounds.bottom) / 2 + 42) < 1,
			statusAboveActions: status.getBoundingClientRect().bottom < firstActionTop,
			headerUnmoved: header.getBoundingClientRect().top === panelBounds.top,
		}, {
			firstActionAligned: true,
			statusAboveActions: true,
			headerUnmoved: true,
		});
	});

	test('fills the Changes pane when empty, including after files and CI checks disappear', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const container = append(mainWindow.document.body, $('div'));
		container.style.cssText = 'height: 400px; width: 400px; --vscode-spacing-size160: 16px; --vscode-spacing-size240: 24px; --vscode-spacing-size280: 28px;';
		store.add(toDisposable(() => container.remove()));
		const body = append(container, $('.changes-view-body'));
		body.style.padding = '0';
		const splitContainer = append(body, $('.changes-splitview-container'));
		const content = append(splitContainer, $('.chat-editing-session-container'));
		const list = append(content, $('.changes-file-list'));
		list.style.display = 'none';
		const welcome = append(content, $('.changes-welcome'));
		const emptyState = store.add(instantiationService.createInstance(ChangesEmptyState, welcome));
		const view = Object.create(ChangesViewPane.prototype) as { getTreePaneMaximumSize(): number };
		Object.defineProperty(view, 'listContainer', { value: list });
		const sizeChange = store.add(new Emitter<number | undefined>());
		const splitView = store.add(new SplitView(splitContainer, { orientation: Orientation.VERTICAL, proportionalLayout: false }));
		splitView.addView({
			element: content,
			minimumSize: 0,
			get maximumSize() { return view.getTreePaneMaximumSize(); },
			onDidChange: sizeChange.event,
			layout: height => content.style.height = `${height}px`,
		}, Sizing.Distribute);
		const checks = append(splitContainer, $('div'));
		splitView.addView({
			element: checks,
			minimumSize: 100,
			maximumSize: 100,
			onDidChange: Event.None,
			layout: height => checks.style.height = `${height}px`,
		}, 100);
		const actions = welcome.querySelector<HTMLElement>('.changes-empty-state-actions')!;
		const results = [];
		for (const height of [400, 640, 260]) {
			container.style.height = `${height}px`;
			for (const checksVisible of [false, true, false]) {
				splitView.setViewVisible(1, checksVisible);
				for (const hasFiles of [false, true, false]) {
					list.style.display = hasFiles ? '' : 'none';
					welcome.style.display = hasFiles ? 'none' : '';
					sizeChange.fire(undefined);
					splitView.layout(height);
					emptyState.layout();
					const bounds = welcome.getBoundingClientRect();
					results.push({
						height, checksVisible, hasFiles,
						paneHeight: splitView.getViewSize(0),
						aligned: hasFiles || Math.abs(actions.getBoundingClientRect().top - (bounds.top + bounds.bottom) / 2 + 42) < 1,
					});
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result,
			paneHeight: result.hasFiles ? 122 : result.height - (result.checksVisible ? 100 : 0),
			aligned: true,
		})));
	});

	test('documents empty-editor actions and restores focus after accessibility help', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() { }());
		const container = append(mainWindow.document.body, $('.session-changes-editor'));
		store.add(toDisposable(() => container.remove()));
		const action = append(container, $('button', undefined, 'Open Files'));
		action.focus();
		const provider = store.add(new SessionsChangesAccessibilityHelp().getProvider(instantiationService));
		const content = provider.provideContent();
		append(container, $('button', undefined, 'Other')).focus();
		provider.onClose();
		assert.deepStrictEqual({
			editorOverview: content.includes('You are in the Changes editor.'),
			emptyActions: content.includes('Open Files and Search in Files'),
			treeInstructions: content.includes('collapse or expand folders'),
			focusRestored: mainWindow.document.activeElement === action,
		}, {
			editorOverview: true,
			emptyActions: true,
			treeInstructions: false,
			focusRestored: true,
		});
	});
});
