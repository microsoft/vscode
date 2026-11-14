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
import { SessionsViewId } from '../../browser/views/sessionsView.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

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
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		// A contribution of the window may already have registered these views elsewhere
		const restores: (() => void)[] = [];
		for (const id of [SessionsViewId, AGENTS_VIEW_SETUP_VIEW_ID]) {
			const existing = viewsRegistry.getView(id);
			const existingContainer = viewsRegistry.getViewContainer(id);
			if (existing && existingContainer) {
				viewsRegistry.deregisterViews([existing], existingContainer);
				restores.push(() => viewsRegistry.registerViews([existing], existingContainer));
			}
		}
		store.add(registerEditorWindowSessionsViews(container, observableValue('scoped', false)));
		// Disposed after the registration above
		store.add(toDisposable(() => restores.forEach(restore => restore())));
		const views = viewsRegistry.getViews(container).map(view => ({ id: view.id, when: view.when?.serialize() }));
		assert.deepStrictEqual(views, [
			{ id: SessionsViewId, when: AgentsViewWhen.serialize() },
			{ id: AGENTS_VIEW_SETUP_VIEW_ID, when: ContextKeyExpr.and(AgentsViewAvailable, AgentsViewNeedsSetup)?.serialize() },
		]);
	});

	test('the settings of the sessions list stay registered while any holder of the list still holds it, such as two views that embed it', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: Event.None, isViewVisible: () => false }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: Event.None, isVisible: () => false }));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ when: () => new Promise<void>(() => { }) }));
		// The registrations of the sessions list's settings, beyond those of other suites, such as of the Agents window
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const nodes = () => configurationRegistry.getConfigurations().filter(node => node.id === 'sessionsList').length;
		const initial = nodes();
		const registered = () => nodes() - initial;
		const first = registerEditorWindowSessionsList(instantiationService, () => toDisposable(() => { }));
		const second = registerEditorWindowSessionsList(instantiationService, () => toDisposable(() => { }), 'workbench.panel.chat.view.copilot');
		const whileBoth = registered();
		first.dispose();
		const whileOne = registered();
		second.dispose();

		// Registered once while either holds it
		assert.deepStrictEqual({ whileBoth, whileOne, afterBoth: registered() }, { whileBoth: 1, whileOne: 1, afterBoth: 0 });
	});

	function localize2Value(value: string) {
		return { value, original: value, toString: () => value };
	}
});
