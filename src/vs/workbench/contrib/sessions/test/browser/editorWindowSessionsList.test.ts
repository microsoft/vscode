/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { ALL_SESSIONS_GROUPINGS, createEditorWindowSessionsGroupings, createEditorWindowSessionsScope, createEditorWindowSessionsViewOptions, EDITOR_WINDOW_SESSIONS_GROUPINGS, EditorWindowSessionsList } from '../../browser/agentsView/editorWindowSessionsList.js';
import { EditorWindowSessionsContext, SessionsView, SessionsViewId } from '../../browser/views/sessionsView.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SessionsGrouping } from '../../browser/views/sessionsListCommon.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkbenchMode } from '../../../../../platform/workspace/common/workspace.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { registerSessionsListAccessibilityHelp, registerSessionsListActions } from '../../browser/views/sessionsListActions.js';
import { registerSessionsListConfiguration, sessionsListConfigurationProperties } from '../../browser/sessionsConfiguration.js';
import { NEW_SESSION_WELCOME_GRAPHIC_SETTING, WORKSPACE_OPT_OUT_SETTING } from '../../common/chatConstants.js';

suite('EditorWindowSessionsList', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWindow() {
		const onDidChangeWorkbenchScope = store.add(new Emitter<URI | undefined>());
		const onDidChangeWorkbenchMode = store.add(new Emitter<WorkbenchMode>());
		let scope: URI | undefined = URI.file('/work/vscode');
		let mode = WorkbenchMode.Editor;
		return {
			onDidChangeWorkbenchScope: onDidChangeWorkbenchScope.event,
			getWorkbenchScope: () => scope,
			setScope: (value: URI | undefined) => { scope = value; onDidChangeWorkbenchScope.fire(value); },
			onDidChangeWorkbenchMode: onDidChangeWorkbenchMode.event,
			getWorkbenchMode: () => mode,
			setMode: (value: WorkbenchMode) => { mode = value; onDidChangeWorkbenchMode.fire(value); },
		};
	}

	test('the providers list only the sessions of the window\'s folders in a folder window, and every session in a plain empty window and in the Agents window', () => {
		const scoped = (folders: readonly URI[], scope: URI | undefined) => {
			const owner = {};
			return createEditorWindowSessionsScope(owner, upcastPartial<IWorkspaceContextService>({
				onDidChangeWorkspaceFolders: Event.None,
				onDidChangeWorkbenchScope: Event.None,
				onDidChangeWorkbenchMode: Event.None,
				getWorkbenchMode: () => WorkbenchMode.Editor,
				getWorkbenchScope: () => scope,
				getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
			})).get();
		};
		const folder = URI.file('/work/vscode');
		assert.deepStrictEqual({
			folderWindow: scoped([folder], folder),
			emptyWindow: scoped([], undefined),
			agentsWindow: scoped([folder], undefined),
		}, { folderWindow: true, emptyWindow: false, agentsWindow: false });
	});

	test('every editor window view gets the same options', () => {
		const scoped = observableValue('scoped', true);
		const groupings = observableValue('groupings', EDITOR_WINDOW_SESSIONS_GROUPINGS);
		const options = createEditorWindowSessionsViewOptions({ id: SessionsViewId } as IViewletViewOptions, scoped, groupings);
		assert.deepStrictEqual({
			headerInTitle: options.headerInTitle,
			showCustomizations: options.showCustomizations,
			scoped: options.scoped === scoped,
			groupings: options.groupings === groupings,
			quickChatsInTimeGrouping: options.quickChatsInTimeGrouping,
		}, {
			headerInTitle: true,
			showCustomizations: false,
			scoped: true,
			groupings: true,
			quickChatsInTimeGrouping: true,
		});
	});

	test('the editor window groups by time or environment, and in the Agents mode (Agentic Mode) also by workspace, following the mode', () => {
		const window = createWindow();
		const groupings = createEditorWindowSessionsGroupings({}, upcastPartial<IWorkspaceContextService>(window));
		const seen: string[][] = [];
		store.add(autorun(reader => { seen.push([...groupings.read(reader).offered]); }));
		// Without a scope, as a plain empty window, it still groups as an editor window
		window.setScope(undefined);
		window.setMode(WorkbenchMode.Agents);
		window.setMode(WorkbenchMode.Editor);

		assert.deepStrictEqual({ seen, all: ALL_SESSIONS_GROUPINGS }, {
			seen: [
				[SessionsGrouping.Date, SessionsGrouping.Environment],
				[SessionsGrouping.Date, SessionsGrouping.Environment, SessionsGrouping.Workspace],
				[SessionsGrouping.Date, SessionsGrouping.Environment],
			],
			all: { offered: [SessionsGrouping.Date, SessionsGrouping.Environment, SessionsGrouping.Workspace], default: SessionsGrouping.Workspace },
		});
	});

	test('the editor window list is scoped to its folders, but not while it is about all sessions or in the Agents mode, following folders, scope and mode', () => {
		const folders: URI[] = [];
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const window = createWindow();
		const workspace = upcastPartial<IWorkspaceContextService>({
			...window,
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
		});
		const scoped = createEditorWindowSessionsScope({}, workspace);
		const seen: boolean[] = [];
		store.add(autorun(reader => { seen.push(scoped.read(reader)); }));

		folders.push(URI.file('/work/vscode'));
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		window.setScope(undefined);
		window.setScope(URI.file('/work/vscode'));
		window.setMode(WorkbenchMode.Agents);
		window.setMode(WorkbenchMode.Editor);

		// Empty, a folder added, about all sessions, back to its folders, the Agents mode (whose scope bar filters the list instead), the editor mode
		assert.deepStrictEqual(seen, [false, true, false, true, false, true]);
	});

	test('only the header presentation differs between title and section', () => {
		const scoped = observableValue('scoped', true);
		const groupings = observableValue('groupings', EDITOR_WINDOW_SESSIONS_GROUPINGS);
		const title = createEditorWindowSessionsViewOptions({ id: SessionsViewId } as IViewletViewOptions, scoped, groupings, 'title');
		const section = createEditorWindowSessionsViewOptions({ id: SessionsViewId } as IViewletViewOptions, scoped, groupings, 'section');
		assert.deepStrictEqual({ ...section, headerInTitle: true }, title);
		assert.deepStrictEqual([title.headerInTitle, section.headerInTitle], [true, false]);
	});

	test('the sessions list marks the window and registers its settings, and its actions and the caller\'s as its view first shows, until it is disposed', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const contextKeyService = store.add(new MockContextKeyService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const visibility = store.add(new Emitter<{ id: string; visible: boolean }>());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: visibility.event, isViewVisible: () => false }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: Event.None, isVisible: () => false }));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ when: () => new Promise<void>(() => { }) }));
		// The registrations of the sessions list's settings, beyond those of other suites, such as of the Agents window
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const settings = () => configurationRegistry.getConfigurations().filter(node => node.id === 'sessionsList').length;
		const initial = settings();
		const events: string[] = [];
		const state = () => ({ settings: settings() - initial, contextKey: contextKeyService.getContextKeyValue(EditorWindowSessionsContext.key) ?? false, events: [...events] });

		const list = store.add(instantiationService.createInstance(EditorWindowSessionsList, () => { events.push('registered'); return toDisposable(() => events.push('unregistered')); }, 'workbench.panel.chat.view.copilot'));
		const beforeShown = state();
		// Another view showing does not register them; the view of the list does, once
		visibility.fire({ id: SessionsViewId, visible: true });
		visibility.fire({ id: 'workbench.panel.chat.view.copilot', visible: true });
		visibility.fire({ id: 'workbench.panel.chat.view.copilot', visible: true });
		const shown = state();
		list.dispose();

		assert.deepStrictEqual({ beforeShown, shown, disposed: state() }, {
			beforeShown: { settings: 1, contextKey: true, events: [] },
			shown: { settings: 1, contextKey: true, events: ['registered'] },
			disposed: { settings: 0, contextKey: false, events: ['registered', 'unregistered'] },
		});
	});

	test('the accessibility help of the sessions list\'s Undo notice registers once while any holder holds it, also the list\'s actions, and goes with the last', () => {
		const helps = () => AccessibleViewRegistry.getImplementations().filter(help => help.name === 'sessions-list-notification').length;
		// The Agents window's list, which other tests load, may hold it for good
		const before = helps();
		const first = registerSessionsListAccessibilityHelp();
		const actions = registerSessionsListActions();
		const second = registerSessionsListAccessibilityHelp();
		const held = helps();
		first.dispose();
		first.dispose();
		second.dispose();
		const heldByActions = helps();
		actions.dispose();

		assert.deepStrictEqual({ held, heldByActions, afterDispose: helps() }, { held: 1, heldByActions: 1, afterDispose: before });
	});

	test('registering the settings of the sessions list keeps the shared properties whole when another node registers some of them already, such as the Agents window', () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const key = Object.keys(sessionsListConfigurationProperties)[0];
		const owner = configurationRegistry.getConfigurationProperties()[key] ? undefined : { id: 'agentsWindowSessionsList', properties: { [key]: sessionsListConfigurationProperties[key as keyof typeof sessionsListConfigurationProperties] } };
		if (owner) {
			configurationRegistry.registerConfiguration(owner);
		}
		const settings = registerSessionsListConfiguration();
		const kept = Object.hasOwn(sessionsListConfigurationProperties, key);
		settings.dispose();
		if (owner) {
			configurationRegistry.deregisterConfigurations([owner]);
		}

		assert.strictEqual(kept, true);
	});

	test('registering the settings of the sessions list registers those of the New Session composer for an editor window, while held', () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const registered = () => [WORKSPACE_OPT_OUT_SETTING, NEW_SESSION_WELCOME_GRAPHIC_SETTING].map(key => configurationRegistry.getConfigurationProperties()[key]?.experiment?.mode);
		// The Agents window's New Session composer, which other tests load, may hold them for good
		const before = registered();
		const settings = registerSessionsListConfiguration();
		const held = registered();
		settings.dispose();

		assert.deepStrictEqual({ held, after: registered() }, { held: ['auto', 'auto'], after: before });
	});

	test('with its header in the view title, the Sessions view shows only the find widget in its header row while Find is open, at the row\'s full width', () => {
		const update = Reflect.get(SessionsView.prototype, 'updateHeaderLayout') as (this: object) => void;
		const header = { row: mainWindow.document.createElement('div'), label: mainWindow.document.createElement('div'), actions: mainWindow.document.createElement('div'), toolbar: undefined };
		const host = { sessionsHeaders: new Set([header]), headerInTitle: true, isFindWidgetOpen: true, grouping: SessionsGrouping.Workspace };
		const display = () => ({ row: header.row.style.display, label: header.label.style.display, actions: header.actions.style.display });
		update.call(host);
		const findOpen = display();
		host.isFindWidgetOpen = false;
		update.call(host);

		assert.deepStrictEqual({ findOpen, findClosed: display() }, {
			findOpen: { row: '', label: 'none', actions: 'none' },
			findClosed: { row: 'none', label: '', actions: '' },
		});
	});
});
