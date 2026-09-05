/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ChatEditor } from '../../../../browser/widgetHosts/editor/chatEditor.js';
import { CustomizationMigration, CustomizationMigrationTrigger, ICustomizationMigrationService } from '../../../../common/promptSyntax/service/customizationMigrationService.js';

interface IReportCustomizationMigrationTelemetryHarness {
	readonly customizationMigrationService: ICustomizationMigrationService;
	readonly logService: { warn(message: string, error: unknown): void };
}

const reportCustomizationMigrationTelemetry = Reflect.get(ChatEditor.prototype, '_reportCustomizationMigrationTelemetry') as (
	this: IReportCustomizationMigrationTelemetryHarness,
	sessionResource: URI,
	token: CancellationToken,
) => Promise<void>;

suite('ChatEditor', () => {
	test('reports customization migration telemetry from the editor new-chat lifecycle', async () => {
		const reports: CustomizationMigrationTrigger[] = [];
		const migrationService = new class extends mock<ICustomizationMigrationService>() {
			override computeMigrations(): Promise<CustomizationMigration[]> {
				return Promise.resolve([]);
			}

			override reportMigrationTelemetry(trigger: CustomizationMigrationTrigger): void {
				reports.push(trigger);
			}
		}();

		await reportCustomizationMigrationTelemetry.call({
			customizationMigrationService: migrationService,
			logService: { warn: () => { } },
		}, URI.parse('agent-host-copilot:///new-chat'), CancellationToken.None);

		assert.deepStrictEqual(reports, [CustomizationMigrationTrigger.EditorNewChat]);
	});
});
