/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/editorBreadcrumbs.css';
import '../../browser/media/editorHeader.css';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { renderEditorTabBarFixture } from '../../../../../workbench/test/browser/componentFixtures/editor/editorTabBar.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';

const primaryMenu = MenuId.for('sessions.fixture.editorHeaderPrimary');
const secondaryMenu = MenuId.for('sessions.fixture.editorHeaderSecondary');
const emptyMenu = MenuId.for('sessions.fixture.editorHeaderEmpty');
const primaryAction = {
	id: 'sessions.fixture.editorHeaderAction',
	title: localize2('sessions.fixture.editorHeaderAction', "Header Action"),
	icon: Codicon.check,
};
const secondaryAction = {
	id: 'sessions.fixture.editorHeaderSecondaryAction',
	title: localize2('sessions.fixture.editorHeaderSecondaryAction', "Collapse All"),
	icon: Codicon.collapseAll,
};
const secondaryOverflowAction = {
	id: 'sessions.fixture.editorHeaderSecondaryOverflowAction',
	title: localize2('sessions.fixture.editorHeaderSecondaryOverflowAction', "Tree View"),
	icon: Codicon.listTree,
};
MenuRegistry.addCommand(primaryAction);
MenuRegistry.addCommand(secondaryAction);
MenuRegistry.addCommand(secondaryOverflowAction);
MenuRegistry.appendMenuItem(primaryMenu, {
	command: primaryAction,
	group: 'navigation',
});
MenuRegistry.appendMenuItem(secondaryMenu, {
	command: secondaryAction,
	group: '1_diff',
});
MenuRegistry.appendMenuItem(secondaryMenu, {
	command: secondaryOverflowAction,
	group: 'secondary/2_viewMode',
});

function renderHeader(ctx: ComponentFixtureContext, breadcrumbs: boolean, primaryAction: boolean, secondaryAction = false): void {
	ctx.container.classList.add('agent-sessions-workbench', 'dock-detail-panel');

	renderEditorTabBarFixture(ctx, {
		modernUI: true,
		breadcrumbs: breadcrumbs ? { filePath: 'on', icons: true } : undefined,
		showHeader: true,
		headerMenuIds: {
			headerPrimary: primaryAction ? primaryMenu : emptyMenu,
			headerSecondary: secondaryAction ? secondaryMenu : emptyMenu,
		},
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/editorHeader/' }, {
	BreadcrumbsAndAction: defineComponentFixture({ render: ctx => renderHeader(ctx, true, true) }),
	BreadcrumbsAndSecondaryAction: defineComponentFixture({ render: ctx => renderHeader(ctx, true, false, true) }),
	BreadcrumbsOnly: defineComponentFixture({ render: ctx => renderHeader(ctx, true, false) }),
	PrimaryActionOnly: defineComponentFixture({ render: ctx => renderHeader(ctx, false, true) }),
	SecondaryActionOnly: defineComponentFixture({ render: ctx => renderHeader(ctx, false, false, true) }),
});
