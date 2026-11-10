/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IValidatePackageArgs, McpSetupCommands } from '../../vscode-node/commands';
import { McpTargetFormat } from '../../vscode-node/mcpConfigurationGeneration';
import { IMcpToolCallingLoopOptions } from '../../vscode-node/mcpToolCallingLoop';
import { IMcpStdioServerConfiguration, McpServerType, McpServerVariableType } from '../../vscode-node/nuget';

const mocks = vi.hoisted(() => ({
	commands: new Map<string, (args: unknown) => Promise<unknown>>(),
	run: vi.fn(),
	options: undefined as IMcpToolCallingLoopOptions | undefined,
}));

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	ChatHookType: undefined,
	ChatRequest: undefined,
	LanguageModelToolInformation: undefined,
	Extension: undefined,
	ChatMcpToolInvocationData: undefined,
	commands: {
		registerCommand: (id: string, callback: (args: unknown) => Promise<unknown>) => {
			mocks.commands.set(id, callback);
			return { dispose: () => mocks.commands.delete(id) };
		},
	},
	lm: { selectChatModels: async () => [] },
	window: {
		createQuickPick: () => ({ show() { }, dispose() { } }),
		showErrorMessage: vi.fn(),
	},
}));

vi.mock('../../vscode-node/mcpToolCallingLoop', () => ({
	McpToolCallingLoop: class {
		constructor(options: IMcpToolCallingLoopOptions) { mocks.options = options; }
		run = mocks.run;
	},
}));

describe('MCP setup command contract', () => {
	let store: DisposableStore;
	const schema = { type: 'object', required: ['name', 'command'], properties: { name: { type: 'string' }, command: { type: 'string' } } };

	beforeEach(() => {
		store = new DisposableStore();
		mocks.options = undefined;
		mocks.run.mockReset();
		const services = store.add(createExtensionUnitTestingServices());
		store.add(services.createTestingAccessor().get(IInstantiationService).createInstance(McpSetupCommands));
	});
	afterEach(() => {
		store.dispose();
		vi.restoreAllMocks();
	});

	async function validate(targetFormat?: McpTargetFormat) {
		const args: IValidatePackageArgs = { name: 'test-package', type: 'nuget', targetConfig: schema, targetFormat };
		await mocks.commands.get('github.copilot.chat.mcp.setup.validatePackage')!(args);
	}

	for (const targetFormat of ['vscode', 'workspaceRoot', 'copilotGlobal'] as const) {
		it(`preserves a usable manifest without a model call for ${targetFormat}`, async () => {
			const config: IMcpStdioServerConfiguration = { type: McpServerType.LOCAL, command: 'dnx', args: ['test-package', '--yes'] };
			const getMcpServer = vi.fn(async (consent: Promise<void>) => {
				await consent;
				return { config };
			});
			vi.spyOn(McpSetupCommands, 'validatePackageRegistry').mockResolvedValue({ state: 'ok', name: 'test-package', publisher: 'test', getMcpServer });
			await validate(targetFormat);
			const result = await mocks.commands.get('github.copilot.chat.mcp.setup.flow')!({ name: 'test-package' });
			expect({ result, modelCalls: mocks.run.mock.calls.length }).toEqual({
				result: { type: 'mapped', name: 'test-package', server: config, inputs: undefined },
				modelCalls: 0,
			});
		});

		it(`passes ${targetFormat} and the exact core-supplied schema to generation`, async () => {
			vi.spyOn(McpSetupCommands, 'validatePackageRegistry').mockResolvedValue({ state: 'ok', name: 'test-package', publisher: 'test' });
			mocks.run.mockResolvedValue({ response: { type: ChatFetchResponseType.Success, value: '{"name":"test","command":"node"}' } });
			await validate(targetFormat);
			const result = await mocks.commands.get('github.copilot.chat.mcp.setup.flow')!({ name: 'test-package' });
			expect({ format: mocks.options?.props.targetFormat, schema: mocks.options?.props.targetSchema, result }).toEqual({
				format: targetFormat, schema,
				result: { type: 'assisted', format: targetFormat, name: 'test', server: { command: 'node' }, inputs: [], inputValues: undefined },
			});
		});
	}

	it('keeps manifest inputs intact for core to offer an explicit safe destination', async () => {
		const inputs = [{ id: 'token', type: McpServerVariableType.PROMPT, description: 'Token', password: true }];
		const config: IMcpStdioServerConfiguration = { type: McpServerType.LOCAL, command: 'dnx', args: ['${input:token}'] };
		vi.spyOn(McpSetupCommands, 'validatePackageRegistry').mockResolvedValue({
			state: 'ok', name: 'test-package', publisher: 'test', getMcpServer: async () => ({ config, inputs }),
		});
		await validate('copilotGlobal');
		expect(await mocks.commands.get('github.copilot.chat.mcp.setup.flow')!({ name: 'test-package' })).toEqual({
			type: 'mapped', name: 'test-package', server: config, inputs,
		});
		expect(mocks.run).not.toHaveBeenCalled();
	});

	it('uses VS Code format for older callers without targetFormat', async () => {
		vi.spyOn(McpSetupCommands, 'validatePackageRegistry').mockResolvedValue({ state: 'ok', name: 'test-package', publisher: 'test' });
		mocks.run.mockResolvedValue({ response: { type: ChatFetchResponseType.Success, value: '{"name":"test","command":"node"}' } });
		await validate();
		expect(await mocks.commands.get('github.copilot.chat.mcp.setup.flow')!({ name: 'test-package' })).toMatchObject({ format: 'vscode' });
	});

	it('reports invalid generation explicitly rather than returning a success-shaped value', async () => {
		vi.spyOn(McpSetupCommands, 'validatePackageRegistry').mockResolvedValue({ state: 'ok', name: 'test-package', publisher: 'test' });
		mocks.run.mockResolvedValue({ response: { type: ChatFetchResponseType.Success, value: 'not a configuration' } });
		await validate('copilotGlobal');
		await expect(mocks.commands.get('github.copilot.chat.mcp.setup.flow')!({ name: 'test-package' })).rejects.toThrow('selected destination');
	});

	it('keeps embedded input references and saves values outside generated configuration', async () => {
		vi.spyOn(McpSetupCommands, 'validatePackageRegistry').mockResolvedValue({ state: 'ok', name: 'test-package', publisher: 'test' });
		mocks.run.mockImplementation(async () => {
			const reference = mocks.options!.props.pickRef.recordInput('Token', 'secret');
			return { response: { type: ChatFetchResponseType.Success, value: JSON.stringify({ name: 'test', command: 'node', args: [`--token=${reference}`, reference] }) } };
		});
		await validate('workspaceRoot');
		const result = await mocks.commands.get('github.copilot.chat.mcp.setup.flow')!({ name: 'test-package' });
		expect(result).toMatchObject({
			type: 'assisted', format: 'workspaceRoot',
			inputs: [{ type: 'promptString', description: 'Token', password: true }],
			inputValues: { [Object.keys((result as { inputValues: Record<string, string> }).inputValues)[0]]: 'secret' },
		});
		expect(JSON.stringify((result as { server: object }).server)).not.toContain('secret');
	});
});
