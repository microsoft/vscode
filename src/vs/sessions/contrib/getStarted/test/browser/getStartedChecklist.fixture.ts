/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { renderSessionsListFixture } from '../../../sessions/test/browser/sessionsListFixtureUtils.js';
import { GET_STARTED_ITEM_IDS, GetStartedChecklistMode, GetStartedItemId } from '../../common/getStartedChecklist.js';
import { GetStartedChecklistWidget } from '../../browser/getStartedChecklistWidget.js';

interface IChecklistFixtureState {
	readonly done?: readonly GetStartedItemId[];
	readonly collapsed?: boolean;
	readonly finished?: boolean;
	readonly withoutAutomations?: boolean;
	readonly width?: number;
}

function createChecklist(instantiationService: IInstantiationService, disposableStore: DisposableStore, state: IChecklistFixtureState): GetStartedChecklistWidget {
	const done = state.done ?? [];
	const items = GET_STARTED_ITEM_IDS
		.filter(id => !state.withoutAutomations || id !== GetStartedItemId.Automation)
		.map(id => ({ id, done: done.includes(id) }));
	const collapsed = observableValue('collapsed', state.collapsed ?? false);
	return disposableStore.add(instantiationService.createInstance(GetStartedChecklistWidget, {
		items: constObservable(items),
		collapsed,
		finished: constObservable(state.finished ?? false),
		setCollapsed: value => collapsed.set(value, undefined),
		showMe: async () => { },
		hide: () => { },
		dismiss: () => { },
	}, { focusSessionsList: () => { }, animate: false }));
}

function renderChecklist({ container, disposableStore, theme }: ComponentFixtureContext, state: IChecklistFixtureState): void {
	container.style.width = `${state.width ?? 300}px`;
	container.style.padding = '4px 0';
	container.style.background = 'var(--vscode-agents-background)';
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	container.appendChild(createChecklist(instantiationService, disposableStore, state).domNode);
}

/** Renders the checklist where the sessions view places it, around the production sessions list of a new user. */
async function renderInSessionsView(context: ComponentFixtureContext, placement: GetStartedChecklistMode.AboveSessions | GetStartedChecklistMode.BelowSessions): Promise<void> {
	const width = 300;
	context.container.style.width = `${width}px`;
	context.container.classList.add('agent-sessions-viewpane');
	const listContainer = DOM.append(context.container, DOM.$('div'));
	const fixture = await renderSessionsListFixture({ ...context, container: listContainer }, {
		header: {},
		view: { width, height: 480 },
		sessions: [
			{ id: 'first', title: 'Fix the flaky login test', workspace: 'vscode', minutesAgo: 3, status: SessionStatus.InProgress, description: 'Running the test suite' },
		],
	});
	const card = createChecklist(fixture.instantiationService, context.disposableStore, { done: [GetStartedItemId.StartSession] });
	const content = fixture.listHost.parentElement!;
	if (placement === GetStartedChecklistMode.AboveSessions) {
		card.domNode.classList.add('above-sessions');
		const slot = DOM.$('.agent-sessions-top-notices');
		content.insertBefore(slot, fixture.listHost);
		slot.appendChild(card.domNode);
	} else {
		card.domNode.classList.add('below-sessions');
		content.appendChild(card.domNode);
	}
	fixture.list.layout(fixture.listHost.clientHeight, width);
}

const highContrast = { additionalThemes: ['darkHighContrast', 'lightHighContrast'] } as const;

export default defineThemedFixtureGroup({ path: 'sessions/getStarted/' }, {
	Empty: defineComponentFixture({ ...highContrast, render: context => renderChecklist(context, {}) }),
	FirstSessionStarted: defineComponentFixture({ render: context => renderChecklist(context, { done: [GetStartedItemId.StartSession] }) }),
	InProgress: defineComponentFixture({ ...highContrast, render: context => renderChecklist(context, { done: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel] }) }),
	OneLeft: defineComponentFixture({ render: context => renderChecklist(context, { done: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel, GetStartedItemId.SecondProject, GetStartedItemId.KeepChanges] }) }),
	Collapsed: defineComponentFixture({ ...highContrast, render: context => renderChecklist(context, { done: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel], collapsed: true }) }),
	Finished: defineComponentFixture({ render: context => renderChecklist(context, { done: GET_STARTED_ITEM_IDS, finished: true }) }),
	WithoutAutomations: defineComponentFixture({ render: context => renderChecklist(context, { done: [GetStartedItemId.StartSession], withoutAutomations: true }) }),
	Narrow: defineComponentFixture({ render: context => renderChecklist(context, { done: [GetStartedItemId.StartSession], width: 200 }) }),
	AboveSessions: defineComponentFixture({ render: context => renderInSessionsView(context, GetStartedChecklistMode.AboveSessions) }),
	BelowSessions: defineComponentFixture({ render: context => renderInSessionsView(context, GetStartedChecklistMode.BelowSessions) }),
});
