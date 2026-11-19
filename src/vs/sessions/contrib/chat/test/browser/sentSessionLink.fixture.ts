/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { buildExternalOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { themeColorFromId } from '../../../../../platform/theme/common/themeService.js';
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetRegistry } from '../../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { isSessionLinkVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChat, ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { renderChatWidget } from '../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureDomCondition } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionLinkAttachmentWidget } from '../../browser/sessionLinkAttachmentWidget.js';

const backendSession = URI.parse('copilotcli:/0f6c3a9e-2b41-4d7a-9c55-1e8f4b7d2a60');
const sessionLink = buildExternalOpenSessionLinkUri('vscode-insiders', backendSession);

/** Registers the Agents window's session link pill, as `SessionLinkAttachmentWidgetContribution` does. */
class FixtureChatAttachmentWidgetRegistry extends ChatAttachmentWidgetRegistry {
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this.registerFactory('sessionLink', (attachment, options, container) => {
			if (!isSessionLinkVariableEntry(attachment)) {
				throw new Error('Expected a session link attachment');
			}
			return instantiationService.createInstance(SessionLinkAttachmentWidget, attachment, options, container);
		});
	}
}

/** A sent request that links to another session, shown as it is in the Agents window. */
async function renderSentSessionLink(context: ComponentFixtureContext): Promise<void> {
	const session = upcastPartial<ISession>({
		resource: URI.parse('agent-host-copilotcli:/0f6c3a9e-2b41-4d7a-9c55-1e8f4b7d2a60'),
		title: constObservable('Fix flaky terminal tests'),
		status: constObservable(SessionStatus.Completed),
		isRead: constObservable(true),
		mainChat: constObservable(upcastPartial<IChat>({ isRead: constObservable(true) })),
		isArchived: constObservable(false),
		completedStateIcon: constObservable(undefined),
		chats: constObservable<readonly IChat[]>([]),
	});

	await renderChatWidget(context, {
		messages: [{
			user: `Continue the work from ${sessionLink} and update the tests.`,
			assistant: [{ kind: 'markdown', text: 'I will pick up where that session left off.' }],
		}],
		height: 180,
		listHeight: 180,
		inputVisible: false,
		inlineAttachments: true,
		additionalServices: reg => {
			reg.define(IChatAttachmentWidgetRegistry, FixtureChatAttachmentWidgetRegistry);
			reg.defineInstance(IProductService, upcastPartial<IProductService>({ urlProtocol: 'vscode-insiders', quality: 'insider' }));
			reg.definePartialInstance(ISessionsManagementService, {
				getSessions: () => [session],
				onDidChangeSessions: Event.None,
			});
			reg.definePartialInstance(ISessionsProvidersService, {
				onDidChangeProviders: Event.None,
				getProvider: () => undefined,
			});
			// The icon that the sessions list shows for a completed session that has been read.
			reg.definePartialInstance(ISessionsListModelService, {
				getStatusIcon: () => ({ ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') }),
			});
		},
	});

	const request = context.container.querySelector<HTMLElement>('.interactive-request');
	if (!request) {
		throw new Error('The request did not render');
	}
	await waitForFixtureDomCondition(request, () => !!request.querySelector('.value')?.textContent?.includes('update the tests'), context.disposableStore);
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	SentSessionLink: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderSentSessionLink,
	}),
});
