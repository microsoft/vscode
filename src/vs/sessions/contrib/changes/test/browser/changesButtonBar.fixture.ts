/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/changesView.css';
import * as dom from '../../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../../base/browser/fonts.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { WorkbenchButtonBar } from '../../../../../platform/actions/browser/buttonbar.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { CHANGES_OUTSIDE_CARD_CLASS, getChangesButtonBarIconLabelSpacing } from '../../browser/changesButtonBarSpacing.js';

export default defineThemedFixtureGroup({ path: 'sessions/changes/' }, {
	ButtonBar: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A production-style Changes view outside-card action row shows one full-width primary "Commit" button with a leading commit icon, 26px tall.'],
		render: renderChangesButtonBar,
	}),
	ButtonBarInlineIconLabel: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A production-style Changes outside-card button shows a 6px leading-icon relationship and a multi-part label with "Commit" followed by adjacent check and add icons. The inline icons keep a tighter 2px relationship without adding outer spacing at the trailing edge.'],
		render: context => renderChangesButtonBar(context, 'Commit $(check)$(add)'),
	}),
});

function renderChangesButtonBar({ container, disposableStore, theme }: ComponentFixtureContext, label = 'Commit'): void {
	container.style.width = '560px';
	container.style.padding = '16px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-foreground)';
	container.style.fontFamily = DEFAULT_FONT_FAMILY;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registerWorkbenchServices,
	});

	const changesView = dom.append(container, dom.$('.changes-view-body'));
	const actions = dom.append(changesView, dom.$(`.chat-editing-session-actions.${CHANGES_OUTSIDE_CARD_CLASS}`));
	const commit = action('fixture.commit', label, Codicon.gitCommit);

	// Matches production: both changesView.ts call sites cap this bar at one button.
	const bar = disposableStore.add(instantiationService.createInstance(
		WorkbenchButtonBar,
		actions,
		{
			renderSecondaryActions: false,
			buttonConfigProvider: action => {
				switch (action.id) {
					case commit.id:
						return {
							showIcon: true,
							showLabel: true,
							iconLabelSpacing: getChangesButtonBarIconLabelSpacing(actions),
						};
				}
				return undefined;
			},
		},
	));

	bar.update([commit], []);
}

function action(id: string, label: string, icon?: ThemeIcon): IAction {
	return toAction({
		id,
		label,
		class: icon ? ThemeIcon.asClassName(icon) : undefined,
		run: () => { },
	});
}
