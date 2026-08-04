/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { type ComponentToState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatWidget } from '../../../browser/chat.js';
import { AgentHostGenericConfigChips } from '../../../browser/agentSessions/agentHost/agentHostGenericConfigChips.js';
import { IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';

function createSubscription<T>(): IAgentSubscription<T> {
	return {
		value: undefined,
		verifiedValue: undefined,
		onDidChange: Event.None,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};
}

suite('AgentHostGenericConfigChips', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('moves its subscription when the provisional generation changes', () => {
		const sessionResource = URI.parse('agent-host-copilot:/untitled-test');
		const firstBackend = URI.parse('copilot:/first-generation');
		const secondBackend = URI.parse('copilot:/second-generation');
		const provisionalChanged = disposables.add(new Emitter<URI>());
		let currentBackend = firstBackend;
		const provisionalService = {
			onDidChange: provisionalChanged.event,
			get: () => currentBackend,
		} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService;
		const acquired: string[] = [];
		const released: string[] = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			declare readonly _serviceBrand: undefined;

			override getSubscription<T extends StateComponents>(_kind: T, resource: URI, _owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
				acquired.push(resource.toString());
				return {
					object: createSubscription<ComponentToState[T]>(),
					dispose: () => released.push(resource.toString()),
				};
			}
		}();
		const widget = {
			viewModel: { sessionResource },
			onDidChangeViewModel: Event.None,
		} as Partial<IChatWidget> as IChatWidget;
		const chips = disposables.add(new AgentHostGenericConfigChips(
			widget,
			disposables.add(new TestInstantiationService()),
			agentHostService,
			provisionalService,
			{} as IAgentHostSessionWorkingDirectoryResolver,
			{} as IWorkspaceContextService,
			{} as IAgentHostNewSessionFolderService,
		));

		currentBackend = secondBackend;
		provisionalChanged.fire(sessionResource);

		assert.deepStrictEqual({
			acquired,
			released,
		}, {
			acquired: [firstBackend.toString(), secondBackend.toString()],
			released: [firstBackend.toString()],
		});

		chips.dispose();
	});
});
