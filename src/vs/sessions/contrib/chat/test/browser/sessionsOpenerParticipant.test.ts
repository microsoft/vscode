/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { openSessionByResource } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsOpener.js';
import { SessionsOpenerParticipantContribution } from '../../browser/sessionsOpenerParticipant.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

suite('SessionsOpenerParticipant', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens a sessions-layer resource without a legacy agent session', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		const resource = URI.parse('agent-host-copilotcli://provider/session');
		const session = upcastPartial<ISession>({ resource });
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSession: () => session,
		}));
		let opened: { resource: URI; preserveFocus: boolean | undefined } | undefined;
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			openSession: async (candidate, options) => {
				opened = { resource: candidate, preserveFocus: options?.preserveFocus };
			},
		}));
		const contribution = new SessionsOpenerParticipantContribution();

		try {
			await instantiationService.invokeFunction(openSessionByResource, resource, { editorOptions: { preserveFocus: true } });
		} finally {
			contribution.dispose();
		}

		assert.deepStrictEqual(opened, { resource, preserveFocus: true });
	});
});
