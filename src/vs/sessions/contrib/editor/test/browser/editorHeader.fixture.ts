/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/editorBreadcrumbs.css';
import '../../browser/media/editorHeader.css';
import '../../../../browser/parts/media/editorPart.css';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { renderEditorTabBarFixture } from '../../../../../workbench/test/browser/componentFixtures/editor/editorTabBar.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';

const primaryMenu = MenuId.for('sessions.fixture.editorHeaderPrimary');
const secondaryMenu = MenuId.for('sessions.fixture.editorHeaderSecondary');
const layoutMenu = MenuId.for('sessions.fixture.editorHeaderLayout');
const addTabMenu = MenuId.for('sessions.fixture.editorHeaderAddTab');
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
const hideEditorAction = {
	id: 'sessions.fixture.editorHeaderHideEditorAction',
	title: localize2('sessions.fixture.editorHeaderHideEditorAction', "Hide Editor"),
	icon: Codicon.chevronRight,
};
const toggleDetailsAction = {
	id: 'sessions.fixture.editorHeaderToggleDetailsAction',
	title: localize2('sessions.fixture.editorHeaderToggleDetailsAction', "Toggle Details"),
	icon: Codicon.layoutSidebarRight,
};
const addFileTabAction = {
	id: 'sessions.fixture.editorHeaderAddFileTabAction',
	title: localize2('sessions.fixture.editorHeaderAddFileTabAction', "Files"),
	icon: Codicon.newFile,
};
MenuRegistry.addCommand(primaryAction);
MenuRegistry.addCommand(secondaryAction);
MenuRegistry.addCommand(secondaryOverflowAction);
MenuRegistry.addCommand(hideEditorAction);
MenuRegistry.addCommand(toggleDetailsAction);
MenuRegistry.addCommand(addFileTabAction);
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
MenuRegistry.appendMenuItem(layoutMenu, {
	command: toggleDetailsAction,
	group: 'navigation',
	order: 10,
});
MenuRegistry.appendMenuItem(layoutMenu, {
	command: hideEditorAction,
	group: 'navigation',
	order: 20,
});
MenuRegistry.appendMenuItem(addTabMenu, {
	command: addFileTabAction,
	group: 'navigation',
});

function renderHeader(ctx: ComponentFixtureContext, breadcrumbs: boolean, primaryAction: boolean, secondaryAction = false, layoutActions = false, showTabs: 'multiple' | 'single' | 'none' = 'multiple', addTab = false): void {
	ctx.container.classList.add('agent-sessions-workbench', 'dock-detail-panel');

	renderEditorTabBarFixture(ctx, {
		modernUI: true,
		partOptions: { showTabs },
		breadcrumbs: breadcrumbs ? { filePath: 'on', icons: true } : undefined,
		showHeader: true,
		headerMenuIds: {
			headerPrimary: primaryAction ? primaryMenu : emptyMenu,
			headerSecondary: secondaryAction ? secondaryMenu : emptyMenu,
			headerLayout: layoutActions ? layoutMenu : emptyMenu,
			tabsBarAddTab: addTab ? addTabMenu : undefined,
		},
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/editorHeader/' }, {
	FullHeader: defineComponentFixture({ render: ctx => renderHeader(ctx, true, true, true, true) }),
	BreadcrumbsAndAction: defineComponentFixture({ render: ctx => renderHeader(ctx, true, true) }),
	BreadcrumbsAndSecondaryAction: defineComponentFixture({ render: ctx => renderHeader(ctx, true, false, true) }),
	BreadcrumbsOnly: defineComponentFixture({ render: ctx => renderHeader(ctx, true, false) }),
	PrimaryActionOnly: defineComponentFixture({ render: ctx => renderHeader(ctx, false, true) }),
	SecondaryActionOnly: defineComponentFixture({ render: ctx => renderHeader(ctx, false, false, true) }),
	LayoutActionsOnly: defineComponentFixture({ render: ctx => renderHeader(ctx, false, false, false, true) }),
	SingleTabFullHeader: defineComponentFixture({ render: ctx => renderHeader(ctx, true, true, true, true, 'single', true) }),
});
