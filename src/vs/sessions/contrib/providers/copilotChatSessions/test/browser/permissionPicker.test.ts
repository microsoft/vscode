/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { DEFAULT_PERMISSION_LEVELS, getPermissionLevelMeta } from '../../browser/permissionPicker.js';

suite('Copilot PermissionPicker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses descriptions aligned with the agent host permission picker', () => {
		assert.deepStrictEqual(DEFAULT_PERMISSION_LEVELS.map(level => ({
			level,
			label: getPermissionLevelMeta(level).label,
			detail: getPermissionLevelMeta(level).detail,
		})), [
			{
				level: ChatPermissionLevel.Default,
				label: 'Default approvals',
				detail: 'Asks when approval settings don\'t apply',
			},
			{
				level: ChatPermissionLevel.AutoApprove,
				label: 'Allow all',
				detail: 'Runs tool calls without asking',
			},
			{
				level: ChatPermissionLevel.Autopilot,
				label: 'Autopilot (Preview)',
				detail: 'Autonomously iterates from start to finish',
			},
		]);
	});
});
