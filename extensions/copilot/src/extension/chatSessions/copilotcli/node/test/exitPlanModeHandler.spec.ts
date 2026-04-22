/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Session } from '@github/copilot/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { CancellationToken, ChatParticipantToolToken, TextDocumentChangeEvent } from 'vscode';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { NullWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { constObservable, IObservable } from '../../../../../util/vs/base/common/observableInternal';
import { URI } from '../../../../../util/vs/base/common/uri';
import { LanguageModelTextPart } from '../../../../../vscodeTypes';
import { ToolName } from '../../../../tools/common/toolNames';
import { ICopilotTool } from '../../../../tools/common/toolsRegistry';
import { IOnWillInvokeToolEvent, IToolsService, IToolValidationResult } from '../../../../tools/common/toolsService';
import { handleExitPlanMode, type ExitPlanModeEventData, type ExitPlanModeResponse } from '../exitPlanModeHandler';

// ---------- helpers / mocks ----------

function makeEvent(overrides: Partial<ExitPlanModeEventData> = {}): ExitPlanModeEventData {
	return {
		requestId: 'req-1',
		summary: 'Test plan summary',
		actions: ['autopilot', 'interactive', 'exit_only'],
		recommendedAction: 'autopilot',
		...overrides,
	};
}

class StubSession {
	public writtenPlans: string[] = [];
	constructor(public planPath: string | undefined = '/session/plan.md') { }
	getPlanPath(): string | undefined { return this.planPath; }
	async writePlan(content: string): Promise<void> { this.writtenPlans.push(content); }
}

class FakeToolsService implements IToolsService {
	readonly _serviceBrand: undefined;

	private readonly _onWillInvokeTool = new Emitter<IOnWillInvokeToolEvent>();
	readonly onWillInvokeTool = this._onWillInvokeTool.event;
	readonly tools: ReadonlyArray<vscode.LanguageModelToolInformation> = [];
	readonly copilotTools = new Map<ToolName, ICopilotTool<unknown>>();
	modelSpecificTools: IObservable<{ definition: vscode.LanguageModelToolDefinition; tool: ICopilotTool<unknown> }[]> = constObservable([]);

	private _result: vscode.LanguageModelToolResult2 = { content: [] };
	invokeToolCalls: Array<{ name: string; input: unknown }> = [];

	setResult(answer: { action?: string; rejected: boolean; feedback?: string }): void {
		this._result = {
			content: [new LanguageModelTextPart(JSON.stringify(answer))]
		};
	}

	setEmptyResult(): void {
		this._result = { content: [] };
	}

	async invokeTool(name: string, options: vscode.LanguageModelToolInvocationOptions<unknown>): Promise<vscode.LanguageModelToolResult2> {
		this.invokeToolCalls.push({ name, input: options.input });
		return this._result;
	}

	invokeToolWithEndpoint(name: string, options: vscode.LanguageModelToolInvocationOptions<unknown>, _endpoint: IChatEndpoint | undefined): Thenable<vscode.LanguageModelToolResult2> {
		return this.invokeTool(name, options);
	}

	getCopilotTool(): ICopilotTool<unknown> | undefined { return undefined; }
	getTool(): vscode.LanguageModelToolInformation | undefined { return undefined; }
	getToolByToolReferenceName(): vscode.LanguageModelToolInformation | undefined { return undefined; }
	validateToolInput(): IToolValidationResult { return { inputObj: {} }; }
	validateToolName(): string | undefined { return undefined; }
	getEnabledTools(): vscode.LanguageModelToolInformation[] { return []; }
}

function stubLogService() {
	return {
		_serviceBrand: undefined,
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	} as any;
}

const FAKE_TOKEN = {} as ChatParticipantToolToken;
const CANCEL_TOKEN: CancellationToken = { isCancellationRequested: false, onCancellationRequested: new Emitter<void>().event };

// ---------- tests ----------

describe('handleExitPlanMode', () => {
	const disposables = new DisposableStore();
	let session: StubSession;
	let logService: ReturnType<typeof stubLogService>;
	let workspaceService: NullWorkspaceService;
	let toolService: FakeToolsService;

	beforeEach(() => {
		session = new StubSession();
		logService = stubLogService();
		workspaceService = disposables.add(new NullWorkspaceService());
		toolService = new FakeToolsService();
	});

	afterEach(() => {
		disposables.clear();
	});

	// ---- autopilot ----

	describe('autopilot mode', () => {
		it('auto-approves with recommended action when it is available', async () => {
			const event = makeEvent({ actions: ['autopilot', 'interactive', 'exit_only'], recommendedAction: 'interactive' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'interactive', autoApproveEdits: true });
		});

		it('falls back to first available action in priority order when no recommended', async () => {
			const event = makeEvent({ actions: ['interactive', 'exit_only'], recommendedAction: '' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'interactive', autoApproveEdits: undefined });
		});

		it('prefers autopilot over other actions in fallback order', async () => {
			const event = makeEvent({ actions: ['exit_only', 'autopilot'], recommendedAction: '' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'autopilot', autoApproveEdits: true });
		});

		it('prefers autopilot_fleet second in fallback order', async () => {
			const event = makeEvent({ actions: ['exit_only', 'autopilot_fleet', 'interactive'], recommendedAction: '' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'autopilot_fleet', autoApproveEdits: true });
		});

		it('returns approved with autoApproveEdits when no actions available', async () => {
			const event = makeEvent({ actions: [], recommendedAction: '' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, autoApproveEdits: true });
		});

		it('sets autoApproveEdits only for autopilot and autopilot_fleet', async () => {
			const event1 = makeEvent({ actions: ['exit_only'], recommendedAction: '' });
			const r1 = await handleExitPlanMode(event1, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(r1.autoApproveEdits).toBeUndefined();

			const event2 = makeEvent({ actions: ['interactive'], recommendedAction: '' });
			const r2 = await handleExitPlanMode(event2, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(r2.autoApproveEdits).toBeUndefined();
		});
	});

	// ---- no tool invocation token ----

	describe('missing toolInvocationToken', () => {
		it('returns not approved when no token', async () => {
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', undefined, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: false });
		});
	});

	// ---- interactive mode ----

	describe('interactive mode', () => {
		it('returns not approved when tool returns empty result', async () => {
			toolService.setEmptyResult();
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: false });
		});

		it('returns not approved when user rejects the plan', async () => {
			toolService.setResult({ rejected: true });
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: false });
		});

		it('returns feedback when user provides freeform text', async () => {
			toolService.setResult({ rejected: false, feedback: 'I want changes to the plan' });
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: false, feedback: 'I want changes to the plan', selectedAction: undefined });
		});

		it('returns feedback with selected action', async () => {
			toolService.setResult({ rejected: false, action: 'interactive', feedback: 'needs more detail' });
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: false, feedback: 'needs more detail', selectedAction: 'interactive' });
		});

		it('returns approved with selected action mapped from label', async () => {
			toolService.setResult({ rejected: false, action: 'Autopilot' });
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'autopilot', autoApproveEdits: undefined });
		});

		it('maps "Approve and exit" label to exit_only', async () => {
			toolService.setResult({ rejected: false, action: 'Approve' });
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result.selectedAction).toBe('exit_only');
		});

		it('sets autoApproveEdits when permissionLevel is autoApprove', async () => {
			toolService.setResult({ rejected: false, action: 'Interactive' });
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autoApprove', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result.autoApproveEdits).toBe(true);
		});

		it('does not set autoApproveEdits when permissionLevel is interactive', async () => {
			toolService.setResult({ rejected: false, action: 'Interactive' });
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			expect(result.autoApproveEdits).toBeUndefined();
		});

		it('passes actions with labels and recommended flag to tool', async () => {
			toolService.setResult({ rejected: false, action: 'Interactive' });
			const event = makeEvent({ actions: ['autopilot', 'exit_only'], recommendedAction: 'exit_only' });
			await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			const call = toolService.invokeToolCalls[0];
			expect(call.name).toBe('vscode_reviewPlan');
			const input = call.input as any;
			expect(input.actions).toHaveLength(2);
			expect(input.actions[0]).toEqual(expect.objectContaining({ label: 'Autopilot', default: false }));
			expect(input.actions[1]).toEqual(expect.objectContaining({ label: 'Approve', default: true }));
		});

		it('includes plan path in tool input when plan path exists', async () => {
			session.planPath = '/session/plan.md';
			toolService.setResult({ rejected: false, action: 'Interactive' });
			const event = makeEvent();
			await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			const input = toolService.invokeToolCalls[0].input as any;
			expect(input.plan).toBe('file:///session/plan.md');
		});

		it('passes undefined plan when no plan path', async () => {
			session.planPath = undefined;
			toolService.setResult({ rejected: false, action: 'Interactive' });
			const event = makeEvent();
			await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			const input = toolService.invokeToolCalls[0].input as any;
			expect(input.plan).toBeUndefined();
		});

		it('enables feedback via canProvideFeedback', async () => {
			toolService.setEmptyResult();
			const event = makeEvent();
			await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, toolService, CANCEL_TOKEN);
			const input = toolService.invokeToolCalls[0].input as any;
			expect(input.canProvideFeedback).toBe(true);
		});
	});

	// ---- plan file monitoring ----

	describe('plan file monitoring', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('syncs saved plan changes to SDK session', async () => {
			const planUri = URI.file('/session/plan.md');
			const savedDoc = {
				uri: planUri,
				isDirty: false,
				getText: () => 'updated plan content',
			};

			// Set up a deferred tool invocation so we can fire document changes while waiting
			let resolveInvokeTool!: (result: vscode.LanguageModelToolResult2) => void;
			toolService.invokeTool = ((_name: string, _options: vscode.LanguageModelToolInvocationOptions<unknown>) => {
				return new Promise<vscode.LanguageModelToolResult2>(resolve => { resolveInvokeTool = resolve; });
			});

			const promise = handleExitPlanMode(
				makeEvent(), session as unknown as Session, 'interactive', FAKE_TOKEN,
				workspaceService, logService, toolService, CANCEL_TOKEN,
			);

			// Simulate a saved document change
			workspaceService.didChangeTextDocumentEmitter.fire({
				document: savedDoc,
				contentChanges: [{ range: {} as any, rangeOffset: 0, rangeLength: 0, text: 'x' }],
			} as unknown as TextDocumentChangeEvent);

			// Allow debouncer to fire
			await vi.advanceTimersByTimeAsync(150);

			expect(session.writtenPlans).toEqual(['updated plan content']);

			// Resolve the tool invocation to complete the handler (empty result → not approved)
			resolveInvokeTool({ content: [] });
			const result = await promise;
			expect(result.approved).toBe(false);
		});

		it('does not sync when document is still dirty', async () => {
			const planUri = URI.file('/session/plan.md');
			const dirtyDoc = {
				uri: planUri,
				isDirty: true,
				getText: () => 'dirty content',
			};

			let resolveInvokeTool!: (result: vscode.LanguageModelToolResult2) => void;
			toolService.invokeTool = ((_name: string, _options: vscode.LanguageModelToolInvocationOptions<unknown>) => {
				return new Promise<vscode.LanguageModelToolResult2>(resolve => { resolveInvokeTool = resolve; });
			});

			const promise = handleExitPlanMode(
				makeEvent(), session as unknown as Session, 'interactive', FAKE_TOKEN,
				workspaceService, logService, toolService, CANCEL_TOKEN,
			);

			workspaceService.didChangeTextDocumentEmitter.fire({
				document: dirtyDoc,
				contentChanges: [{ range: {} as any, rangeOffset: 0, rangeLength: 0, text: 'x' }],
			} as unknown as TextDocumentChangeEvent);

			await vi.advanceTimersByTimeAsync(150);

			expect(session.writtenPlans).toEqual([]);

			resolveInvokeTool({ content: [] });
			await promise;
		});

		it('ignores document changes for unrelated files', async () => {
			const otherUri = URI.file('/other/file.md');
			const otherDoc = {
				uri: otherUri,
				isDirty: false,
				getText: () => 'other content',
			};

			let resolveInvokeTool!: (result: vscode.LanguageModelToolResult2) => void;
			toolService.invokeTool = ((_name: string, _options: vscode.LanguageModelToolInvocationOptions<unknown>) => {
				return new Promise<vscode.LanguageModelToolResult2>(resolve => { resolveInvokeTool = resolve; });
			});

			const promise = handleExitPlanMode(
				makeEvent(), session as unknown as Session, 'interactive', FAKE_TOKEN,
				workspaceService, logService, toolService, CANCEL_TOKEN,
			);

			workspaceService.didChangeTextDocumentEmitter.fire({
				document: otherDoc,
				contentChanges: [{ range: {} as any, rangeOffset: 0, rangeLength: 0, text: 'x' }],
			} as unknown as TextDocumentChangeEvent);

			await vi.advanceTimersByTimeAsync(150);

			expect(session.writtenPlans).toEqual([]);

			resolveInvokeTool({ content: [] });
			await promise;
		});

		it('does not create monitor when no plan path', async () => {
			session.planPath = undefined;
			toolService.setResult({ rejected: false, action: 'Interactive' });

			const result = await handleExitPlanMode(
				makeEvent(), session as unknown as Session, 'interactive', FAKE_TOKEN,
				workspaceService, logService, toolService, CANCEL_TOKEN,
			);

			// Should complete without errors even with no plan path
			expect(result.approved).toBe(true);
		});
	});
});
