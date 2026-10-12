/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatService } from '../../../../common/chatService/chatService.js';
import { CustomizationMigrationType, FileCustomizationMigrationFailureReason } from '../../../../common/promptSyntax/service/customizationMigrationService.js';
import { CustomizationMigrationTelemetryService, parseCustomizationMigrationAgentResult } from '../../../../common/promptSyntax/service/customizationMigrationTelemetryService.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('CustomizationMigrationTelemetryService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports migration impressions, actions, and outcomes', () => {
		const telemetryService = new TestTelemetryService();
		const service = store.add(new CustomizationMigrationTelemetryService(telemetryService, new class extends mock<IFileService>() { }, new NullLogService(), new class extends mock<IChatService>() { }));
		const hint = {
			migrationFlowId: 'migration-flow-id',
			message: 'Migration hint',
			counts: [{ type: CustomizationMigrationType.PromptFiles, count: 3 }],
		};

		service.hintComputed(hint);
		service.hintShown(hint);
		service.hintClicked(hint, 'review');
		service.hintClicked(hint, 'dismiss');
		service.pageShown();
		service.pageShown(CustomizationMigrationType.PromptFiles);
		service.actionClicked('migrationCategoryClicked', CustomizationMigrationType.PromptFiles);
		service.actionClicked('agentMigrationClicked');
		service.migrationClicked(CustomizationMigrationType.PromptFiles, 3, hint.migrationFlowId);
		service.migrationCompleted(CustomizationMigrationType.PromptFiles, 3, 2, 1, [
			FileCustomizationMigrationFailureReason.TargetWriteFailed,
			FileCustomizationMigrationFailureReason.TargetWriteFailed,
			FileCustomizationMigrationFailureReason.RollbackFailed,
		], hint.migrationFlowId);
		service.migrationCompleted(CustomizationMigrationType.McpServers, 0, 0, 0, [], hint.migrationFlowId, true);
		service.migrationCompleted(CustomizationMigrationType.UserData, 0, 0, 0, [], hint.migrationFlowId, false, true);

		assert.deepStrictEqual(telemetryService.events, [
			{ name: 'chat.customizationMigrationAssessment', data: { migrationFlowId: 'migration-flow-id', category: 'promptFiles', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'hintShown', migrationFlowId: 'migration-flow-id', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'hintReviewClicked', migrationFlowId: 'migration-flow-id', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'hintDismissClicked', migrationFlowId: 'migration-flow-id', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationOverviewShown', category: undefined } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCategoryShown', category: 'promptFiles' } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCategoryClicked', category: 'promptFiles' } },
			{ name: 'chat.customizationMigration', data: { action: 'agentMigrationClicked', category: undefined } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationClicked', category: 'promptFiles', migrationFlowId: 'migration-flow-id', requestedCount: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCompleted', category: 'promptFiles', migrationFlowId: 'migration-flow-id', requestedCount: 3, migratedCount: 2, failedCount: 1, migrationFailedReasons: 'rollbackFailed;targetWriteFailed' } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCompleted', category: 'mcpServers', migrationFlowId: 'migration-flow-id', requestedCount: 0, migratedCount: 0, failedCount: 0, cancelled: true } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCompleted', category: 'userData', migrationFlowId: 'migration-flow-id', requestedCount: 0, migratedCount: 0, failedCount: 0, timedOut: true } },
		]);
	});

	test('parses aggregate outcomes from an agent migration result', () => {
		const report = parseCustomizationMigrationAgentResult(JSON.stringify({
			version: 1,
			migrationFlowId: 'migration-flow-id',
			cancelled: true,
			results: [
				{ category: 'promptFiles', scope: 'workspace', customizationType: 'skill', outcome: 'migrated', count: 2 },
				{ category: 'promptFiles', scope: 'user', customizationType: 'skill', outcome: 'failed', count: 1 },
				{ category: 'promptFiles', scope: 'user', customizationType: 'skill', outcome: 'skipped', count: 1 },
			],
		}), 'migration-flow-id', new Map([[CustomizationMigrationType.PromptFiles, 4]]));

		assert.deepStrictEqual(report, {
			cancelled: true,
			outcomes: [{
				category: CustomizationMigrationType.PromptFiles,
				requestedCount: 3,
				migratedCount: 2,
				failedCount: 1,
			}],
		});
	});
});
