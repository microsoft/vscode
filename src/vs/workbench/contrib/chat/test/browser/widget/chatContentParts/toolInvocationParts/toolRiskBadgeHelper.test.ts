/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { toolRiskLevelForSafety } from '../../../../../browser/widget/chatContentParts/toolInvocationParts/toolRiskBadgeHelper.js';
import { ToolRiskLevel } from '../../../../../browser/tools/chatToolRiskAssessmentService.js';

suite('toolRiskBadgeHelper', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps normalized safety scores to risk levels', () => {
		assert.deepStrictEqual([
			toolRiskLevelForSafety(-1),
			toolRiskLevelForSafety(0.32),
			toolRiskLevelForSafety(0.33),
			toolRiskLevelForSafety(0.66),
			toolRiskLevelForSafety(0.67),
			toolRiskLevelForSafety(2),
		], [
			ToolRiskLevel.Red,
			ToolRiskLevel.Red,
			ToolRiskLevel.Red,
			ToolRiskLevel.Orange,
			ToolRiskLevel.Green,
			ToolRiskLevel.Green,
		]);
	});
});
