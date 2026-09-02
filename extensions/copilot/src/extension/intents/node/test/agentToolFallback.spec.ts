/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { ITokenizerProvider } from '../../../../platform/tokenizer/node/tokenizer';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { IEditToolLearningService } from '../../../tools/common/editToolLearningService';
import { ToolName } from '../../../tools/common/toolNames';
import { applyPatch5Description } from '../../../tools/node/applyPatchTool';
import { getAgentTools } from '../agentIntent';

class ExtensionContributedOpaqueOpenAIEndpoint extends MockEndpoint {
	override readonly modelProvider = 'OpenAI';
	override readonly isExtensionContributed = true;
	override readonly supportedEditTools = ['find-replace'] as const;

	constructor(
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
	) {
		super('preview-model', chatMLFetcher, tokenizerProvider);
	}
}

describe('getAgentTools OpenAI prompt fallback', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;

	beforeAll(() => {
		accessor = createExtensionUnitTestingServices().createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.Gpt5AlternativePatch, true);
		accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.SearchSubagentToolEnabled, false);
	});

	afterAll(() => accessor.dispose());

	test('uses fallback edit tools and description instead of the extension preference', async () => {
		const endpoint = instantiationService.createInstance(ExtensionContributedOpaqueOpenAIEndpoint);
		const preferredEditTools = accessor.get(IEditToolLearningService).getPreferredEndpointEditTool(endpoint);
		const tools = await instantiationService.invokeFunction(getAgentTools, new TestChatRequest('edit the file'), endpoint);
		const editToolNames = new Set<string>([ToolName.EditFile, ToolName.ReplaceString, ToolName.MultiReplaceString, ToolName.ApplyPatch]);
		const enabledEditTools = tools
			.filter(tool => editToolNames.has(tool.name))
			.map(tool => ({ name: tool.name, description: tool.description }));

		expect({ preferredEditTools, enabledEditTools }).toEqual({
			preferredEditTools: [ToolName.ReplaceString],
			enabledEditTools: [{
				name: ToolName.ApplyPatch,
				description: applyPatch5Description,
			}],
		});
	});
});
