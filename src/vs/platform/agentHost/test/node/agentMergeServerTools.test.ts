/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createAgentMergeServerToolGroup, readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName, type IAgentMergeToolAccessor } from '../../node/shared/agentMergeServerTools.js';

suite('Agent Merge server tools', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const toolNames = [readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName];

	test('advertises tools only while the feature is enabled', () => {
		let enabled = false;
		const group = createAgentMergeServerToolGroup(new class implements IAgentMergeToolAccessor {
			isEnabled(): boolean { return enabled; }
			async readFailedCI(): Promise<string> { return ''; }
			async replyToReviewThread(): Promise<string> { return ''; }
			async rerunFailedWorkflow(): Promise<string> { return ''; }
		}());

		const whileDisabled = toolNames.filter(name => group.isEnabled(name));
		enabled = true;
		const whileEnabled = toolNames.filter(name => group.isEnabled(name));

		assert.deepStrictEqual({ whileDisabled, whileEnabled, withoutAccessor: createAgentMergeServerToolGroup().isEnabled(readAgentMergeCIToolName) }, {
			whileDisabled: [],
			whileEnabled: toolNames,
			withoutAccessor: false,
		});
	});
});
