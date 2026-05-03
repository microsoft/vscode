/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../../platform/filesystem/common/fileTypes';
import { MockFileSystemService } from '../../../../../platform/filesystem/node/test/mockFileSystemService';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { constObservable, IObservable } from '../../../../../util/vs/base/common/observableInternal';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { URI } from '../../../../../util/vs/base/common/uri';
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
	private _reviewPlanResult: { rejected: boolean; action?: string; feedback?: string } | undefined;
	private _invokeToolCalls: Array<{ name: string; input: unknown }> = [];

	setConfirmationResult(result: 'yes' | 'no'): void {
		this._confirmationResult = result;
	}

	setOptionsConfirmationResult(result: string | undefined): void {
		this._optionsConfirmationResult = result;
	}

	setReviewPlanResult(result: { rejected: boolean; action?: string; actionId?: string; feedback?: string } | undefined): void {
		this._reviewPlanResult = result;
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

		if (name === ToolName.CoreReviewPlan) {
			return {
				content: this._reviewPlanResult !== undefined
					? [new LanguageModelTextPart(JSON.stringify(this._reviewPlanResult))]
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

			it('invokes CoreReviewPlan with Approve and Approve-and-bypass actions', async () => {
				mockToolsService.setReviewPlanResult({ rejected: false, actionId: 'approve', action: 'Approve' });
				const context = createMockContext();

				await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, context);

				expect(mockToolsService.invokeToolCalls.length).toBe(1);
				expect(mockToolsService.invokeToolCalls[0].name).toBe(ToolName.CoreReviewPlan);
				const input = mockToolsService.invokeToolCalls[0].input as {
					content: string;
					actions: Array<{ id?: string; label: string; default?: boolean; permissionLevel?: string }>;
					canProvideFeedback: boolean;
				};
				expect(input.content).toContain('Step 1: Do something');
				expect(input.canProvideFeedback).toBe(true);
				expect(input.actions.map(a => a.id)).toEqual(['approve', 'approveBypass']);
				expect(input.actions[1].permissionLevel).toBe('autopilot');
			});

			it('allows when user picks Approve', async () => {
				mockToolsService.setReviewPlanResult({ rejected: false, actionId: 'approve', action: 'Approve' });

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, createMockContext());

				expect(result.behavior).toBe('allow');
				if (result.behavior === 'allow') {
					expect(result.updatedInput).toEqual(exitPlanModeInput);
					expect(result.updatedPermissions).toBeUndefined();
				}
			});

			it('allows and switches to bypassPermissions when user picks Approve & Bypass Permissions', async () => {
				mockToolsService.setReviewPlanResult({ rejected: false, actionId: 'approveBypass', action: 'Approve & Bypass Permissions' });

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, createMockContext());

				expect(result.behavior).toBe('allow');
				if (result.behavior === 'allow') {
					expect(result.updatedPermissions).toEqual([{
						type: 'setMode',
						mode: 'bypassPermissions',
						destination: 'session',
					}]);
				}
			});

			it('still bypasses when user picks Approve & Bypass with feedback (feedback is dropped)', async () => {
				mockToolsService.setReviewPlanResult({
					rejected: false,
					actionId: 'approveBypass',
					action: 'Approve & Bypass Permissions',
					feedback: 'small nit, looks great',
				});

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, createMockContext());

				expect(result.behavior).toBe('allow');
				if (result.behavior === 'allow') {
					expect(result.updatedPermissions?.[0]).toMatchObject({ type: 'setMode', mode: 'bypassPermissions' });
				}
			});

			it('denies when user rejects without feedback', async () => {
				mockToolsService.setReviewPlanResult({ rejected: true });

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, createMockContext());

				expect(result.behavior).toBe('deny');
				if (result.behavior === 'deny') {
					expect(result.message).toContain('declined');
				}
			});

			it('denies and surfaces feedback when user rejects with feedback', async () => {
				mockToolsService.setReviewPlanResult({ rejected: true, feedback: 'Please cover edge cases' });

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, createMockContext());

				expect(result.behavior).toBe('deny');
				if (result.behavior === 'deny') {
					expect(result.message).toContain('rejected');
					expect(result.message).toContain('Please cover edge cases');
				}
			});

			it('treats Approve + feedback as deny so Claude revises the plan', async () => {
				mockToolsService.setReviewPlanResult({
					rejected: false,
					actionId: 'approve',
					action: 'Approve',
					feedback: 'Please also add tests',
				});

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, createMockContext());

				expect(result.behavior).toBe('deny');
				if (result.behavior === 'deny') {
					expect(result.message).toContain('Please also add tests');
				}
			});

			it('denies when review plan tool returns no content', async () => {
				mockToolsService.setReviewPlanResult(undefined);

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, exitPlanModeInput, createMockContext());

				expect(result.behavior).toBe('deny');
			});

			it('denies with distinct message when tool invocation throws', async () => {
				const failingService = new class extends MockToolsService {
					override async invokeTool(name: string): Promise<vscode.LanguageModelToolResult2> {
						if (name === ToolName.CoreReviewPlan) {
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
					expect(result.message).toBe('Failed to show plan review.');
				}
			});

			it('handles missing plan gracefully', async () => {
				mockToolsService.setReviewPlanResult({ rejected: false, actionId: 'approve', action: 'Approve' });

				const result = await service.canUseTool(ClaudeToolNames.ExitPlanMode, {}, createMockContext());

				expect(result.behavior).toBe('allow');
				const input = mockToolsService.invokeToolCalls[0].input as { content: string };
				expect(input.content).toBe('');
			});

			describe('plan URI resolution', () => {
				const planContent = 'Step 1: Do something\nStep 2: Do another thing';
				// Matches NullNativeEnvService.userHome.
				const planDir = URI.file('/home/testuser/.claude/plans');

				async function setupWithFs(setupFs: (fs: MockFileSystemService) => void): Promise<{
					mockFs: MockFileSystemService;
					mockTools: MockToolsService;
					svc: ClaudeToolPermissionService;
				}> {
					const collection = store.add(createExtensionUnitTestingServices());
					const mockFs = new MockFileSystemService();
					setupFs(mockFs);
					collection.set(IFileSystemService, mockFs);
					const mockTools = new MockToolsService();
					mockTools.setReviewPlanResult({ rejected: false, actionId: 'approve', action: 'Approve' });
					collection.set(IToolsService, mockTools);
					const accessor = collection.createTestingAccessor();
					const svc = accessor.get(IInstantiationService).createInstance(ClaudeToolPermissionService);
					return { mockFs, mockTools, svc };
				}

				function getPlanArg(mockTools: MockToolsService): string | undefined {
					const input = mockTools.invokeToolCalls[0].input as { plan?: string };
					return input.plan;
				}

				it('attaches plan URI when an exact content match is found', async () => {
					const matching = URI.joinPath(planDir, 'matching.md');
					const { mockTools, svc } = await setupWithFs(fs => {
						fs.mockDirectory(planDir, [['matching.md', FileType.File], ['stale.md', FileType.File]]);
						// `matching.md` was just written; `stale.md` is older.
						fs.mockFile(matching, planContent, 2000);
						fs.mockFile(URI.joinPath(planDir, 'stale.md'), 'unrelated content', 1000);
					});

					await svc.canUseTool(ClaudeToolNames.ExitPlanMode, { plan: planContent }, createMockContext());

					expect(getPlanArg(mockTools)).toBe(matching.toString());
				});

				it('omits plan URI when the newest file does not match (no fallback scan)', async () => {
					const matching = URI.joinPath(planDir, 'matching.md');
					const { mockTools, svc } = await setupWithFs(fs => {
						fs.mockDirectory(planDir, [['matching.md', FileType.File], ['unrelated.md', FileType.File]]);
						// `unrelated.md` is the newest, but its content does
						// not match — we deliberately do not fall through to
						// older candidates.
						fs.mockFile(matching, planContent, 1000);
						fs.mockFile(URI.joinPath(planDir, 'unrelated.md'), 'unrelated content', 2000);
					});

					await svc.canUseTool(ClaudeToolNames.ExitPlanMode, { plan: planContent }, createMockContext());

					expect(getPlanArg(mockTools)).toBeUndefined();
				});

				it('omits plan URI when no file matches', async () => {
					const { mockTools, svc } = await setupWithFs(fs => {
						fs.mockDirectory(planDir, [['old.md', FileType.File]]);
						fs.mockFile(URI.joinPath(planDir, 'old.md'), 'completely different');
					});

					await svc.canUseTool(ClaudeToolNames.ExitPlanMode, { plan: planContent }, createMockContext());

					expect(getPlanArg(mockTools)).toBeUndefined();
				});

				it('omits plan URI when the plans directory is missing', async () => {
					const { mockTools, svc } = await setupWithFs(fs => {
						fs.mockError(planDir, new Error('ENOENT'));
					});

					await svc.canUseTool(ClaudeToolNames.ExitPlanMode, { plan: planContent }, createMockContext());

					expect(getPlanArg(mockTools)).toBeUndefined();
				});

				it('omits plan URI when input.plan is empty', async () => {
					const matching = URI.joinPath(planDir, 'matching.md');
					const { mockTools, svc } = await setupWithFs(fs => {
						fs.mockDirectory(planDir, [['matching.md', FileType.File]]);
						fs.mockFile(matching, '');
					});

					await svc.canUseTool(ClaudeToolNames.ExitPlanMode, { plan: '   ' }, createMockContext());

					expect(getPlanArg(mockTools)).toBeUndefined();
				});

				it('rejects symlinked candidates', async () => {
					const matching = URI.joinPath(planDir, 'matching.md');
					const { mockTools, svc } = await setupWithFs(fs => {
						fs.mockDirectory(planDir, [['matching.md', FileType.File | FileType.SymbolicLink]]);
						fs.mockFile(matching, planContent);
					});

					await svc.canUseTool(ClaudeToolNames.ExitPlanMode, { plan: planContent }, createMockContext());

					// Symlinks should be filtered out; no URI attached.
					expect(getPlanArg(mockTools)).toBeUndefined();
				});

				it('ignores non-.md files', async () => {
					const { mockTools, svc } = await setupWithFs(fs => {
						fs.mockDirectory(planDir, [['matching.txt', FileType.File]]);
						fs.mockFile(URI.joinPath(planDir, 'matching.txt'), planContent);
					});

					await svc.canUseTool(ClaudeToolNames.ExitPlanMode, { plan: planContent }, createMockContext());

					expect(getPlanArg(mockTools)).toBeUndefined();
				});

				it('matches the most recent file first when multiple files have the same content', async () => {
					const oldFile = URI.joinPath(planDir, 'old.md');
					const newFile = URI.joinPath(planDir, 'new.md');
					const { mockTools, svc } = await setupWithFs(fs => {
						fs.mockDirectory(planDir, [['old.md', FileType.File], ['new.md', FileType.File]]);
						fs.mockFile(oldFile, planContent, 1000);
						fs.mockFile(newFile, planContent, 2000);
					});

					await svc.canUseTool(ClaudeToolNames.ExitPlanMode, { plan: planContent }, createMockContext());

					// Newest matching file wins.
					expect(getPlanArg(mockTools)).toBe(newFile.toString());
				});
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
