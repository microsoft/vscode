/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { WorkspaceFolderCountContext } from '../../../../../workbench/common/contextkeys.js';
import { Extensions, IViewContainersRegistry, IViewsRegistry } from '../../../../../workbench/common/views.js';
import { IsPhoneLayoutContext, IsQuickChatSessionContext, SessionHasWorkspaceContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { RegisterFilesViewContribution, SESSIONS_FILES_CONTAINER_ID } from '../../browser/files.contribution.js';
import { SESSIONS_FILES_EMPTY_VIEW_ID, SESSIONS_FILES_VIEW_ID } from '../../browser/filesView.js';

suite('Sessions Files view availability', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows only the empty Files view for No workspace, including while previous folders are mounted', () => {
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(SESSIONS_FILES_CONTAINER_ID)!;
		new RegisterFilesViewContribution();
		const views = viewsRegistry.getViews(container);
		store.add(toDisposable(() => viewsRegistry.deregisterViews(views, container)));
		const context = store.add(new MockContextKeyService());
		const singlePane = SinglePaneLayoutEnabledContext.bindTo(context);
		const quickChat = IsQuickChatSessionContext.bindTo(context);
		const hasWorkspace = SessionHasWorkspaceContext.bindTo(context);
		const folders = WorkspaceFolderCountContext.bindTo(context);
		const phone = IsPhoneLayoutContext.bindTo(context);

		const cases = [
			{ singlePane: true, quickChat: true, hasWorkspace: false, folders: 0, phone: false },
			{ singlePane: true, quickChat: true, hasWorkspace: false, folders: 1, phone: false },
			{ singlePane: true, quickChat: false, hasWorkspace: true, folders: 1, phone: false },
			{ singlePane: true, quickChat: false, hasWorkspace: true, folders: 0, phone: false },
			{ singlePane: false, quickChat: true, hasWorkspace: false, folders: 0, phone: false },
			{ singlePane: true, quickChat: true, hasWorkspace: false, folders: 0, phone: true },
		];
		const visibleViews = cases.map(testCase => {
			singlePane.set(testCase.singlePane);
			quickChat.set(testCase.quickChat);
			hasWorkspace.set(testCase.hasWorkspace);
			folders.set(testCase.folders);
			phone.set(testCase.phone);
			return views.filter(view => !view.when || view.when.evaluate({
				getValue: key => context.getContextKeyValue(key),
			})).map(view => view.id);
		});

		assert.deepStrictEqual(visibleViews, [
			[SESSIONS_FILES_EMPTY_VIEW_ID],
			[SESSIONS_FILES_EMPTY_VIEW_ID],
			[SESSIONS_FILES_VIEW_ID],
			[SESSIONS_FILES_EMPTY_VIEW_ID],
			[],
			[],
		]);
	});
});
