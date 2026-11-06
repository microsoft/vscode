/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatToolRiskAssessmentService } from '../../../browser/tools/chatToolRiskAssessmentService.js';
import { IChatUtilityModelRequest, IChatUtilityModelService } from '../../../common/chatUtilityModelService.js';
import { ConfigureAutomationToolReferenceName } from '../../../common/automations/automationService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { TerminalToolId } from '../../../common/tools/terminalToolIds.js';

suite('ChatToolRiskAssessmentService automation prompt', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const tool: IToolData = { id: 'vscode_configureAutomation', toolReferenceName: ConfigureAutomationToolReferenceName, displayName: 'Configure Automation', modelDescription: 'Create or update an automation.', source: ToolDataSource.Internal };

	function createService(onRequest: (request: IChatUtilityModelRequest) => void): ChatToolRiskAssessmentService {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const models = new class extends mock<ILanguageModelsService>() {
			override async selectLanguageModels() { return ['utility']; }
		}();
		const utility = new class extends mock<IChatUtilityModelService>() {
			override async sendRequest(request: IChatUtilityModelRequest) {
				onRequest(request);
				return undefined;
			}
		}();
		return new ChatToolRiskAssessmentService(configuration, models, utility);
	}

	test('adds automation guidance only for the built-in automation tool', async () => {
		const guidance: boolean[] = [];
		const service = createService(request => guidance.push(request.messages[0].content.some(part => part.type === 'text' && part.value.includes('For automation creation or updates'))));
		for (const candidate of [
			tool,
			{ ...tool, id: TerminalToolId.RunInTerminal },
			{ ...tool, id: 'read-file', toolReferenceName: 'readFile' },
			{ ...tool, id: 'external-configure', source: ToolDataSource.External },
		]) {
			await service.assess(candidate, {}, CancellationToken.None);
		}
		assert.deepStrictEqual(guidance, [true, false, false, false]);
	});

	test('preserves automation permissions after long descriptive text without changing generic truncation', async () => {
		const serialized: string[] = [];
		const service = createService(request => {
			const message = request.messages[0].content.map(part => part.type === 'text' ? part.value : '').join('');
			const marker = 'Arguments (JSON): ';
			serialized.push(message.slice(message.lastIndexOf(marker) + marker.length));
		});
		const name = 'n'.repeat(3000);
		const prompt = 'p'.repeat(5000);
		const parameters = [
			{ name, prompt, permissionLevel: 'autoApprove' },
			{ name, prompt, sessionTemplate: { config: { autoApprove: 'autoApprove', futureOption: { enabled: true } } } },
		];
		for (const value of parameters) {
			await service.assess(tool, value, CancellationToken.None);
		}
		await service.assess(tool, parameters[0], CancellationToken.None, 'generic');
		assert.deepStrictEqual({
			automation: serialized.slice(0, 2).map(value => JSON.parse(value)),
			inputUnchanged: parameters.every(value => value.name === name && value.prompt === prompt),
			genericLength: serialized[2].length,
			genericTruncated: serialized[2].endsWith('...[truncated]'),
		}, {
			automation: parameters.map(value => ({ ...value, name: 'n'.repeat(1999) + '\u2026', prompt: 'p'.repeat(1999) + '\u2026' })),
			inputUnchanged: true,
			genericLength: 2000 + '...[truncated]'.length,
			genericTruncated: true,
		});
	});
});
