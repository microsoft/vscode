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

	test('renders red risk with error codicon', () => {
		const widget = store.add(new ToolRiskBadgeWidget(NullHoverService));
		widget.setAssessment({
			risk: ToolRiskLevel.Red,
			explanation: 'High risk',
		});

		const icon = widget.domNode.querySelector('.tool-risk-icon');
		assert.deepStrictEqual({
			ariaHidden: icon?.getAttribute('aria-hidden'),
			className: icon?.className,
			textContent: icon?.textContent,
		}, {
			ariaHidden: 'true',
			className: 'tool-risk-icon codicon codicon-error',
			textContent: '',
		});
	});
});
