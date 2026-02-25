/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { GetUserDataHomeTool } from '../../../../common/tools/builtinTools/getUserDataHomeTool.js';
import { TestUserDataProfileService } from '../../../../../../test/common/workbenchTestServices.js';
import { IToolInvocation } from '../../../../common/tools/languageModelToolsService.js';

suite('GetUserDataHomeTool', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns the current profile location path', async () => {
		const profileService = new TestUserDataProfileService();
		const tool = new GetUserDataHomeTool(profileService);

		const result = await tool.invoke(
			{} as IToolInvocation,
			() => Promise.resolve(0),
			{ report() { } },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, {
			content: [{ kind: 'text', value: profileService.currentProfile.location.fsPath }],
		});
	});
});
