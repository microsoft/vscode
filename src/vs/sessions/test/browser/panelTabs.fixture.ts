/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../base/browser/dom.js';
import { Action } from '../../../base/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { mock } from '../../../base/test/common/mock.js';
import { ActionBar, ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../base/browser/ui/hover/hoverWidget.js';
import { IColorTheme } from '../../../platform/theme/common/themeService.js';
import { NumberBadge } from '../../../workbench/services/activity/common/activity.js';
import { ICompositeDragAndDrop } from '../../../workbench/browser/dnd.js';
import { CompositeActionViewItem, CompositeBarAction, ICompositeBar, ICompositeBarColors } from '../../../workbench/browser/parts/compositeBarActions.js';
import { PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_DRAG_AND_DROP_BORDER, PANEL_INACTIVE_TITLE_FOREGROUND } from '../../../workbench/common/theme.js';
import { agentsBadgeBackground, agentsBadgeForeground, agentsPanelBackground } from '../../common/theme.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';

import '../../../workbench/browser/media/part.css';
import '../../../workbench/browser/parts/media/paneCompositePart.css';
import '../../../workbench/browser/parts/panel/media/panelpart.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/media/padding.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/media/fontRamp.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/media/tabs.css';
import '../../browser/parts/media/panelPart.css';

type PanelTabPresentation = 'pill' | 'connected';
type PanelTabDensity = 'default' | 'compact';

interface IPanelTabsFixtureOptions {
	readonly presentation: PanelTabPresentation;
	readonly density: PanelTabDensity;
	readonly showLabels: boolean;
}

const fixtureCompositeBar = new class extends mock<ICompositeBar>() {
	override areBadgesEnabled(): boolean {
		return true;
	}

	override isPinned(): boolean {
		return true;
	}

	override getPinnedCompositeIds(): string[] {
		return ['terminal', 'problems'];
	}
}();

const fixtureDragAndDrop = new class extends mock<ICompositeDragAndDrop>() { }();

function renderPanelTabs(context: ComponentFixtureContext, options: IPanelTabsFixtureOptions): void {
	const { container, disposableStore, theme } = context;
	container.style.width = '560px';
	container.style.height = '144px';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registerWorkbenchServices,
	});
	const root = append(container, $('.monaco-workbench.agent-sessions-workbench.modern-ui-tabs'));
	root.classList.add(...theme.classNames);
	root.classList.toggle('modern-ui-connected-editor-tabs', options.presentation === 'connected');
	root.classList.toggle('modern-ui-compact', options.density === 'compact');
	root.style.width = '528px';
	root.style.height = '112px';
	root.style.margin = '16px';

	const panel = append(root, $('.part.panel.basepanel.bottom.pane-composite-part'));
	panel.classList.toggle('panel-labels', options.showLabels);
	panel.style.width = '100%';
	panel.style.height = '100%';
	panel.style.backgroundColor = 'var(--vscode-agentsPanel-background)';
	panel.style.setProperty('--part-border-color', 'var(--vscode-agentsBottomPanel-border, var(--vscode-agentsPanel-border))');

	const title = append(panel, $('.composite.title.has-composite-bar'));
	title.style.height = options.showLabels ? options.density === 'compact' ? '28px' : '32px' : '35px';

	const compositeBarContainer = append(title, $('.composite-bar-container'));
	const compositeBar = append(compositeBarContainer, $('.composite-bar'));
	const colors = (colorTheme: IColorTheme): ICompositeBarColors => ({
		activeBackgroundColor: colorTheme.getColor(agentsPanelBackground),
		inactiveBackgroundColor: colorTheme.getColor(agentsPanelBackground),
		activeBorderBottomColor: colorTheme.getColor(PANEL_ACTIVE_TITLE_BORDER),
		activeForegroundColor: colorTheme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
		inactiveForegroundColor: colorTheme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
		badgeBackground: colorTheme.getColor(agentsBadgeBackground),
		badgeForeground: colorTheme.getColor(agentsBadgeForeground),
		dragAndDropBorder: colorTheme.getColor(PANEL_DRAG_AND_DROP_BORDER),
	});

	const terminalAction = disposableStore.add(new CompositeBarAction({
		id: 'terminal',
		name: 'Terminal',
		classNames: options.showLabels ? undefined : ThemeIcon.asClassNameArray(Codicon.terminal),
	}));
	terminalAction.activate();
	terminalAction.activities = [{ badge: new NumberBadge(1, count => `${count} active terminal`) }];

	const problemsAction = disposableStore.add(new CompositeBarAction({
		id: 'problems',
		name: 'Problems',
		classNames: options.showLabels ? undefined : ThemeIcon.asClassNameArray(Codicon.warning),
	}));

	const togglePinnedAction = disposableStore.add(new Action('fixture.togglePinned', 'Toggle Pinned'));
	const toggleBadgeAction = disposableStore.add(new Action('fixture.toggleBadge', 'Toggle Badge'));
	const tabBar = disposableStore.add(new ActionBar(compositeBar, {
		orientation: ActionsOrientation.HORIZONTAL,
		ariaLabel: 'Panel Tabs',
		ariaRole: 'tablist',
		actionViewItemProvider: action => {
			if (!(action instanceof CompositeBarAction)) {
				return undefined;
			}

			return instantiationService.createInstance(
				CompositeActionViewItem,
				{
					icon: !options.showLabels,
					compact: true,
					colors,
					hoverOptions: { position: () => HoverPosition.ABOVE },
					isTabList: true,
				},
				action,
				togglePinnedAction,
				toggleBadgeAction,
				() => [],
				() => [],
				fixtureDragAndDrop,
				fixtureCompositeBar,
			);
		},
	}));
	tabBar.push([terminalAction, problemsAction]);

	const titleActions = append(title, $('.title-actions'));
	const titleActionBar = disposableStore.add(new ActionBar(titleActions, {
		orientation: ActionsOrientation.HORIZONTAL,
		ariaLabel: 'Panel Actions',
	}));
	titleActionBar.push([
		disposableStore.add(new Action('fixture.newTerminal', 'New Terminal', ThemeIcon.asClassName(Codicon.add))),
		disposableStore.add(new Action('fixture.splitTerminal', 'Split Terminal', ThemeIcon.asClassName(Codicon.splitHorizontal))),
		disposableStore.add(new Action('fixture.moreActions', 'More Actions', ThemeIcon.asClassName(Codicon.more))),
	], { icon: true, label: false });

	const content = append(panel, $('.content'));
	content.style.height = `${112 - Number.parseInt(title.style.height, 10)}px`;
	content.style.padding = '14px 18px';
	content.style.boxSizing = 'border-box';
	content.style.color = 'var(--vscode-terminal-foreground)';
	content.style.backgroundColor = 'var(--vscode-agentsPanel-background)';
	content.style.fontFamily = 'var(--vscode-editor-font-family)';
	content.style.fontSize = 'var(--vscode-editor-font-size)';
	content.textContent = '$ npm run watch';
}

function panelTabsFixture(options: IPanelTabsFixtureOptions) {
	return defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: [
			options.showLabels
				? `${options.presentation} panel tabs use the ${options.density} editor tab height and keep the selected tab foreground above its indicator.`
				: `Icon-only panel tabs retain the legacy appearance at ${options.density} editor density.`,
			'The panel actions on the right are vertically centered in the title row.',
		],
		render: context => renderPanelTabs(context, options),
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/panel-tabs/' }, {
	PillDefaultLabels: panelTabsFixture({ presentation: 'pill', density: 'default', showLabels: true }),
	PillCompactLabels: panelTabsFixture({ presentation: 'pill', density: 'compact', showLabels: true }),
	ConnectedDefaultLabels: panelTabsFixture({ presentation: 'connected', density: 'default', showLabels: true }),
	ConnectedCompactLabels: panelTabsFixture({ presentation: 'connected', density: 'compact', showLabels: true }),
	PillDefaultIcons: panelTabsFixture({ presentation: 'pill', density: 'default', showLabels: false }),
	PillCompactIcons: panelTabsFixture({ presentation: 'pill', density: 'compact', showLabels: false }),
	ConnectedDefaultIcons: panelTabsFixture({ presentation: 'connected', density: 'default', showLabels: false }),
	ConnectedCompactIcons: panelTabsFixture({ presentation: 'connected', density: 'compact', showLabels: false }),
});
