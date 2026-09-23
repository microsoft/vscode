/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { CustomizationMigrationType, ICustomizationMigrationHint } from '../../../../common/promptSyntax/service/customizationMigrationService.js';
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
		const hint: ICustomizationMigrationHint = {
			hintId: 'hint-id',
			message: 'Found customizations to migrate.',
			counts: [{ type: CustomizationMigrationType.PromptFiles, count: 3 }],
		};

		service.hintComputed(hint);
		service.hintShown(hint);
		service.hintClicked(hint, 'review');
		service.hintClicked(hint, 'dismiss');
		service.pageShown();
		service.pageShown(CustomizationMigrationType.PromptFiles);
		service.actionClicked('migrationCategoryClicked', CustomizationMigrationType.PromptFiles);
		service.migrationClicked(CustomizationMigrationType.PromptFiles, 3);
		service.migrationCompleted(CustomizationMigrationType.PromptFiles, 3, 2, 1);

		assert.deepStrictEqual(telemetryService.events, [
			{ name: 'chat.customizationMigrationAssessment', data: { hintId: 'hint-id', category: 'promptFiles', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'hintShown', hintId: 'hint-id', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'hintReviewClicked', hintId: 'hint-id', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'hintDismissClicked', hintId: 'hint-id', count: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationOverviewShown', category: undefined } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCategoryShown', category: 'promptFiles' } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCategoryClicked', category: 'promptFiles' } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationClicked', category: 'promptFiles', requestedCount: 3 } },
			{ name: 'chat.customizationMigration', data: { action: 'migrationCompleted', category: 'promptFiles', requestedCount: 3, migratedCount: 2, failedCount: 1 } },
		]);
	});
});
