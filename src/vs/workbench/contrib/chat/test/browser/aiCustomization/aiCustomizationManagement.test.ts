/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AICustomizationManagementSection, resolveAICustomizationManagementOpenEditorTarget } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { CustomizationMigrationCategoryId } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import { CustomizationMigrationType } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { IChatWidget } from '../../../browser/chat.js';

suite('aiCustomizationManagement', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('input actions target their own widget for pointer and keyboard invocation', () => {
		const origin = URI.parse('agent-host-copilot:/origin');
		const fallback = URI.parse('local:/other-widget');
		const results = [undefined, 'agent-host-claude'].map(pendingDelegationTarget =>
			resolveAICustomizationManagementOpenEditorTarget({
				widget: upcastPartial<IChatWidget>({
					input: upcastPartial<IChatWidget['input']>({ pendingDelegationTarget }),
					viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: origin }),
				}),
			}, 'unrelated-harness', fallback, sessionType => URI.from({ scheme: sessionType, path: '/draft' })),
		);
		assert.deepStrictEqual(results.map(result => ({
			resource: result.sessionResource?.toString(),
			explicit: result.hasExplicitSessionResource,
		})), [
			{ resource: origin.toString(), explicit: true },
			{ resource: 'agent-host-claude:/draft', explicit: true },
		]);
	});

	test('resolves the originating chat title context before fallback session state', () => {
		const titleSessionResource = URI.parse('agent-host-copilot:/title-session');
		const fallbackSessionResource = URI.parse('local:/fallback-session');
		const revealUri = URI.file('/workspace/skill.md');
		const migrationHint = {
			migrationFlowId: 'migration-flow-id',
			message: 'Migration hint',
			counts: [{ type: CustomizationMigrationType.PromptFiles, count: 1 }],
		};
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
				migration: true,
				migrationCategory: CustomizationMigrationCategoryId.PromptFiles,
				migrationHint,
			}, 'agent-host-claude', fallbackSessionResource, getSessionResourceForHarness),
			resolveAICustomizationManagementOpenEditorTarget(
				AICustomizationManagementSection.Instructions,
				'agent-host-claude',
				fallbackSessionResource,
				getSessionResourceForHarness,
			),
			resolveAICustomizationManagementOpenEditorTarget(undefined, undefined, fallbackSessionResource, getSessionResourceForHarness),
			resolveAICustomizationManagementOpenEditorTarget({
				sessionResource: titleSessionResource,
				migration: true,
			}, 'agent-host-claude', fallbackSessionResource, getSessionResourceForHarness),
		].map(result => ({
			section: result.section,
			revealUri: result.revealUri?.toString(),
			sessionResource: result.sessionResource?.toString(),
			hasExplicitSessionResource: result.hasExplicitSessionResource,
			migration: result.migration,
			migrationCategory: result.migrationCategory,
			migrationFlowId: result.migrationHint?.migrationFlowId,
		}));

		assert.deepStrictEqual(results, [
			{ section: undefined, revealUri: undefined, sessionResource: 'agent-host-copilot:/title-session', hasExplicitSessionResource: true, migration: undefined, migrationCategory: undefined, migrationFlowId: undefined },
			{ section: AICustomizationManagementSection.Skills, revealUri: revealUri.toString(), sessionResource: 'agent-host-copilot:/new-session', hasExplicitSessionResource: false, migration: true, migrationCategory: CustomizationMigrationCategoryId.PromptFiles, migrationFlowId: 'migration-flow-id' },
			{ section: AICustomizationManagementSection.Instructions, revealUri: undefined, sessionResource: 'agent-host-claude:/new-session', hasExplicitSessionResource: false, migration: undefined, migrationCategory: undefined, migrationFlowId: undefined },
			{ section: undefined, revealUri: undefined, sessionResource: 'local:/fallback-session', hasExplicitSessionResource: false, migration: undefined, migrationCategory: undefined, migrationFlowId: undefined },
			{ section: undefined, revealUri: undefined, sessionResource: 'agent-host-copilot:/title-session', hasExplicitSessionResource: true, migration: true, migrationCategory: undefined, migrationFlowId: undefined },
		]);
	});
});
