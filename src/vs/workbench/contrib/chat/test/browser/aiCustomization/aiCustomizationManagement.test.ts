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
import { IAgentSession, IMarshalledAgentSessionContext } from '../../../browser/agentSessions/agentSessionsModel.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { IContext } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import '../../../browser/aiCustomization/chatCustomizations.contribution.js';

suite('aiCustomizationManagement', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opens customizations for the session context instead of the focused chat or pending harness', () => {
		const resource = URI.parse('agent-host-copilot:/selected-session');
		const session = { resource };
		const marshalled: IMarshalledAgentSessionContext = {
			$mid: MarshalledId.AgentSessionContext,
			session: upcastPartial<IAgentSession>(session),
			sessions: [upcastPartial<IAgentSession>(session)],
		};
		const targets = [session, [session], marshalled];
		const results = targets.map(target => resolveAICustomizationManagementOpenEditorTarget(
			target,
			'agent-host-claude',
			URI.parse('local:/focused-session'),
			sessionType => URI.from({ scheme: sessionType, path: '/draft' }),
		));
		assert.deepStrictEqual(results.map(result => ({
			resource: result.sessionResource?.toString(),
			explicit: result.hasExplicitSessionResource,
		})), targets.map(() => ({ resource: resource.toString(), explicit: true })));
	});

	test('rejects empty or multi-session contexts instead of opening an unrelated session', () => {
		const first = upcastPartial<IAgentSession>({ resource: URI.parse('agent-host-copilot:/first') });
		const second = upcastPartial<IAgentSession>({ resource: URI.parse('agent-host-claude:/second') });
		const targets = [
			[],
			[first, second],
			{ $mid: MarshalledId.AgentSessionContext, session: first, sessions: [first, second] },
		] satisfies Parameters<typeof resolveAICustomizationManagementOpenEditorTarget>[0][];
		for (const target of targets) {
			assert.throws(() => resolveAICustomizationManagementOpenEditorTarget(
				target, undefined, second.resource, () => second.resource,
			), /Select a single session/);
		}
	});

	test('offers Open Customizations in the editor Sessions menu, hides it without AI, and disables multi-selection', () => {
		const item = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext).filter(isIMenuItem).find(item => item.command.id === AICustomizationManagementCommands.OpenEditor);
		assert.ok(item);
		const evaluate = (enabled: boolean, multipleSelection: boolean) => {
			const values: Record<string, boolean> = {
				[ChatContextKeys.enabled.key]: enabled,
				[ChatContextKeys.hasMultipleAgentSessionsSelected.key]: multipleSelection,
			};
			const context: IContext = { getValue: <T>(key: string) => values[key] as T | undefined };
			return {
				visible: item.when?.evaluate(context),
				enabled: item.command.precondition?.evaluate(context),
			};
		};
		assert.deepStrictEqual({
			group: item.group,
			single: evaluate(true, false),
			multiple: evaluate(true, true),
			aiDisabled: evaluate(false, false),
		}, {
			group: 'navigation',
			single: { visible: true, enabled: true },
			multiple: { visible: true, enabled: false },
			aiDisabled: { visible: false, enabled: false },
		});
	});

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
