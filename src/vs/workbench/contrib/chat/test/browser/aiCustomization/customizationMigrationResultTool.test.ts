/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { CustomizationMigrationResultTool, CustomizationMigrationResultToolData } from '../../../browser/aiCustomization/customizationMigrationResultTool.js';
import { ICustomizationMigrationTelemetryService } from '../../../common/promptSyntax/service/customizationMigrationTelemetryService.js';

suite('Customization migration result tool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports the aggregate result and removes the session tool', async () => {
		const sessionResource = URI.parse('agent-host-test:/migration');
		const parameters = {
			version: 1,
			migrationFlowId: 'flow',
			cancelled: false,
			results: [{ category: 'promptFiles', scope: 'workspace', customizationType: 'skill', outcome: 'migrated', count: 1 }],
		};
		const reports: unknown[] = [];
		const cleared: URI[] = [];
		const tool = new CustomizationMigrationResultTool(
			new class extends mock<ICustomizationMigrationTelemetryService>() {
				override async reportAgentMigrationResult(result: unknown): Promise<void> {
					reports.push(result);
				}
			}(),
			new class extends mock<IAgentHostActiveClientService>() {
				override clearSessionTools(resource: URI): void {
					cleared.push(resource);
				}
			}(),
		);

		const result = await tool.invoke({
			callId: 'call',
			toolId: CustomizationMigrationResultToolData.id,
			parameters,
			context: { sessionResource },
		}, undefined as never, undefined as never, CancellationToken.None);

		assert.deepStrictEqual({
			reports,
			cleared: cleared.map(resource => resource.toString()),
			result,
			canBeReferencedInPrompt: CustomizationMigrationResultToolData.canBeReferencedInPrompt,
			when: CustomizationMigrationResultToolData.when?.serialize(),
			descriptionAnchors: [
				'Report the final aggregate outcome',
				'Use this tool exactly once',
				'never include customization names, paths, contents',
			].filter(anchor => CustomizationMigrationResultToolData.modelDescription.includes(anchor)),
		}, {
			reports: [parameters],
			cleared: ['agent-host-test:/migration'],
			result: { content: [{ kind: 'text', value: 'Customization migration outcome reported.' }] },
			canBeReferencedInPrompt: false,
			when: 'false',
			descriptionAnchors: [
				'Report the final aggregate outcome',
				'Use this tool exactly once',
				'never include customization names, paths, contents',
			],
		});
	});

	test('keeps the session tool available when reporting fails', async () => {
		const cleared: URI[] = [];
		const tool = new CustomizationMigrationResultTool(
			new class extends mock<ICustomizationMigrationTelemetryService>() {
				override async reportAgentMigrationResult(): Promise<void> {
					throw new Error('Invalid result');
				}
			}(),
			new class extends mock<IAgentHostActiveClientService>() {
				override clearSessionTools(resource: URI): void {
					cleared.push(resource);
				}
			}(),
		);

		await assert.rejects(() => tool.invoke({
			callId: 'call',
			toolId: CustomizationMigrationResultToolData.id,
			parameters: {},
			context: { sessionResource: URI.parse('agent-host-test:/migration') },
		}, undefined as never, undefined as never, CancellationToken.None), /Invalid result/);
		assert.deepStrictEqual(cleared, []);
	});

	test('reports a background result without an invocation context', async () => {
		const reports: unknown[] = [];
		const tool = new CustomizationMigrationResultTool(
			new class extends mock<ICustomizationMigrationTelemetryService>() {
				override async reportAgentMigrationResult(result: unknown): Promise<void> {
					reports.push(result);
				}
			}(),
			new class extends mock<IAgentHostActiveClientService>() { }(),
		);
		const parameters = { migrationFlowId: 'flow' };

		const result = await tool.invoke({
			callId: 'call',
			toolId: CustomizationMigrationResultToolData.id,
			parameters,
			context: undefined,
		}, undefined as never, undefined as never, CancellationToken.None);

		assert.deepStrictEqual({
			reports,
			result,
		}, {
			reports: [parameters],
			result: { content: [{ kind: 'text', value: 'Customization migration outcome reported.' }] },
		});
	});
});
