/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ToolRiskBadgeWidget } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/toolRiskBadgeWidget.js';
import { IToolRiskAssessment, ToolRiskLevel } from '../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

type RenderState =
	| { kind: 'loading' }
	| { kind: 'assessment'; assessment: IToolRiskAssessment };

function renderBadge(context: ComponentFixtureContext, state: RenderState): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
	});

	const widget = disposableStore.add(instantiationService.createInstance(ToolRiskBadgeWidget));
	if (state.kind === 'loading') {
		widget.setLoading();
	} else {
		widget.setAssessment(state.assessment);
	}

	container.style.padding = '8px';
	container.style.width = '320px';
	container.classList.add('interactive-session');

	const itemContainer = dom.$('.interactive-item-container');
	itemContainer.appendChild(widget.domNode);
	container.appendChild(itemContainer);
}

const greenAssessment: IToolRiskAssessment = {
	risk: ToolRiskLevel.Green,
	explanation: 'Reads workspace files and returns matches; no side effects.',
};

const orangeAssessment: IToolRiskAssessment = {
	risk: ToolRiskLevel.Orange,
	explanation: 'Edits files in your workspace. Reversible via Git or undo.',
};

const redAssessment: IToolRiskAssessment = {
	risk: ToolRiskLevel.Red,
	explanation: 'Force-pushes to a remote branch. This rewrites history and cannot be undone.',
};

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Loading: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderBadge(ctx, { kind: 'loading' }),
	}),

	Green: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadge(ctx, { kind: 'assessment', assessment: greenAssessment }),
	}),

	Orange: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadge(ctx, { kind: 'assessment', assessment: orangeAssessment }),
	}),

	Red: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadge(ctx, { kind: 'assessment', assessment: redAssessment }),
	}),
});
