/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { CustomizationMigrationHintTarget, CustomizationMigrationType } from '../../../../common/promptSyntax/service/customizationMigrationService.js';
import { CustomizationMigrationTelemetryService } from '../../../../common/promptSyntax/service/customizationMigrationTelemetryService.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('CustomizationMigrationTelemetryService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports migration impressions, actions, and outcomes', () => {
		const telemetryService = new TestTelemetryService();
		const service = new CustomizationMigrationTelemetryService(telemetryService);

		service.hintComputed([{ type: CustomizationMigrationType.PromptFiles, count: 3 }]);
		service.hintShown(CustomizationMigrationHintTarget.FileMigrations);
		service.hintClicked(CustomizationMigrationHintTarget.FileMigrations, 'review');
		service.hintClicked(CustomizationMigrationHintTarget.FileMigrations, 'dismiss');
		service.pageShown();
		service.pageShown(CustomizationMigrationType.PromptFiles);
		service.actionClicked('migrationCategoryClicked', CustomizationMigrationType.PromptFiles);
		service.migrationClicked(CustomizationMigrationType.PromptFiles, 3);
		service.migrationCompleted(CustomizationMigrationType.PromptFiles, 3, 2, 1);

		assert.deepStrictEqual(telemetryService.events, [
			{ name: 'chat.customizationMigrationAssessment', data: { category: 'promptFiles', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'hintShown', target: 'fileMigrations' } },
			{ name: 'chat.customizationMigration', data: { action: 'hintReviewClicked', target: 'fileMigrations' } },
			{ name: 'chat.customizationMigration', data: { action: 'hintDismissClicked', target: 'fileMigrations' } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationOverviewShown', category: undefined } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCategoryShown', category: 'promptFiles' } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCategoryClicked', category: 'promptFiles' } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationClicked', category: 'promptFiles', requestedCount: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCompleted', category: 'promptFiles', requestedCount: 3, migratedCount: 2, failedCount: 1 } },
		]);
	});
});
