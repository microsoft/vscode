/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { Extensions as ViewExtensions, IViewContainerDescriptor, IViewsRegistry } from '../../../../common/views.js';
import { AGENTS_VIEW_SETUP_VIEW_ID, AgentsViewAvailable, AgentsViewNeedsSetup, AgentsViewWhen } from '../../browser/agentsView/agentsView.js';
import { createEditorWindowSessionsViewOptions, EDITOR_WINDOW_SESSIONS_GROUPINGS, registerEditorWindowSessionsViews } from '../../browser/agentsView/editorWindowSessionsList.js';
import { SessionsViewId } from '../../browser/views/sessionsView.js';

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

	test('registers the Sessions view and the setup view in the container', () => {
		const container = { id: 'test.editorWindowSessionsList', title: localize2Value('Chat'), icon: undefined } as unknown as IViewContainerDescriptor;
		store.add(registerEditorWindowSessionsViews(container, observableValue('scoped', false)));
		const views = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViews(container).map(view => ({ id: view.id, when: view.when?.serialize() }));
		assert.deepStrictEqual(views, [
			{ id: SessionsViewId, when: AgentsViewWhen.serialize() },
			{ id: AGENTS_VIEW_SETUP_VIEW_ID, when: ContextKeyExpr.and(AgentsViewAvailable, AgentsViewNeedsSetup)?.serialize() },
		]);
	});

	function localize2Value(value: string) {
		return { value, original: value, toString: () => value };
	}
});
