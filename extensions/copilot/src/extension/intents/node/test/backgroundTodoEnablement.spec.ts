/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType, type RequestMetadata } from '@vscode/copilot-api';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../platform/authentication/common/copilotToken';
import { setCopilotToken } from '../../../../platform/authentication/common/staticGitHubAuthenticationService';
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
import { AgentIntentInvocation, getAgentTools, isBackgroundTodoAgentEnabled, isTodoToolExplicitlyEnabled } from '../agentIntent';

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

// ─── isBackgroundTodoAgentEnabled unit tests ─────────────────────

// The gate only opens for a signed-in, paid user whose request is routed
// through CAPI. Each test flips exactly one of those factors away from an
// otherwise-enabled baseline to confirm it is sufficient to close the gate.

describe('isBackgroundTodoAgentEnabled', () => {

	// CAPI endpoints carry a `RequestMetadata` object; BYOK/custom endpoints are
	// fetched from a literal URL string.
	const capiEndpoint = { urlOrRequestMetadata: { type: RequestType.ChatCompletions }, modelProvider: 'copilot' } as unknown as IChatEndpoint;
	const byokEndpoint = { urlOrRequestMetadata: 'https://api.example.com/v1/chat', modelProvider: 'custom' } as unknown as IChatEndpoint;

	const paidToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'copilot_individual', copilot_plan: 'individual' }));
	const freeToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'free_limited_copilot' }));
	const noAuthToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'no_auth_limited_copilot' }));

	function auth(copilotToken: CopilotToken | undefined): IAuthenticationService {
		return { copilotToken } as unknown as IAuthenticationService;
	}

	function config(experimentEnabled: boolean): IConfigurationService {
		return { getExperimentBasedConfig: () => experimentEnabled } as unknown as IConfigurationService;
	}

	const expService = {} as IExperimentationService;

	function isEnabled(endpoint: IChatEndpoint, copilotToken: CopilotToken | undefined, experimentEnabled: boolean, request: TestChatRequest = new TestChatRequest('fix the bug')): boolean {
		return isBackgroundTodoAgentEnabled(endpoint, config(experimentEnabled), expService, auth(copilotToken), request);
	}

	test('enabled for a signed-in paid user on a CAPI endpoint with the experiment on', () => {
		expect(isEnabled(capiEndpoint, paidToken, true)).toBe(true);
	});

	test('disabled when the experiment is off', () => {
		expect(isEnabled(capiEndpoint, paidToken, false)).toBe(false);
	});

	test('disabled when there is no Copilot token (signed out)', () => {
		expect(isEnabled(capiEndpoint, undefined, true)).toBe(false);
	});

	test('disabled for a free-plan user', () => {
		expect(isEnabled(capiEndpoint, freeToken, true)).toBe(false);
	});

	test('disabled for a no-auth user', () => {
		expect(isEnabled(capiEndpoint, noAuthToken, true)).toBe(false);
	});

	test('disabled on a non-CAPI (BYOK) endpoint', () => {
		expect(isEnabled(byokEndpoint, paidToken, true)).toBe(false);
	});

	test('disabled when #todo is explicitly referenced', () => {
		const request = new TestChatRequest('fix the bug');
		(request as any).toolReferences = [{ name: 'todo' }];
		expect(isEnabled(capiEndpoint, paidToken, true, request)).toBe(false);
	});
});

// ─── getAgentTools integration tests for background todo gate ────

describe('getAgentTools background todo enablement', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let configService: IConfigurationService;
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

		// The background-todo gate only opens for a signed-in paid user whose
		// request is routed through CAPI, so set up both for this harness.
		const paidToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'copilot_individual', copilot_plan: 'individual' }));
		setCopilotToken(accessor.get(IAuthenticationService), paidToken);

		mockEndpoint = instantiationService.createInstance(MockEndpoint, undefined);
		(mockEndpoint as unknown as { urlOrRequestMetadata: string | RequestMetadata }).urlOrRequestMetadata = { type: RequestType.ChatCompletions };
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

// ─── _maybeStartBackgroundTodoAgentPass subagent guard ───────────

// The method is private and lives on a heavyweight class that requires many
// injected services to construct. To keep these tests focused on the guard's
// behaviour, we invoke the prototype method directly against a minimal stub
// that supplies only the fields the guard touches. TypeScript's `private`
// modifier is compile-time only, so the method is reachable at runtime.

describe('AgentIntentInvocation._maybeStartBackgroundTodoAgentPass subagent guard', () => {

	function getMethod(): (this: unknown, endpoint: unknown, promptContext: unknown, token: unknown) => void {
		return (AgentIntentInvocation.prototype as unknown as { _maybeStartBackgroundTodoAgentPass: (this: unknown, endpoint: unknown, promptContext: unknown, token: unknown) => void })._maybeStartBackgroundTodoAgentPass;
	}

	// The helper now evaluates background-todo eligibility first, so these tests
	// provide a CAPI endpoint + paid auth + experiment enabled baseline and then
	// vary only the subagent fields to validate the guard behavior.
	const endpoint = { urlOrRequestMetadata: { type: RequestType.ChatCompletions }, modelProvider: '' } as unknown as IChatEndpoint;
	const paidToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'copilot_individual', copilot_plan: 'individual' }));

	function makeStub(request: TestChatRequest, processorLookup: () => unknown) {
		return {
			request,
			_getOrCreateBackgroundTodoAgentProcessor: processorLookup,
			configurationService: { getExperimentBasedConfig: () => true },
			expService: {},
			instantiationService: {},
			toolsService: {},
			telemetryService: {},
			authenticationService: { copilotToken: paidToken },
			logService: { debug: () => { } },
		};
	}

	test('returns early without touching the processor when request is from a subagent', () => {
		let processorLookups = 0;
		const request = new TestChatRequest('do work');
		(request as unknown as { subAgentInvocationId: string }).subAgentInvocationId = 'subagent-uuid-1';

		const stub = makeStub(request, () => {
			processorLookups++;
			return undefined;
		});

		getMethod().call(stub, endpoint, { conversation: { sessionId: 'sess-1' } }, {});

		expect(processorLookups).toBe(0);
	});

	test('proceeds past the guard when the request has no subAgentInvocationId', () => {
		let processorLookups = 0;
		const request = new TestChatRequest('do work');

		const stub = makeStub(request, () => {
			processorLookups++;
			return undefined;
		});

		getMethod().call(stub, endpoint, { conversation: { sessionId: 'sess-1' } }, {});

		expect(processorLookups).toBe(1);
	});

	test('treats an empty-string subAgentInvocationId as a subagent request', () => {
		let processorLookups = 0;
		const request = new TestChatRequest('do work');
		(request as unknown as { subAgentInvocationId: string }).subAgentInvocationId = '';

		const stub = makeStub(request, () => {
			processorLookups++;
			return undefined;
		});

		getMethod().call(stub, endpoint, { conversation: { sessionId: 'sess-1' } }, {});

		expect(processorLookups).toBe(0);
	});
});
