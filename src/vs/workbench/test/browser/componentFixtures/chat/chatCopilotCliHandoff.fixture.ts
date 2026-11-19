/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ICopilotCliHandoffHistoryEntry, setCopilotCliHandoffHistory, setCopilotCliHandoffInputPaused } from '../../../../contrib/chat/common/copilotCliHandoff.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup, registerFixtureHoverService, waitForFixtureDomCondition } from '../fixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';

type HandoffPreview = 'arrival' | 'nextMessage' | 'departure' | 'takenByCli' | 'takeBack';

const messages: readonly IFixtureMessage[] = [
	{
		user: 'Help me make the task list easier to scan.',
		assistant: [{ kind: 'markdown', text: 'I found the task list in `src/tasks.ts`. I can group completed tasks below the tasks that still need attention.' }],
	},
	{
		user: 'Keep completed tasks collapsed by default.',
		assistant: [{ kind: 'markdown', text: 'Completed tasks now sit in a collapsed section. Your unfinished tasks stay at the top.' }],
	},
];

async function renderHandoff(context: ComponentFixtureContext, state: HandoffPreview, width = 620): Promise<void> {
	const hasNextMessage = state === 'nextMessage' || state === 'takeBack';
	const history: ICopilotCliHandoffHistoryEntry[] = [];
	await renderChatWidget(context, {
		width, height: 600, listHeight: 600, inputVisible: false,
		messages: hasNextMessage ? messages : messages.slice(0, 1),
		additionalServices: reg => {
			reg.define(IHoverService, class extends HoverService {
				override setupManagedHover(...[, target, content, options]: Parameters<IHoverService['setupManagedHover']>) {
					return super.setupManagedHover({
						delay: 200,
						placement: 'element',
						showHover: hover => this.showInstantHover({ ...hover, container: context.container }),
					}, target, content, options);
				}
			});
		},
		onRendered: ({ model, listWidget, instantiationService }) => {
			const request = model.getRequests()[0];
			history.push({
				id: 'arrival', kind: 'arrival', timestamp: request.timestamp + 1,
				afterRequestId: request.id, returnCommand: '/code',
			});
			if (state === 'departure' || state === 'takenByCli' || state === 'takeBack') {
				history.push({
					id: 'departure', kind: state === 'takenByCli' ? 'takenByCli' : 'departure',
					timestamp: request.timestamp + 2, afterRequestId: request.id, returnCommand: '/code',
				});
			}
			if (state === 'takeBack') {
				history.push({
					id: 'return', kind: 'takeBack', timestamp: request.timestamp + 3,
					afterRequestId: request.id, returnCommand: '/code',
				});
			}
			context.disposableStore.add(toDisposable(() => {
				setCopilotCliHandoffHistory(model.sessionResource, []);
				setCopilotCliHandoffInputPaused(model.sessionResource, false);
			}));
			const finishHoverConstruction = registerFixtureHoverService(context.container, instantiationService.get(IHoverService), context.disposableStore);
			try {
				setCopilotCliHandoffInputPaused(model.sessionResource, state === 'departure' || state === 'takenByCli');
				setCopilotCliHandoffHistory(model.sessionResource, history);
				listWidget.refresh();
			} finally {
				finishHoverConstruction();
			}
		},
	});
	await waitForFixtureDomCondition(context.container, () => context.container.querySelectorAll('.chat-workspace-transition').length === history.length, context.disposableStore);
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ArrivalPreview: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderHandoff(context, 'arrival') }),
	AfterNextMessagePreview: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderHandoff(context, 'nextMessage') }),
	ContinuedInTerminalPreview: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderHandoff(context, 'departure') }),
	ContinuedInCopilotCliPreview: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderHandoff(context, 'takenByCli') }),
	TakenBackPreview: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderHandoff(context, 'takeBack') }),
	NarrowArrivalPreview: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderHandoff(context, 'arrival', 320) }),
	NarrowTerminalPreview: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderHandoff(context, 'departure', 320) }),
});
