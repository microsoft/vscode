/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { NullWorkspaceFileIndex } from '../../../../platform/workspaceChunkSearch/node/nullWorkspaceFileIndex';
import { IWorkspaceFileIndex } from '../../../../platform/workspaceChunkSearch/node/workspaceFileIndex';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { ToolName } from '../../../tools/common/toolNames';
import { getAgentTools, isBackgroundTodoAgentEnabled, isTodoToolExplicitlyEnabled } from '../agentIntent';

// ─── isTodoToolExplicitlyEnabled unit tests ──────────────────────

describe('isTodoToolExplicitlyEnabled', () => {

	test('returns false when toolReferences is empty', () => {
		const request = new TestChatRequest('fix the bug');
		expect(isTodoToolExplicitlyEnabled(request)).toBe(false);
	});

	test('returns false when toolReferences contains unrelated tools', () => {
		const request = new TestChatRequest('fix the bug');
		(request as any).toolReferences = [{ name: 'read_file' }, { name: 'codebase' }];
		expect(isTodoToolExplicitlyEnabled(request)).toBe(false);
	});

	test('returns true when toolReferences contains #todo reference name', () => {
		const request = new TestChatRequest('fix the bug');
		(request as any).toolReferences = [{ name: 'todo' }];
		expect(isTodoToolExplicitlyEnabled(request)).toBe(true);
	});

	test('returns true when toolReferences contains manage_todo_list tool name', () => {
		const request = new TestChatRequest('fix the bug');
		(request as any).toolReferences = [{ name: ToolName.CoreManageTodoList }];
		expect(isTodoToolExplicitlyEnabled(request)).toBe(true);
	});

	test('returns true when toolReferences has mixed tools including todo', () => {
		const request = new TestChatRequest('fix the bug');
		(request as any).toolReferences = [{ name: 'read_file' }, { name: 'todo' }, { name: 'codebase' }];
		expect(isTodoToolExplicitlyEnabled(request)).toBe(true);
	});

	test('does not treat default tool picker enabled state as explicit enablement', () => {
		const request = new TestChatRequest('fix the bug');
		// Simulate default tool picker state: tool appears as enabled in request.tools
		request.tools = new Map([[{ name: 'manage_todo_list' } as any, true]]);
		// But toolReferences is empty — no explicit #todo mention
		expect(isTodoToolExplicitlyEnabled(request)).toBe(false);
	});
});

// ─── getAgentTools integration tests for background todo gate ────

describe('getAgentTools background todo enablement', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let configService: IConfigurationService;
	let experimentationService: IExperimentationService;
	let mockEndpoint: IChatEndpoint;

	beforeAll(() => {
		const services = createExtensionUnitTestingServices();
		services.define(IWorkspaceFileIndex, new SyncDescriptor(NullWorkspaceFileIndex));
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[
				[URI.file('/workspace')],
				[]
			]
		));
		accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		configService = accessor.get(IConfigurationService);
		experimentationService = accessor.get(IExperimentationService);
		mockEndpoint = instantiationService.createInstance(MockEndpoint, undefined);
	});

	afterAll(() => {
		accessor.dispose();
	});

	beforeEach(() => {
		// Reset to experiment disabled
		configService.setConfig(ConfigKey.Advanced.BackgroundTodoAgentEnabled, false);
	});

	function hasTodoTool(tools: readonly { name: string }[]): boolean {
		return tools.some(t => t.name === ToolName.CoreManageTodoList);
	}

	test('background todo agent is enabled only when experiment is on and todo is not explicit', () => {
		const request = new TestChatRequest('fix the bug');
		configService.setConfig(ConfigKey.Advanced.BackgroundTodoAgentEnabled, false);
		expect(isBackgroundTodoAgentEnabled(configService, experimentationService, request)).toBe(false);

		configService.setConfig(ConfigKey.Advanced.BackgroundTodoAgentEnabled, true);
		expect(isBackgroundTodoAgentEnabled(configService, experimentationService, request)).toBe(true);

		(request as any).toolReferences = [{ name: 'todo' }];
		expect(isBackgroundTodoAgentEnabled(configService, experimentationService, request)).toBe(false);
	});

	test('todo tool is not in enabled tools when experiment is on', async () => {
		configService.setConfig(ConfigKey.Advanced.BackgroundTodoAgentEnabled, true);
		const request = new TestChatRequest('fix the bug');
		const tools = await instantiationService.invokeFunction(getAgentTools, request, mockEndpoint);
		expect(hasTodoTool(tools)).toBe(false);
	});

	test('todo tool is not in enabled tools when experiment is on even with tool picker default', async () => {
		configService.setConfig(ConfigKey.Advanced.BackgroundTodoAgentEnabled, true);
		const request = new TestChatRequest('fix the bug');
		// Simulate default tool picker state: core tools appear as enabled
		request.tools = new Map([[{ name: ToolName.CoreManageTodoList } as any, true]]);
		const tools = await instantiationService.invokeFunction(getAgentTools, request, mockEndpoint);
		expect(hasTodoTool(tools)).toBe(false);
	});

	test('todo tool is disabled when experiment is on and user has not referenced #todo', async () => {
		configService.setConfig(ConfigKey.Advanced.BackgroundTodoAgentEnabled, true);
		const request = new TestChatRequest('fix the bug');
		(request as any).toolReferences = [{ name: 'read_file' }];
		const tools = await instantiationService.invokeFunction(getAgentTools, request, mockEndpoint);
		expect(hasTodoTool(tools)).toBe(false);
	});
});
