/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { IToolDeferralService } from '../../../../../platform/networking/common/toolDeferralService';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../common/toolNames';
import { BuiltInToolGroupHandler } from '../../../common/virtualTools/builtInToolGroupHandler';
import { VirtualTool } from '../../../common/virtualTools/virtualTool';

function makeTool(name: string): LanguageModelToolInformation {
	return {
		name,
		description: `Tool for ${name}`,
		inputSchema: { type: 'object', properties: {} },
		tags: [],
		source: undefined,
	};
}

describe('BuiltInToolGroupHandler', () => {
	it('keeps non-deferred built-in tools direct when grouping deferred built-ins', () => {
		const services = createExtensionUnitTestingServices();
		services.define(IToolDeferralService, {
			_serviceBrand: undefined,
			isNonDeferredTool: (name: string) => name === ToolName.CoreAskQuestions || name === ToolName.CoreRunTest,
		});
		const accessor = services.createTestingAccessor();

		try {
			const handler = accessor.get(IInstantiationService).createInstance(BuiltInToolGroupHandler);
			const results = handler.createBuiltInToolGroups([
				makeTool(ToolName.CoreAskQuestions),
				makeTool(ToolName.CoreRunTest),
				makeTool(ToolName.CreateNewWorkspace),
				makeTool(ToolName.InstallExtension),
				makeTool(ToolName.FetchWebPage),
				makeTool(ToolName.GithubTextSearch),
			]);

			const directToolNames = results
				.filter((tool): tool is LanguageModelToolInformation => !(tool instanceof VirtualTool))
				.map(tool => tool.name)
				.sort();
			const virtualTools = results.filter((tool): tool is VirtualTool => tool instanceof VirtualTool);

			expect(directToolNames).toEqual([
				ToolName.CoreAskQuestions,
				ToolName.CoreRunTest,
			].sort());
			expect(virtualTools.map(tool => tool.name).sort()).toEqual([
				'activate_vs_code_interaction',
				'activate_web_interaction',
			]);
			expect(virtualTools.find(tool => tool.name === 'activate_vs_code_interaction')?.contents.map(tool => tool.name)).toEqual([
				ToolName.CreateNewWorkspace,
				ToolName.InstallExtension,
			]);
		} finally {
			accessor.dispose();
		}
	});

	it('does not create a virtual group when only one deferred tool remains after excluding non-deferred built-ins', () => {
		const services = createExtensionUnitTestingServices();
		services.define(IToolDeferralService, {
			_serviceBrand: undefined,
			isNonDeferredTool: (name: string) => name === ToolName.CoreAskQuestions,
		});
		const accessor = services.createTestingAccessor();

		try {
			const handler = accessor.get(IInstantiationService).createInstance(BuiltInToolGroupHandler);
			const results = handler.createBuiltInToolGroups([
				makeTool(ToolName.CoreAskQuestions),
				makeTool(ToolName.CreateNewWorkspace),
				makeTool(ToolName.ToolSearch),
			]);

			expect(results.every(tool => !(tool instanceof VirtualTool))).toBe(true);
			expect(results.map(tool => tool.name).sort()).toEqual([
				ToolName.CoreAskQuestions,
				ToolName.CreateNewWorkspace,
				ToolName.ToolSearch,
			].sort());
		} finally {
			accessor.dispose();
		}
	});
});