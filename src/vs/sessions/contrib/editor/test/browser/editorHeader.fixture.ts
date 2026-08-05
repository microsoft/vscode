/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/editorBreadcrumbs.css';
import '../../browser/media/editorHeader.css';
import { localize2 } from '../../../../../nls.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { renderEditorTabBarFixture } from '../../../../../workbench/test/browser/componentFixtures/editor/editorTabBar.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { Menus } from '../../../../browser/menus.js';

function renderHeader(ctx: ComponentFixtureContext): void {
	ctx.container.classList.add('agent-sessions-workbench', 'dock-detail-panel');
	ctx.disposableStore.add(MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderPrimary, {
		command: {
			id: 'sessions.fixture.editorHeaderAction',
			title: localize2('sessions.fixture.editorHeaderAction', "Header Action"),
		},
		group: 'navigation',
	}));

	renderEditorTabBarFixture(ctx, {
		modernUI: true,
		breadcrumbs: { filePath: 'on', icons: true },
		showHeader: true,
		headerMenuIds: {
			headerPrimary: Menus.SessionsEditorHeaderPrimary,
			headerSecondary: Menus.SessionsEditorHeaderSecondary,
		},
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/editorHeader/' }, {
	BreadcrumbsAndAction: defineComponentFixture({ render: renderHeader }),
});
