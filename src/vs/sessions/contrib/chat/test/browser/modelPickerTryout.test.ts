/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PREPARE_MODEL_PICKER_TRYOUT_COMMAND_ID } from '../../../../../workbench/contrib/chat/common/onboarding/modelPickerTryout.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import '../../browser/modelPickerTryout.js';

suite('Model picker tryout preparation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('only opens the unsent new-session composer', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const calls: (undefined | object)[] = [];
		instantiationService.stub(ISessionsService, {
			openNewSession: async options => {
				calls.push(options);
				return { session: undefined, trustDeclined: false };
			},
		});
		const command = CommandsRegistry.getCommand(PREPARE_MODEL_PICKER_TRYOUT_COMMAND_ID);
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor));

		assert.deepStrictEqual(calls, [undefined]);
	});
});
