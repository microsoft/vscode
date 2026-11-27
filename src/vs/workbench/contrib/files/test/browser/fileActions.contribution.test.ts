/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../browser/fileActions.contribution.js';

suite('Files - Context menu contributions', () => {
	test('SCM resource context includes copy name command', () => {
		const ids = MenuRegistry.getMenuItems(MenuId.SCMResourceContext)
			.filter(isIMenuItem)
			.map(item => item.command.id);

		assert.ok(ids.includes('copyFileName'));
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
