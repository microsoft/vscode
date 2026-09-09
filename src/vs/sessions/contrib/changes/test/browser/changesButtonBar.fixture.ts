/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/changesView.css';
import * as dom from '../../../../../base/browser/dom.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { WorkbenchButtonBar } from '../../../../../platform/actions/browser/buttonbar.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'sessions/changes/' }, {
	ButtonBar: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A production-style Changes view outside-card action row shows one full-width primary "Commit" button with a leading commit icon and one compact icon-only secondary action. Both controls are 26px tall and aligned in a single row.'],
		render: renderChangesButtonBar,
	}),
});

function renderChangesButtonBar({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '560px';
	container.style.padding = '16px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-foreground)';
	container.style.fontFamily = 'var(--vscode-font-family)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registerWorkbenchServices,
	});

	const changesView = dom.append(container, dom.$('.changes-view-body'));
	const actions = dom.append(changesView, dom.$('.chat-editing-session-actions.outside-card'));
	const commit = action('fixture.commit', 'Commit', Codicon.gitCommit);
	const viewChanges = action('fixture.viewChanges', 'View All Changes', Codicon.diffMultiple);

	const bar = disposableStore.add(instantiationService.createInstance(
		WorkbenchButtonBar,
		actions,
		{
			buttonConfigProvider: action => {
				switch (action.id) {
					case commit.id:
						return {
							showIcon: true,
							showLabel: true,
							iconLabelSpacing: 'default',
						};
					case viewChanges.id:
						return { showIcon: true, showLabel: false, isSecondary: true };
				}
				return undefined;
			},
		},
	));

	bar.update([commit, viewChanges], []);
}

function action(id: string, label: string, icon?: ThemeIcon): IAction {
	return toAction({
		id,
		label,
		class: icon ? ThemeIcon.asClassName(icon) : undefined,
		run: () => { },
	});
}
