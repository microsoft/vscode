/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { NullHoverService } from '../../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ToolRiskBadgeWidget } from '../../../../../browser/widget/chatContentParts/toolInvocationParts/toolRiskBadgeWidget.js';
import { ToolRiskLevel } from '../../../../../browser/tools/chatToolRiskAssessmentService.js';

suite('ToolRiskBadgeWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders compact risk codicons', () => {
		const widget = store.add(new ToolRiskBadgeWidget(NullHoverService));
		const icon = widget.domNode.querySelector('.tool-risk-icon');
		const classNames = [icon?.className];
		for (const risk of [ToolRiskLevel.Green, ToolRiskLevel.Orange, ToolRiskLevel.Red]) {
			widget.setAssessment({ risk, explanation: 'Risk assessment' });
			classNames.push(icon?.className);
		}

		assert.deepStrictEqual({
			ariaHidden: icon?.getAttribute('aria-hidden'),
			classNames,
		}, {
			ariaHidden: 'true',
			classNames: [
				'tool-risk-icon codicon codicon-loading-compact codicon-modifier-spin',
				'tool-risk-icon codicon codicon-pass-compact',
				'tool-risk-icon codicon codicon-warning-compact',
				'tool-risk-icon codicon codicon-error-compact',
			],
		});
	});
});
