/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AICustomizationManagementSection, resolveAICustomizationManagementOpenEditorTarget } from '../../../browser/aiCustomization/aiCustomizationManagement.js';

suite('aiCustomizationManagement', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the originating chat title context before fallback session state', () => {
		const titleSessionResource = URI.parse('agent-host-copilot:/title-session');
		const fallbackSessionResource = URI.parse('local:/fallback-session');
		const revealUri = URI.file('/workspace/skill.md');
		const getSessionResourceForHarness = (sessionType: string) => URI.from({ scheme: sessionType, path: '/new-session' });

		const results = [
			resolveAICustomizationManagementOpenEditorTarget({
				$mid: MarshalledId.ChatViewContext,
				sessionResource: titleSessionResource,
			}, 'agent-host-claude', fallbackSessionResource, getSessionResourceForHarness),
			resolveAICustomizationManagementOpenEditorTarget({
				section: AICustomizationManagementSection.Skills,
				sessionType: 'agent-host-copilot',
				revealUri,
			}, 'agent-host-claude', fallbackSessionResource, getSessionResourceForHarness),
			resolveAICustomizationManagementOpenEditorTarget(
				AICustomizationManagementSection.Instructions,
				'agent-host-claude',
				fallbackSessionResource,
				getSessionResourceForHarness,
			),
			resolveAICustomizationManagementOpenEditorTarget(undefined, undefined, fallbackSessionResource, getSessionResourceForHarness),
		].map(result => ({
			section: result.section,
			revealUri: result.revealUri?.toString(),
			sessionResource: result.sessionResource?.toString(),
		}));

		assert.deepStrictEqual(results, [
			{ section: undefined, revealUri: undefined, sessionResource: 'agent-host-copilot:/title-session' },
			{ section: AICustomizationManagementSection.Skills, revealUri: revealUri.toString(), sessionResource: 'agent-host-copilot:/new-session' },
			{ section: AICustomizationManagementSection.Instructions, revealUri: undefined, sessionResource: 'agent-host-claude:/new-session' },
			{ section: undefined, revealUri: undefined, sessionResource: 'local:/fallback-session' },
		]);
	});
});
