/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GUIDED_TRYOUT_PRESENTATION_KIND, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/onboarding.js';
import { createUnifiedWorkspacePickerTryout } from '../../../browser/onboarding/workspacePickerTryout.contribution.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { PREPARE_UNIFIED_WORKSPACE_PICKER_TRYOUT_COMMAND_ID, UNIFIED_WORKSPACE_PICKER_TRYOUT_ID, WORKSPACE_PICKER_ONBOARDING_TARGET_ID } from '../../../common/onboarding/workspacePickerTryout.js';

suite('Unified workspace picker tryout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('guides the scoped Agents workspace control without selecting anything', () => {
		const tryout = createUnifiedWorkspacePickerTryout();

		assert.deepStrictEqual({
			id: tryout.id,
			isAI: tryout.isAI,
			targetWindow: tryout.targetWindow,
			when: tryout.when?.serialize(),
			presentation: tryout.presentation,
		}, {
			id: UNIFIED_WORKSPACE_PICKER_TRYOUT_ID,
			isAI: true,
			targetWindow: 'agents',
			when: `chatIsEnabled && config.${ChatConfiguration.UnifiedWorkspacePicker}`,
			presentation: {
				kind: GUIDED_TRYOUT_PRESENTATION_KIND,
				payload: {
					launch: {
						kind: 'command',
						payload: {
							commandId: PREPARE_UNIFIED_WORKSPACE_PICKER_TRYOUT_COMMAND_ID,
							captureTargetScope: true,
						},
					},
					steps: [{
						id: 'workspacePicker',
						kind: SPOTLIGHT_PRESENTATION_KIND,
						payload: {
							id: 'workspacePicker',
							targetId: WORKSPACE_PICKER_ONBOARDING_TARGET_ID,
							title: 'Choose a Workspace or Repository',
							description: 'Use Workspace to search local folders, GitHub repositories, Cloud repositories, and remote targets. This example opens the list but does not choose a workspace or send a prompt.',
							placement: 'above',
							openTarget: true,
							allowTargetInteraction: true,
							missingTarget: { kind: 'wait', timeoutMs: 10_000 },
						},
					}],
					unavailableMessage: 'The Agents composer opened, but its Workspace control could not be highlighted.',
				},
			},
		});
	});

	test('offers the experimental setting without enabling it', () => {
		const tryout = createUnifiedWorkspacePickerTryout();

		assert.deepStrictEqual({
			unavailableMessage: tryout.unavailableMessage,
			setup: tryout.setup,
		}, {
			unavailableMessage: 'Enable the Unified Workspace Picker setting, then try this example again.',
			setup: {
				label: 'Open Unified Workspace Picker Setting',
				command: {
					id: 'workbench.action.openSettings',
					arguments: [`@id:${ChatConfiguration.UnifiedWorkspacePicker}`],
				},
			},
		});
	});
});
