/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, expect, suite, test } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';
import '../manageTodoListTool';

suite('ManageTodoListTool model override', () => {
	let accessor: ITestingServicesAccessor;

	beforeAll(() => {
		accessor = createExtensionUnitTestingServices().createTestingAccessor();
	});

	afterAll(() => accessor.dispose());

	test.each([
		['gpt-5.6', true],
		['gpt-6', true],
		['gpt-6-preview', true],
		['gpt-6.1', true],
		['testing-for-latest-prompt', false],
		['gpt-4.1', false],
		[undefined, false],
	] as const)('uses the plan description for %s: %s', (family, supported) => {
		const instantiationService = accessor.get(IInstantiationService);
		const toolCtor = ToolRegistry.getTools().find(tool => tool.toolName === ToolName.CoreManageTodoList)!;
		const tool = instantiationService.createInstance(toolCtor);
		const endpoint = family === undefined ? undefined : instantiationService.createInstance(MockEndpoint, family);
		const definition: LanguageModelToolInformation = {
			name: ToolName.CoreManageTodoList,
			description: 'Manage todos',
			inputSchema: { type: 'object' },
			tags: [],
			source: undefined,
		};
		expect(tool.alternativeDefinition!(definition, endpoint)).toEqual({
			...definition,
			description: supported
				? 'Updates the task plan.\nProvide an optional explanation and a list of plan items, each with a step and status.\nAt most one step can be in_progress at a time.'
				: definition.description,
		});
	});
});
