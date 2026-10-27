/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { nativeHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { StatusbarEntryItem } from '../../../browser/parts/statusbar/statusbarItem.js';
import { IStatusbarEntry } from '../../../services/statusbar/browser/statusbar.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

import '../../../browser/media/floatingPanels.css';
import '../../../browser/parts/statusbar/media/statusbarpart.css';
import '../../../contrib/modernUI/browser/media/statusBar.css';

interface IFixtureStatusbarEntry {
	readonly entry: IStatusbarEntry;
	readonly classes?: readonly string[];
	readonly hoverBackground?: string;
}

interface IFixtureScenario {
	readonly label: string;
	readonly entries: readonly IFixtureStatusbarEntry[];
}

const scenarios: readonly IFixtureScenario[] = [
	{
		label: 'Remote indicator hovered',
		entries: [
			{ entry: statusbarEntry('$(remote) SSH: 10.62.2.118', 'Editing on SSH: 10.62.2.118', 'remote'), classes: ['first-visible-item'], hoverBackground: 'var(--vscode-statusBarItem-remoteHoverBackground)' },
			{ entry: statusbarEntry('$(error) 0', 'No Errors') },
			{ entry: statusbarEntry('$(warning) 0', 'No Warnings') },
		],
	},
	{
		label: 'Simple buttons',
		entries: [
			{ entry: statusbarEntry('$(remote)', 'Open a Remote Window') },
			{ entry: statusbarEntry('main*', 'Source Control') },
			{ entry: statusbarEntry('Ln 12, Col 8', 'Cursor Position') },
		],
	},
	{
		label: 'Simple button hovered',
		entries: [
			{ entry: statusbarEntry('$(check) Ready', 'Ready'), hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
			{ entry: statusbarEntry('UTF-8', 'Select Encoding') },
		],
	},
	{
		label: 'Colored buttons',
		entries: [
			{ entry: statusbarEntry('$(warning) 2 Warnings', 'Warnings', 'warning') },
			{ entry: statusbarEntry('$(error) 1 Error', 'Errors', 'error') },
			{ entry: statusbarEntry('$(remote) Remote', 'Remote', 'remote') },
		],
	},
	{
		label: 'Two-part split button hovered',
		entries: [
			{ entry: statusbarEntry('$(sync) Sync Changes', 'Sync Changes'), classes: ['compact-right'], hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
			{ entry: statusbarEntry('$(chevron-down)', 'More Sync Actions'), classes: ['compact-left'], hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
		],
	},
	{
		label: 'Three-part split button hovered',
		entries: [
			{ entry: statusbarEntry('$(debug-start) Run', 'Run'), classes: ['compact-right'], hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
			{ entry: statusbarEntry('$(debug-pause)', 'Pause'), classes: ['compact-left', 'compact-right'], hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
			{ entry: statusbarEntry('$(chevron-down)', 'More Run Actions'), classes: ['compact-left'], hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
		],
	},
	{
		label: 'Colored split button hovered',
		entries: [
			{ entry: statusbarEntry('$(warning) Restricted Mode', 'Restricted Mode', 'warning'), classes: ['compact-right'], hoverBackground: 'var(--vscode-statusBarItem-warningHoverBackground)' },
			{ entry: statusbarEntry('$(chevron-down)', 'Restricted Mode Actions', 'warning'), classes: ['compact-left'], hoverBackground: 'var(--vscode-statusBarItem-warningHoverBackground)' },
		],
	},
];

const comparisonScenarios: readonly IFixtureScenario[] = [
	{
		label: 'Simple button',
		entries: [
			{ entry: statusbarEntry('$(check) Ready', 'Ready'), hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
		],
	},
	{
		label: 'Branch + sync split button',
		entries: [
			{ entry: statusbarEntry('$(git-branch) main*', 'Git Branch'), classes: ['compact-right'], hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
			{ entry: statusbarEntry('$(sync) 2↓ 1↑', 'Synchronize Changes'), classes: ['compact-left'], hoverBackground: 'var(--vscode-statusBarItem-hoverBackground)' },
		],
	},
];

function statusbarEntry(text: string, ariaLabel: string, kind?: IStatusbarEntry['kind']): IStatusbarEntry {
	return {
		name: ariaLabel,
		text,
		ariaLabel,
		tooltip: ariaLabel,
		command: 'fixture.statusbarAction',
		kind,
	};
}

function renderStatusBar(
	{ container, disposableStore, theme }: ComponentFixtureContext,
	compact: boolean,
	fixtureScenarios: readonly IFixtureScenario[] = scenarios,
	simulateIssue = false,
): void {
	container.style.width = '760px';
	container.style.padding = '16px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-foreground)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const root = dom.append(container, dom.$('.monaco-workbench.modern-ui.floating-panels'));
	root.classList.toggle('modern-ui-compact', compact);
	root.style.display = 'flex';
	root.style.flexDirection = 'column';
	root.style.gap = '12px';
	root.style.padding = '12px';
	root.style.backgroundColor = 'var(--vscode-editor-background)';

	for (const scenario of fixtureScenarios) {
		const row = dom.append(root, dom.$('.statusbar-fixture-row'));
		row.style.display = 'grid';
		row.style.gridTemplateColumns = '220px 1fr';
		row.style.alignItems = 'center';
		row.style.columnGap = '16px';

		const caption = dom.append(row, dom.$('span'));
		caption.textContent = scenario.label;
		caption.style.color = 'var(--vscode-descriptionForeground)';

		const statusbar = dom.append(row, dom.$('.part.statusbar'));
		statusbar.style.width = '100%';
		statusbar.style.height = compact ? '26px' : '28px';
		statusbar.style.backgroundColor = 'var(--vscode-statusBar-background)';
		statusbar.style.color = 'var(--vscode-statusBar-foreground)';
		const items = dom.append(statusbar, dom.$('.left-items.items-container'));

		for (const fixtureEntry of scenario.entries) {
			const itemContainer = dom.append(items, dom.$('.statusbar-item.left'));
			itemContainer.classList.add(...fixtureEntry.classes ?? []);

			const item = disposableStore.add(instantiationService.createInstance(
				StatusbarEntryItem,
				itemContainer,
				fixtureEntry.entry,
				nativeHoverDelegate,
			));
			if (fixtureEntry.hoverBackground) {
				item.labelContainer.style.backgroundColor = fixtureEntry.hoverBackground;
			}
			if (compact && simulateIssue) {
				item.labelContainer.style.marginLeft = 'var(--vscode-spacing-size20)';
				item.labelContainer.style.marginRight = 'var(--vscode-spacing-size20)';
			}
		}
	}
}

export default defineThemedFixtureGroup({ path: 'workbench/statusBar/' }, {
	DefaultDensity: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['Seven status-bar scenarios at default density show a first-position remote indicator plus simple, colored, two-part split, three-part split, and colored split buttons. Hover fills cover each complete colored item and meet without gaps at every split-button seam.'],
		render: context => renderStatusBar(context, false),
	}),
	CompactDensity: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The same seven status-bar scenarios at compact density use tighter spacing while preserving contiguous hover fills at split-button seams and full-width hover fills on colored items.'],
		render: context => renderStatusBar(context, true),
	}),
	Comparison_Default_Before: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A hovered simple Ready button and a hovered branch plus sync split control use default density. The split control has no seam because the reported regression only affected compact density.'],
		render: context => renderStatusBar(context, false, comparisonScenarios, true),
	}),
	Comparison_Default_After: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A hovered simple Ready button and a hovered branch plus sync split control use default density. Their geometry matches the before fixture because the fix does not change default density.'],
		render: context => renderStatusBar(context, false, comparisonScenarios),
	}),
	Comparison_Compact_Before: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A hovered simple Ready button and branch plus sync split control reproduce the old compact-density cascade. The simple button remains valid, while a visible gap separates the two split-control hover regions.'],
		render: context => renderStatusBar(context, true, comparisonScenarios, true),
	}),
	Comparison_Compact_After: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A hovered simple Ready button and branch plus sync split control use corrected compact-density geometry. The simple button retains compact spacing and the split-control hover regions meet without a gap.'],
		render: context => renderStatusBar(context, true, comparisonScenarios),
	}),
});
