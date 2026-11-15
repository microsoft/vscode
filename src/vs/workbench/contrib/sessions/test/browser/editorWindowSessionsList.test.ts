/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { Extensions as ViewExtensions, IViewContainerDescriptor, IViewsRegistry } from '../../../../common/views.js';
import { AGENTS_VIEW_SETUP_VIEW_ID, AgentsViewAvailable, AgentsViewNeedsSetup, AgentsViewWhen } from '../../browser/agentsView/agentsView.js';
import { createEditorWindowSessionsViewOptions, EDITOR_WINDOW_SESSIONS_GROUPINGS, registerEditorWindowSessionsList, registerEditorWindowSessionsViews } from '../../browser/agentsView/editorWindowSessionsList.js';
import { EditorWindowSessionsContext, SessionsView, SessionsViewId } from '../../browser/views/sessionsView.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SessionsGrouping } from '../../browser/views/sessionsList.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { registerSessionsListAccessibilityHelp, registerSessionsListActions } from '../../browser/views/sessionsListActions.js';
import { registerSessionsListConfiguration, sessionsListConfigurationProperties } from '../../browser/sessionsConfiguration.js';

suite('EditorWindowSessionsList', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('registers the Sessions view and the setup view in the container', () => {
		const container = { id: 'test.editorWindowSessionsList', title: localize2Value('Chat'), icon: undefined } as unknown as IViewContainerDescriptor;
		const registry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		// Another suite may have registered the Agents window's own Sessions view, as ids are registered once
		const existing = registry.getView(SessionsViewId);
		const existingContainer = registry.getViewContainer(SessionsViewId);
		if (existing && existingContainer) {
			registry.deregisterViews([existing], existingContainer);
		}
		store.add(registerEditorWindowSessionsViews(container, observableValue('scoped', false)));
		if (existing && existingContainer) {
			store.add(toDisposable(() => registry.registerViews([existing], existingContainer)));
		}
		const views = registry.getViews(container).map(view => ({ id: view.id, when: view.when?.serialize() }));
		assert.deepStrictEqual(views, [
			{ id: SessionsViewId, when: AgentsViewWhen.serialize() },
			{ id: AGENTS_VIEW_SETUP_VIEW_ID, when: ContextKeyExpr.and(AgentsViewAvailable, AgentsViewNeedsSetup)?.serialize() },
		]);
	});

	test('the holders of the sessions lists of a window share its settings, its context key and its actions, which stay until the last one goes; each registers its own actions as its view first shows', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const contextKeyService = store.add(new MockContextKeyService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const visibility = store.add(new Emitter<{ id: string; visible: boolean }>());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: visibility.event, isViewVisible: () => false }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: Event.None, isVisible: () => false }));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ when: () => new Promise<void>(() => { }) }));
		// The registrations of the sessions list's settings, beyond those of other suites, such as of the Agents window. Its actions
		// register once too: a second registration of the archive contribution would throw on its command ids.
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const settings = () => configurationRegistry.getConfigurations().filter(node => node.id === 'sessionsList').length;
		const initial = settings();
		const more: string[] = [];
		const state = () => ({ settings: settings() - initial, contextKey: contextKeyService.getContextKeyValue(EditorWindowSessionsContext.key) ?? false });

		const agentsView = registerEditorWindowSessionsList(instantiationService, () => { more.push('agents view'); return toDisposable(() => { }); });
		const chatView = registerEditorWindowSessionsList(instantiationService, () => { more.push('chat view'); return toDisposable(() => { }); }, 'workbench.panel.chat.view.copilot');
		// Both views show
		visibility.fire({ id: SessionsViewId, visible: true });
		visibility.fire({ id: 'workbench.panel.chat.view.copilot', visible: true });
		const whileBoth = state();
		agentsView.dispose();
		const whileOne = state();
		chatView.dispose();

		assert.deepStrictEqual({ whileBoth, whileOne, afterBoth: state(), more }, {
			whileBoth: { settings: 1, contextKey: true },
			whileOne: { settings: 1, contextKey: true },
			afterBoth: { settings: 0, contextKey: false },
			more: ['agents view', 'chat view'],
		});
	});

	function localize2Value(value: string) {
		return { value, original: value, toString: () => value };
	}

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
