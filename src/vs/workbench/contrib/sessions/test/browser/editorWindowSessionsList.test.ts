/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { createEditorWindowSessionsScope, createEditorWindowSessionsViewOptions, EDITOR_WINDOW_SESSIONS_GROUPINGS, EditorWindowSessionsList } from '../../browser/agentsView/editorWindowSessionsList.js';
import { EditorWindowSessionsContext, SessionsView, SessionsViewId } from '../../browser/views/sessionsView.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SessionsGrouping } from '../../browser/views/sessionsListCommon.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
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

	test('the providers list only the sessions of the window\'s folders in a folder window, and every session in a plain empty window and in the Agents window', () => {
		const scoped = (folders: readonly URI[], scope: URI | undefined) => {
			const owner = {};
			return createEditorWindowSessionsScope(owner, upcastPartial<IWorkspaceContextService>({
				onDidChangeWorkspaceFolders: Event.None,
				onDidChangeWorkbenchScope: Event.None,
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
		const options = createEditorWindowSessionsViewOptions({ id: SessionsViewId } as IViewletViewOptions, scoped);
		assert.deepStrictEqual({
			headerInTitle: options.headerInTitle,
			showCustomizations: options.showCustomizations,
			scoped: options.scoped === scoped,
			groupings: options.groupings,
			quickChatsInTimeGrouping: options.quickChatsInTimeGrouping,
		}, {
			headerInTitle: true,
			showCustomizations: false,
			scoped: true,
			groupings: EDITOR_WINDOW_SESSIONS_GROUPINGS,
			quickChatsInTimeGrouping: true,
		});
	});

	test('only the header presentation differs between title and section', () => {
		const scoped = observableValue('scoped', true);
		const title = createEditorWindowSessionsViewOptions({ id: SessionsViewId } as IViewletViewOptions, scoped, 'title');
		const section = createEditorWindowSessionsViewOptions({ id: SessionsViewId } as IViewletViewOptions, scoped, 'section');
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
		const before = registered();
		const settings = registerSessionsListConfiguration();
		const held = registered();
		settings.dispose();

		assert.deepStrictEqual({ before, held, after: registered() }, { before: [undefined, undefined], held: ['auto', 'auto'], after: [undefined, undefined] });
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
