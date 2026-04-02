/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { IMenu, IMenuActionOptions, IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AgentFeedbackOverlayWidget } from '../../browser/agentFeedbackEditorOverlay.js';
import { clearAllFeedbackActionId, navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from '../../browser/agentFeedbackEditorActions.js';

interface INavigationBearings {
	readonly activeIdx: number;
	readonly totalCount: number;
}

interface IFixtureOptions {
	readonly navigationBearings: INavigationBearings;
	readonly hasAgentFeedbackActions?: boolean;
}

class FixtureMenuService implements IMenuService {
	constructor(private readonly _hasAgentFeedbackActions: boolean) {
	}

	declare readonly _serviceBrand: undefined;

	createMenu(_id: MenuId): IMenu {
		const navigateActions = [
			toAction({ id: navigationBearingFakeActionId, label: 'Navigation Status', run: () => { } }),
			toAction({ id: navigatePreviousFeedbackActionId, label: 'Previous', class: 'codicon codicon-arrow-up', run: () => { } }),
			toAction({ id: navigateNextFeedbackActionId, label: 'Next', class: 'codicon codicon-arrow-down', run: () => { } }),
		] as unknown as (MenuItemAction | SubmenuItemAction)[];

		const submitActions = this._hasAgentFeedbackActions
			? [
				toAction({ id: submitFeedbackActionId, label: 'Submit', class: 'codicon codicon-send', run: () => { } }),
				toAction({ id: clearAllFeedbackActionId, label: 'Clear', class: 'codicon codicon-clear-all', run: () => { } }),
			] as unknown as (MenuItemAction | SubmenuItemAction)[]
			: [];

		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => submitActions.length > 0
				? [
					['navigate', navigateActions],
					['a_submit', submitActions],
				]
				: [
					['navigate', navigateActions],
				],
		};
	}

	getMenuActions(_id: MenuId, _contextKeyService: unknown, _options?: IMenuActionOptions) { return []; }
	getMenuContexts() { return new Set<string>(); }
	resetHiddenStates() { }
}

function renderWidget(context: ComponentFixtureContext, options: IFixtureOptions): void {
	const scopedDisposables = context.disposableStore.add(new DisposableStore());
	context.container.classList.add('monaco-workbench');
	context.container.style.width = '420px';
	context.container.style.height = '64px';
	context.container.style.padding = '12px';
	context.container.style.background = 'var(--vscode-editor-background)';

	const instantiationService = createEditorServices(scopedDisposables, {
		colorTheme: context.theme,
		additionalServices: reg => {
			reg.defineInstance(IMenuService, new FixtureMenuService(options.hasAgentFeedbackActions ?? true));
			registerWorkbenchServices(reg);
		},
	});

	const widget = scopedDisposables.add(instantiationService.createInstance(AgentFeedbackOverlayWidget));
	widget.show(options.navigationBearings);
	context.container.appendChild(widget.getDomNode());
}

export default defineThemedFixtureGroup({ path: 'sessions/agentFeedback/' }, {
	ZeroOfZero: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			navigationBearings: { activeIdx: -1, totalCount: 0 },
			hasAgentFeedbackActions: false,
		}),
	}),

	SingleFeedback: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			navigationBearings: { activeIdx: 0, totalCount: 1 },
		}),
	}),

	FirstOfThree: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			navigationBearings: { activeIdx: -1, totalCount: 3 },
		}),
	}),

	ReviewOnlyTwoComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			navigationBearings: { activeIdx: 0, totalCount: 2 },
			hasAgentFeedbackActions: false,
		}),
	}),

	MiddleOfThree: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			navigationBearings: { activeIdx: 1, totalCount: 3 },
		}),
	}),

	MixedFourComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			navigationBearings: { activeIdx: 2, totalCount: 4 },
			hasAgentFeedbackActions: true,
		}),
	}),

	LastOfThree: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWidget(context, {
			navigationBearings: { activeIdx: 2, totalCount: 3 },
		}),
	}),
});
