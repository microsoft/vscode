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

	test('adds automation guidance only for the built-in automation tool', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const guidance: boolean[] = [];
		const models = new class extends mock<ILanguageModelsService>() {
			override async selectLanguageModels() { return ['utility']; }
		}();
		const utility = new class extends mock<IChatUtilityModelService>() {
			override async sendRequest(request: IChatUtilityModelRequest) {
				guidance.push(request.messages[0].content.some(part => part.type === 'text' && part.value.includes('For automation creation or updates')));
				return undefined;
			}
		}();
		const service = new ChatToolRiskAssessmentService(configuration, models, utility);
		const tool: IToolData = { id: 'vscode_configureAutomation', toolReferenceName: ConfigureAutomationToolReferenceName, displayName: 'Configure Automation', modelDescription: 'Create or update an automation.', source: ToolDataSource.Internal };
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
});
