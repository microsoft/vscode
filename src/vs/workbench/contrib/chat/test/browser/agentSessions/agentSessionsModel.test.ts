/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { ChatSessionStatus, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';

suite('AgentSessionsModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let chatSessionsService: MockChatSessionsService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		chatSessionsService = new MockChatSessionsService();
		instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		instantiationService.stub(IChatSessionsService, chatSessionsService);
	});

	test('applies changed session items immediately', () => {
		const model = disposables.add(instantiationService.createInstance(AgentSessionsModel));
		const resource = URI.parse('test-provider:/session/1');

		chatSessionsService.fireDidChangeSessionItems({
			addedOrUpdated: [{
				resource,
				label: 'Running Session\nwith details',
				status: ChatSessionStatus.InProgress,
				timing: {
					created: 1,
					lastRequestStarted: 2,
					lastRequestEnded: undefined
				}
			}]
		});

		assert.deepStrictEqual(model.sessions.map(session => ({
			resource: session.resource.toString(),
			label: session.label,
			status: session.status,
			timing: session.timing,
		})), [{
			resource: resource.toString(),
			label: 'Running Session',
			status: ChatSessionStatus.InProgress,
			timing: {
				created: 1,
				lastRequestStarted: 2,
				lastRequestEnded: undefined
			}
		}]);
	});
});
