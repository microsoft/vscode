/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { constObservable, IObservable } from '../../../../../util/vs/base/common/observableInternal';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { ICopilotTool } from '../../../../tools/common/toolsRegistry';
import { IOnWillInvokeToolEvent, IToolsService, IToolValidationResult } from '../../../../tools/common/toolsService';
import { ClaudeToolPermissionContext, ClaudeToolPermissionResult, IClaudeToolConfirmationParams, IClaudeToolPermissionHandler } from '../../common/claudeToolPermission';
import { registerToolPermissionHandler } from '../../common/claudeToolPermissionRegistry';
import { ClaudeToolPermissionService } from '../../common/claudeToolPermissionService';
import { ClaudeToolNames } from '../../common/claudeTools';

// Import existing handlers to ensure they're registered
import '../../common/toolPermissionHandlers/index';

/**
 * Mock tools service that can be configured for different test scenarios
 */
class MockToolsService implements IToolsService {
	readonly _serviceBrand: undefined;

	private readonly _onWillInvokeTool = new Emitter<IOnWillInvokeToolEvent>();
	readonly onWillInvokeTool = this._onWillInvokeTool.event;

	readonly tools: ReadonlyArray<vscode.LanguageModelToolInformation> = [];
	readonly copilotTools = new Map<ToolName, ICopilotTool<unknown>>();

	private _confirmationResult: 'yes' | 'no' = 'yes';
	private _optionsConfirmationResult: string | undefined;
	private _invokeToolCalls: Array<{ name: string; input: unknown }> = [];

	setConfirmationResult(result: 'yes' | 'no'): void {
		this._confirmationResult = result;
	}

	setOptionsConfirmationResult(result: string | undefined): void {
		this._optionsConfirmationResult = result;
	}

	get invokeToolCalls(): ReadonlyArray<{ name: string; input: unknown }> {
		return this._invokeToolCalls;
	}

	clearCalls(): void {
		this._invokeToolCalls = [];
	}

	invokeToolWithEndpoint(name: string, options: vscode.LanguageModelToolInvocationOptions<unknown>, endpoint: IChatEndpoint | undefined, token: vscode.CancellationToken): Thenable<vscode.LanguageModelToolResult2> {
		return this.invokeTool(name, options);
	}

	modelSpecificTools: IObservable<{ definition: vscode.LanguageModelToolDefinition; tool: ICopilotTool<unknown> }[]> = constObservable([]);

	async invokeTool(
		name: string,
		options: vscode.LanguageModelToolInvocationOptions<unknown>
	): Promise<vscode.LanguageModelToolResult2> {
		this._invokeToolCalls.push({ name, input: options.input });

		if (name === ToolName.CoreConfirmationTool || name === ToolName.CoreTerminalConfirmationTool) {
			return {
				content: [new LanguageModelTextPart(this._confirmationResult)]
			};
		}

		if (name === ToolName.CoreConfirmationToolWithOptions) {
			return {
				content: this._optionsConfirmationResult !== undefined
					? [new LanguageModelTextPart(this._optionsConfirmationResult)]
					: []
			};
		}

		return { content: [] };
	}

	getCopilotTool(): ICopilotTool<unknown> | undefined {
		return undefined;
	}

	getTool(): vscode.LanguageModelToolInformation | undefined {
		return undefined;
	}

	getToolByToolReferenceName(): vscode.LanguageModelToolInformation | undefined {
		return undefined;
	}

	validateToolInput(): IToolValidationResult {
		return { inputObj: {} };
	}

	validateToolName(): string | undefined {
		return undefined;
	}

	getEnabledTools(): vscode.LanguageModelToolInformation[] {
		return [];
	}
}

/**
 * Creates a mock tool permission context
 */
function createMockContext(): ClaudeToolPermissionContext {
	return {
		toolInvocationToken: {} as vscode.ChatParticipantToolToken
	};
}

describe('ClaudeToolPermissionService', () => {
	let store: DisposableStore;
	let instantiationService: IInstantiationService;
	let mockToolsService: MockToolsService;
	let service: ClaudeToolPermissionService;

	beforeEach(() => {
		store = new DisposableStore();
		const serviceCollection = store.add(createExtensionUnitTestingServices());

		mockToolsService = new MockToolsService();
		serviceCollection.set(IToolsService, mockToolsService);

		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		service = instantiationService.createInstance(ClaudeToolPermissionService);
	});

	describe('canUseTool', () => {
		describe('with default confirmation flow', () => {
			it('allows tool when user confirms', async () => {
				mockToolsService.setConfirmationResult('yes');
				const input = { pattern: '**/*.ts' };
				const context = createMockContext();

				const result = await service.canUseTool(ClaudeToolNames.Glob, input, context);

				expect(result.behavior).toBe('allow');
				if (result.behavior === 'allow') {
					expect(result.updatedInput).toEqual(input);
				}
			});

			it('denies tool when user declines', async () => {
				mockToolsService.setConfirmationResult('no');
				const input = { pattern: '**/*.ts' };
				const context = createMockContext();

				const result = await service.canUseTool(ClaudeToolNames.Glob, input, context);

				expect(result.behavior).toBe('deny');
				if (result.behavior === 'deny') {
					expect(result.message).toBe('The user declined to run the tool');
				}
			});

			it('invokes CoreConfirmationTool with tool parameters', async () => {
				const input = { pattern: 'test-pattern' };
				const context = createMockContext();

				await service.canUseTool(ClaudeToolNames.Glob, input, context);

				expect(mockToolsService.invokeToolCalls.length).toBe(1);
				expect(mockToolsService.invokeToolCalls[0].name).toBe(ToolName.CoreConfirmationTool);

				const confirmParams = mockToolsService.invokeToolCalls[0].input as IClaudeToolConfirmationParams;
				expect(confirmParams.title).toContain('Glob');
				expect(confirmParams.message).toContain('test-pattern');
			});

			it('uses default confirmation when no handler registered', async () => {
				const input = { some: 'data' };
				const context = createMockContext();

				// Use a tool that likely has no custom handler
				await service.canUseTool('UnknownTool', input, context);

				expect(mockToolsService.invokeToolCalls.length).toBe(1);
				const confirmParams = mockToolsService.invokeToolCalls[0].input as IClaudeToolConfirmationParams;
				expect(confirmParams.title).toContain('UnknownTool');
			});
		});

		describe('with registered handler', () => {
			it('uses handler handle method for Bash tool with terminal confirmation', async () => {
				const input = { command: 'npm test' };
				const context = createMockContext();

				await service.canUseTool(ClaudeToolNames.Bash, input, context);

				expect(mockToolsService.invokeToolCalls.length).toBe(1);
				// Bash handler uses CoreTerminalConfirmationTool directly via its handle method
				expect(mockToolsService.invokeToolCalls[0].name).toBe(ToolName.CoreTerminalConfirmationTool);
				const terminalInput = mockToolsService.invokeToolCalls[0].input as { message: string; command: string; isBackground: boolean };
				expect(terminalInput.command).toBe('npm test');
				expect(terminalInput.isBackground).toBe(false);
			});

			it('bypasses confirmation when canAutoApprove returns true', async () => {
				// Register a handler that auto-approves
				class AutoApproveHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.NotebookEdit> {
					readonly toolNames = [ClaudeToolNames.NotebookEdit] as const;

					async canAutoApprove(): Promise<boolean> {
						return true;
					}
				}
				registerToolPermissionHandler([ClaudeToolNames.NotebookEdit], AutoApproveHandler);

				// Create a new service to pick up the handler
				const newService = instantiationService.createInstance(ClaudeToolPermissionService);
				const input = { notebook_path: '/test.ipynb' };
				const context = createMockContext();

				const result = await newService.canUseTool(ClaudeToolNames.NotebookEdit, input, context);

				expect(result.behavior).toBe('allow');
				expect(mockToolsService.invokeToolCalls.length).toBe(0);
			});

			it('uses full handle implementation when available', async () => {
				const customResult: ClaudeToolPermissionResult = {
					behavior: 'allow',
					updatedInput: { modified: true }
				};

				// Register a handler with full handle implementation
				class FullHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.KillBash> {
					readonly toolNames = [ClaudeToolNames.KillBash] as const;

					async handle(): Promise<ClaudeToolPermissionResult> {
						return customResult;
					}
				}
				registerToolPermissionHandler([ClaudeToolNames.KillBash], FullHandler);

				// Create a new service to pick up the handler
				const newService = instantiationService.createInstance(ClaudeToolPermissionService);
				const input = { pid: 123 };
				const context = createMockContext();

				const result = await newService.canUseTool(ClaudeToolNames.KillBash, input, context);

				expect(result).toEqual(customResult);
				expect(mockToolsService.invokeToolCalls.length).toBe(0);
			});
		});

		describe('handler caching', () => {
			it('caches handler instances for repeated calls', async () => {
				const context = createMockContext();

				// Call twice with the same tool
				await service.canUseTool(ClaudeToolNames.Bash, { command: 'ls' }, context);
				mockToolsService.clearCalls();
				await service.canUseTool(ClaudeToolNames.Bash, { command: 'pwd' }, context);

				// Both calls should succeed
				expect(mockToolsService.invokeToolCalls.length).toBe(1);
				// Bash handler uses CoreTerminalConfirmationTool directly via its handle method
				expect(mockToolsService.invokeToolCalls[0].name).toBe(ToolName.CoreTerminalConfirmationTool);
				const terminalInput = mockToolsService.invokeToolCalls[0].input as { message: string; command: string; isBackground: boolean };
				expect(terminalInput.command).toBe('pwd');
			});
		});

		describe('ExitPlanMode handler', () => {
			const exitPlanModeInput = { plan: 'Step 1: Do something\nStep 2: Do another thing' };

			it('allows when user clicks Approve', async () => {
				mockToolsService.setOptionsConfirmationResult('Approve');
				const context = createMockContext();

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, context);

				expect(result.behavior).toBe('allow');
				if (result.behavior === 'allow') {
					expect(result.updatedInput).toEqual(exitPlanModeInput);
				}
			});

			it('invokes CoreConfirmationToolWithOptions with Approve and Deny buttons', async () => {
				mockToolsService.setOptionsConfirmationResult('Approve');
				const context = createMockContext();

				await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, context);

				expect(mockToolsService.invokeToolCalls.length).toBe(1);
				expect(mockToolsService.invokeToolCalls[0].name).toBe(ToolName.CoreConfirmationToolWithOptions);
				const input = mockToolsService.invokeToolCalls[0].input as { title: string; message: string; buttons: string[] };
				expect(input.buttons).toEqual(['Approve', 'Deny']);
				expect(input.message).toContain('Step 1: Do something');
			});

			it('denies when user clicks Deny', async () => {
				mockToolsService.setOptionsConfirmationResult('Deny');
				const context = createMockContext();

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, context);

				expect(result.behavior).toBe('deny');
				if (result.behavior === 'deny') {
					expect(result.message).toContain('declined');
				}
			});

			it('denies when dialog returns empty content', async () => {
				mockToolsService.setOptionsConfirmationResult(undefined);
				const context = createMockContext();

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, context);

				expect(result.behavior).toBe('deny');
				if (result.behavior === 'deny') {
					expect(result.message).toContain('declined');
				}
			});

			it('denies with distinct message when tool invocation throws', async () => {
				const failingService = new class extends MockToolsService {
					override async invokeTool(name: string): Promise<vscode.LanguageModelToolResult2> {
						if (name === ToolName.CoreConfirmationToolWithOptions) {
							throw new Error('Tool unavailable');
						}
						return { content: [] };
					}
				}();

				const serviceCollection = store.add(createExtensionUnitTestingServices());
				serviceCollection.set(IToolsService, failingService);
				const accessor = serviceCollection.createTestingAccessor();
				const newService = accessor.get(IInstantiationService).createInstance(ClaudeToolPermissionService);

				const result = await newService.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, createMockContext());

				expect(result.behavior).toBe('deny');
				if (result.behavior === 'deny') {
					expect(result.message).toBe('Failed to show plan confirmation');
				}
			});

			it('handles missing plan gracefully', async () => {
				mockToolsService.setOptionsConfirmationResult('Approve');
				const context = createMockContext();

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, {}, context);

				expect(result.behavior).toBe('allow');
				const input = mockToolsService.invokeToolCalls[0].input as { message: string };
				expect(input.message).toContain('');
			});
		});

		describe('error handling', () => {
			it('denies when confirmation tool throws', async () => {
				// Create a mock that throws
				const failingService = new class extends MockToolsService {
					override async invokeTool(): Promise<vscode.LanguageModelToolResult2> {
						throw new Error('Confirmation failed');
					}
				}();

				const serviceCollection = store.add(createExtensionUnitTestingServices());
				serviceCollection.set(IToolsService, failingService);
				const accessor = serviceCollection.createTestingAccessor();
				const newInstantiationService = accessor.get(IInstantiationService);
				const newService = newInstantiationService.createInstance(ClaudeToolPermissionService);

				const result = await newService.canUseTool(ClaudeToolNames.Glob, {}, createMockContext());

				expect(result.behavior).toBe('deny');
			});

			it('denies when confirmation returns empty content', async () => {
				const emptyService = new class extends MockToolsService {
					override async invokeTool(): Promise<vscode.LanguageModelToolResult2> {
						return { content: [] };
					}
				}();

				const serviceCollection = store.add(createExtensionUnitTestingServices());
				serviceCollection.set(IToolsService, emptyService);
				const accessor = serviceCollection.createTestingAccessor();
				const newInstantiationService = accessor.get(IInstantiationService);
				const newService = newInstantiationService.createInstance(ClaudeToolPermissionService);

				const result = await newService.canUseTool(ClaudeToolNames.Glob, {}, createMockContext());

				expect(result.behavior).toBe('deny');
			});
		});
	});
});
