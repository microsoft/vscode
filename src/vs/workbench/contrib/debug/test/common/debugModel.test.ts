/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExceptionBreakpoint } from 'vs/workbench/contrib/debug/common/debugModel';

suite('DebugModel', () => {
	suite('ExceptionBreakpoint', () => {
		test('Restored matches new', () => {
			const ebp = new ExceptionBreakpoint('id', 'label', true, true, 'condition', 'description', 'condition description', false);
			const strigified = JSON.stringify(ebp);
			const parsed = JSON.parse(strigified);
			const newEbp = new ExceptionBreakpoint(parsed.filter, parsed.label, parsed.enabled, parsed.supportsCondition, parsed.condition, parsed.description, parsed.conditionDescription, !!parsed.fallback);
			assert.ok(ebp.matches(newEbp));
		});
	});
});
