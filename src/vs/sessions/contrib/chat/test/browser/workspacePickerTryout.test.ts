/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { PREPARE_UNIFIED_WORKSPACE_PICKER_TRYOUT_COMMAND_ID } from '../../../../../workbench/contrib/chat/common/onboarding/workspacePickerTryout.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import '../../browser/workspacePickerTryout.js';

suite('Unified workspace picker tryout preparation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('only opens the unsent new-session composer', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const calls: (undefined | object)[] = [];
		instantiationService.stub(ISessionsService, {
			activeSession: constObservable(upcastPartial<IActiveSession>({ sessionId: 'new-session' })),
			openNewSession: async options => {
				calls.push(options);
				return { session: undefined, trustDeclined: false };
			},
		});
		const command = CommandsRegistry.getCommand(PREPARE_UNIFIED_WORKSPACE_PICKER_TRYOUT_COMMAND_ID);
		assert.ok(command);

		const result = await instantiationService.invokeFunction(accessor => command.handler(accessor));

		assert.deepStrictEqual({ calls, result }, {
			calls: [undefined],
			result: { targetScope: 'new-session' },
		});
	});
});
