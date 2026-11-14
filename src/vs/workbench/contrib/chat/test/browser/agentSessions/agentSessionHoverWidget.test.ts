/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AgentSessionHoverWidget } from '../../../browser/agentSessions/agentSessionHoverWidget.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { AgentSessionStatus, IAgentSession, IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IChatService } from '../../../common/chatService/chatService.js';

suite('AgentSessionHoverWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const provider of [
		{ type: 'remote-cloudsandbox__environment-copilot', label: 'Cloud', icon: Codicon.cloud, expectedIcon: 'cloud' },
		{ type: 'remote-workstation-copilot', label: 'Workstation', icon: Codicon.remote, expectedIcon: 'remote' },
		{ type: AgentSessionProviders.Background, label: 'Copilot CLI', icon: Codicon.worktree, expectedIcon: 'copilot' },
		{ type: AgentSessionProviders.Local, label: 'Local', icon: Codicon.vm, expectedIcon: 'vm' },
	]) {
		test(`preserves ${provider.label} identity in the header and unloaded-history fallback`, async () => {
			const session = upcastPartial<IAgentSession>({
				providerType: provider.type, providerLabel: provider.label, icon: provider.icon,
				resource: URI.parse(`${provider.type}:/session`), label: 'Conversation',
				status: AgentSessionStatus.Completed, timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
				isArchived: () => false,
			});
			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(IAgentSessionsService, {
				model: upcastPartial<IAgentSessionsModel>({ observeSession: () => constObservable(session) }),
			});
			instantiationService.stub(IChatService, { acquireOrLoadSession: async () => undefined });
			const widget = store.add(instantiationService.createInstance(AgentSessionHoverWidget, session));
			const details = widget.domNode.querySelector('.agent-session-hover-details');
			const header = {
				label: details?.querySelector('span:not(.codicon)')?.textContent,
				icon: !!details?.querySelector(`.codicon-${provider.expectedIcon}`),
			};
			widget.onRendered();
			await timeout(0);
			assert.deepStrictEqual({
				header,
				fallback: widget.domNode.textContent?.includes(`$(${provider.expectedIcon}) ${provider.label}`),
			}, {
				header: { label: provider.label, icon: true },
				fallback: true,
			});
		});
	}
	test('labels an archived session with the configured archive wording', async () => {
		const render = (wording: ChatSessionArchiveActionWording) => {
			const session = upcastPartial<IAgentSession>({
				providerType: AgentSessionProviders.Local, providerLabel: 'Local', icon: Codicon.vm,
				resource: URI.parse(`${AgentSessionProviders.Local}:/session-${wording}`), label: 'Conversation',
				status: AgentSessionStatus.Completed, timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
				isArchived: () => true,
			});
			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatSessionArchiveActionWordingSettingId]: wording }));
			instantiationService.stub(IAgentSessionsService, {
				model: upcastPartial<IAgentSessionsModel>({ observeSession: () => constObservable(session) }),
			});
			instantiationService.stub(IChatService, { acquireOrLoadSession: async () => undefined });
			const widget = store.add(instantiationService.createInstance(AgentSessionHoverWidget, session));
			const details = widget.domNode.querySelector('.agent-session-hover-details');
			const spans = Array.from(details?.querySelectorAll('span:not(.codicon):not(.separator)') ?? []).map(span => span.textContent);
			return {
				label: spans[spans.length - 1],
				icon: details?.querySelector('.codicon-check') ? 'check' : details?.querySelector('.codicon-archive') ? 'archive' : undefined,
			};
		};

		assert.deepStrictEqual({
			done: render(ChatSessionArchiveActionWording.MarkAsDone),
			archive: render(ChatSessionArchiveActionWording.Archive),
		}, {
			done: { label: 'Done', icon: 'check' },
			archive: { label: 'Archived', icon: 'archive' },
		});
	});
});
