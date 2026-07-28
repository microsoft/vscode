/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostSessionTitleController } from '../../node/agentHostSessionTitleController.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { MessageKind, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, TurnState, type ResponsePart, type SessionSummary, type ToolCallCompletedState, type Turn } from '../../common/state/sessionState.js';
import { type ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	readonly utilityCalls: { token: string; request: ICopilotUtilityChatCompletionRequest; options?: ICopilotApiServiceRequestOptions }[] = [];
	response = 'Generated title';
	responsePromise: Promise<string> | undefined;
	error: Error | undefined;

	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsStreaming, _options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsNonStreaming, _options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
	messages(): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		throw new Error('not used');
	}
	async countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used'); }
	async models(): Promise<CCAModel[]> { return []; }
	async responses(): Promise<Response> { throw new Error('not used'); }
	async resolveRestrictedTelemetryContext() { return { restrictedTelemetryEnabled: false, trackingId: undefined, telemetryEndpoint: undefined }; }
	async resolveApiEndpoint() { return undefined; }
	async utilityChatCompletion(githubToken: string, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string> {
		this.utilityCalls.push({ token: githubToken, request, options });
		if (this.error) {
			throw this.error;
		}
		if (this.responsePromise) {
			return this.responsePromise;
		}
		return this.response;
	}
}

suite('AgentHostSessionTitleController', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSummary(session: URI, title = ''): SessionSummary {
		return {
			resource: session.toString(),
			provider: 'copilot',
			title,
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
		};
	}

	async function waitForCondition(predicate: () => boolean | Promise<boolean>, message: string): Promise<void> {
		for (let i = 0; i < 20; i++) {
			if (await predicate()) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 5));
		}
		assert.ok(await predicate(), message);
	}

	function setup(copilotApiService = new TestCopilotApiService(), title = '', getGitHubCopilotToken = () => 'gh-token'): {
		controller: AgentHostSessionTitleController;
		stateManager: AgentHostStateManager;
		session: URI;
		db: TestSessionDatabase;
		titleActions: string[];
		copilotApiService: TestCopilotApiService;
	} {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const db = new TestSessionDatabase();
		const session = URI.parse('agenthost-session://copilot/session-title-test');
		stateManager.createSession(createSummary(session, title));
		const titleActions: string[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(e => {
			if (e.action.type === ActionType.SessionTitleChanged) {
				titleActions.push(e.action.title);
			}
		}));
		const controller = disposables.add(new AgentHostSessionTitleController(stateManager, {
			sessionDataService: createSessionDataService(db),
			getGitHubCopilotToken,
			copilotApiService,
		}, new NullLogService()));
		return { controller, stateManager, session, db, titleActions, copilotApiService };
	}

	test('seedTitleFromFirstMessage applies fallback and persists generated title', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = '"Generated title."';
		const { controller, session, db, titleActions } = setup(copilotApiService);

		controller.seedTitleFromFirstMessage(session.toString(), '  Please   explain title generation  ');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		assert.deepStrictEqual({
			titles: titleActions,
			token: copilotApiService.utilityCalls[0]?.token,
			promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some(message => message.content.includes('Please   explain title generation')),
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			titles: ['Please explain title generation', 'Generated title'],
			token: 'gh-token',
			promptIncludesUserText: true,
			persistedTitle: 'Generated title',
		});
	});

	test('seedTitleFromFirstMessage does not clobber a changed title', async () => {
		const copilotApiService = new TestCopilotApiService();
		let resolveTitle!: (title: string) => void;
		copilotApiService.responsePromise = new Promise(resolve => { resolveTitle = resolve; });
		const { controller, stateManager, session, db } = setup(copilotApiService);

		controller.seedTitleFromFirstMessage(session.toString(), 'Create title tests');
		await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'title generation should start');
		stateManager.dispatchServerAction(session.toString(), {
			type: ActionType.SessionTitleChanged,
			title: 'Manual title',
		});
		resolveTitle('Generated title');
		await Promise.resolve();

		assert.deepStrictEqual({
			title: stateManager.getSessionState(session.toString())?.title,
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			title: 'Manual title',
			persistedTitle: undefined,
		});
	});

	test('cancelTitleGeneration cancels delayed generated title application', async () => {
		const copilotApiService = new TestCopilotApiService();
		let resolveTitle!: (title: string) => void;
		copilotApiService.responsePromise = new Promise(resolve => { resolveTitle = resolve; });
		const { controller, stateManager, session, db } = setup(copilotApiService);

		controller.seedTitleFromFirstMessage(session.toString(), 'Investigate title cancellation');
		await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'title generation should start');
		controller.cancelTitleGeneration(session.toString());
		resolveTitle('Generated title');
		await Promise.resolve();

		assert.deepStrictEqual({
			aborted: copilotApiService.utilityCalls[0].options?.signal?.aborted,
			title: stateManager.getSessionState(session.toString())?.title,
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			aborted: true,
			title: 'Investigate title cancellation',
			persistedTitle: undefined,
		});
	});

	test('seedTitleFromFirstMessage skips sessions with an existing title', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db, titleActions } = setup(copilotApiService, 'Forked: Source title');

		controller.seedTitleFromFirstMessage(session.toString(), 'Continue forked session');
		await Promise.resolve();

		assert.deepStrictEqual({
			calls: copilotApiService.utilityCalls.length,
			title: stateManager.getSessionState(session.toString())?.title,
			titles: titleActions,
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			calls: 0,
			title: 'Forked: Source title',
			titles: [],
			persistedTitle: undefined,
		});
	});

	test('seedProvisionalTitle titles the session from the suggestion without generating', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);

		controller.seedProvisionalTitle(session.toString(), 'ls -la');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'ls -la', 'provisional title should be persisted');

		assert.deepStrictEqual({
			title: stateManager.getSessionState(session.toString())?.title,
			titles: titleActions,
			persistedTitle: await db.getMetadata('customTitle'),
			utilityCalls: copilotApiService.utilityCalls.length,
		}, {
			title: 'ls -la',
			titles: ['ls -la'],
			persistedTitle: 'ls -la',
			utilityCalls: 0,
		});
	});

	test('seedProvisionalTitle refreshes a provisional title with a later suggestion', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db } = setup(copilotApiService);

		controller.seedProvisionalTitle(session.toString(), 'ls -la');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'ls -la', 'first provisional title should be persisted');
		controller.seedProvisionalTitle(session.toString(), 'git status');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'git status', 'second provisional title should be persisted');

		assert.deepStrictEqual({
			title: stateManager.getSessionState(session.toString())?.title,
			utilityCalls: copilotApiService.utilityCalls.length,
		}, {
			title: 'git status',
			utilityCalls: 0,
		});
	});

	test('seedProvisionalTitle does not clobber a changed title', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);

		controller.seedProvisionalTitle(session.toString(), 'ls -la');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'ls -la', 'provisional title should be persisted');
		stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: 'Manual title' });
		controller.seedProvisionalTitle(session.toString(), 'git status');
		await Promise.resolve();

		assert.deepStrictEqual({
			title: stateManager.getSessionState(session.toString())?.title,
			titles: titleActions,
		}, {
			title: 'Manual title',
			titles: ['ls -la', 'Manual title'],
		});
	});

	test('seedTitleFromFirstMessage replaces a provisional title with a generated title', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = 'Explain the build';
		const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);

		// A `!command` seeds a provisional title and records a (local) turn.
		controller.seedProvisionalTitle(session.toString(), 'ls -la');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'ls -la', 'provisional title should be persisted');
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn('!ls -la', [])]);

		// The first real request supersedes it with a generated title.
		controller.seedTitleFromFirstMessage(session.toString(), 'Explain how the build works');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Explain the build', 'generated title should replace the provisional title');

		assert.deepStrictEqual({
			title: stateManager.getSessionState(session.toString())?.title,
			titles: titleActions,
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			title: 'Explain the build',
			titles: ['ls -la', 'Explain how the build works', 'Explain the build'],
			persistedTitle: 'Explain the build',
		});
	});

	test('seedTitleFromFirstMessage persists its fallback when replacing a provisional title', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.error = new Error('Title generation unavailable');
		const { controller, stateManager, session, db } = setup(copilotApiService);

		controller.seedProvisionalTitle(session.toString(), 'ls -la');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'ls -la', 'provisional title should be persisted');
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn('!ls -la', [])]);
		controller.seedTitleFromFirstMessage(session.toString(), 'Explain how the build works');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Explain how the build works', 'fallback title should replace the provisional title');

		assert.deepStrictEqual({
			title: stateManager.getSessionState(session.toString())?.title,
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			title: 'Explain how the build works',
			persistedTitle: 'Explain how the build works',
		});
	});

	function textPart(content: string): ResponsePart {
		return { kind: ResponsePartKind.Markdown, id: 'm1', content };
	}

	function reasoningPart(content: string): ResponsePart {
		return { kind: ResponsePartKind.Reasoning, id: 'r1', content };
	}

	function toolCallPart(displayName: string, invocationMessage: string): ResponsePart {
		const toolCall: ToolCallCompletedState = {
			status: ToolCallStatus.Completed,
			toolCallId: 'tc1',
			toolName: 'tool',
			displayName,
			invocationMessage,
			success: true,
			pastTenseMessage: 'done',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		};
		return { kind: ResponsePartKind.ToolCall, toolCall };
	}

	function firstTurn(text: string, responseParts: ResponsePart[]): Turn {
		return {
			id: 'turn-1',
			message: { text, origin: { kind: MessageKind.User } },
			responseParts,
			usage: undefined,
			state: TurnState.Complete,
		};
	}

	async function seedFirstTitle(controller: AgentHostSessionTitleController, copilotApiService: TestCopilotApiService, db: TestSessionDatabase, session: URI, userPrompt: string, title: string): Promise<void> {
		copilotApiService.response = title;
		controller.seedTitleFromFirstMessage(session.toString(), userPrompt);
		await waitForCondition(async () => await db.getMetadata('customTitle') === title, 'first title should be persisted');
	}

	test('refineTitleFromFirstTurn regenerates the title from the first-turn context', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db } = setup(copilotApiService);
		await seedFirstTitle(controller, copilotApiService, db, session, 'Add dark mode toggle', 'First title');

		copilotApiService.response = 'Dark mode setting';
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn('Add dark mode toggle', [textPart('Implemented the toggle in the settings editor.')])]);
		controller.refineTitleFromFirstTurn(session.toString());
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Dark mode setting', 'refined title should be persisted');

		const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
		const userMessage = lastCall.request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			title: stateManager.getSessionState(session.toString())?.title,
			persistedTitle: await db.getMetadata('customTitle'),
			mentionsConversation: userMessage.includes('conversation'),
			includesUserRequest: userMessage.includes('Add dark mode toggle'),
			includesResponse: userMessage.includes('Implemented the toggle in the settings editor.'),
		}, {
			title: 'Dark mode setting',
			persistedTitle: 'Dark mode setting',
			mentionsConversation: true,
			includesUserRequest: true,
			includesResponse: true,
		});
	});

	test('refineTitleFromFirstTurn does not clobber a title changed in the meantime', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db } = setup(copilotApiService);
		await seedFirstTitle(controller, copilotApiService, db, session, 'Add dark mode toggle', 'First title');
		const callsAfterSeed = copilotApiService.utilityCalls.length;

		stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: 'Manual title' });
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn('Add dark mode toggle', [textPart('Implemented the toggle.')])]);
		controller.refineTitleFromFirstTurn(session.toString());
		await Promise.resolve();

		assert.deepStrictEqual({
			calls: copilotApiService.utilityCalls.length,
			title: stateManager.getSessionState(session.toString())?.title,
		}, {
			calls: callsAfterSeed,
			title: 'Manual title',
		});
	});

	test('refineTitleFromFirstTurn ignores tool calls and reasoning, keeping only text parts', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db } = setup(copilotApiService);
		await seedFirstTitle(controller, copilotApiService, db, session, 'Add dark mode toggle', 'First title');

		copilotApiService.response = 'Refined title';
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn('Add dark mode toggle', [
			reasoningPart('Thinking about THINKING_MARKER the approach'),
			toolCallPart('SearchTool', 'searched the workspace TOOL_MARKER'),
			textPart('Added the toggle TEXT_MARKER to settings.'),
		])]);
		controller.refineTitleFromFirstTurn(session.toString());
		await waitForCondition(() => copilotApiService.utilityCalls.length >= 2, 'refine should issue a utility call');

		const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
		const userMessage = lastCall.request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			includesText: userMessage.includes('TEXT_MARKER'),
			excludesReasoning: !userMessage.includes('THINKING_MARKER'),
			excludesToolCall: !userMessage.includes('TOOL_MARKER') && !userMessage.includes('SearchTool'),
		}, {
			includesText: true,
			excludesReasoning: true,
			excludesToolCall: true,
		});
	});

	test('refineTitleFromFirstTurn truncates the middle of an oversized text response', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db } = setup(copilotApiService);
		await seedFirstTitle(controller, copilotApiService, db, session, 'Add dark mode toggle', 'First title');

		copilotApiService.response = 'Refined title';
		const hugeResponse = 'A'.repeat(15000) + ' MIDDLE_MARKER ' + 'B'.repeat(15000);
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn('Add dark mode toggle', [textPart(hugeResponse)])]);
		controller.refineTitleFromFirstTurn(session.toString());
		await waitForCondition(() => copilotApiService.utilityCalls.length >= 2, 'refine should issue a utility call');

		const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
		const userMessage = lastCall.request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			withinBudget: userMessage.length <= 20200,
			middleTruncated: userMessage.includes('...') && !userMessage.includes('MIDDLE_MARKER'),
			includesUserRequest: userMessage.includes('Add dark mode toggle'),
			keepsHeadAndTail: userMessage.includes('AAAA') && userMessage.includes('BBBB'),
		}, {
			withinBudget: true,
			middleTruncated: true,
			includesUserRequest: true,
			keepsHeadAndTail: true,
		});
	});

	function turn(id: string, text: string, responseParts: ResponsePart[]): Turn {
		return {
			id,
			message: { text, origin: { kind: MessageKind.User } },
			responseParts,
			usage: undefined,
			state: TurnState.Complete,
		};
	}

	test('generateForkedTitle replaces the inherited title using the whole forked conversation', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = 'Compaction strategy';
		const { controller, stateManager, session, db, titleActions } = setup(copilotApiService, 'Forked: Source title');

		stateManager.seedDefaultChatTurns(session.toString(), [
			turn('turn-1', 'Add dark mode toggle', [textPart('Implemented the toggle in settings.')]),
			turn('turn-2', 'Now compact the history', [textPart('Summarized earlier turns.')]),
		]);
		const turns = stateManager.getSessionState(session.toString())!.turns;
		controller.generateForkedTitle(session.toString(), undefined, turns, 'Forked: Source title', 'Source title');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Compaction strategy', 'forked title should be persisted');

		const userMessage = copilotApiService.utilityCalls[0]?.request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			titles: titleActions,
			persistedTitle: await db.getMetadata('customTitle'),
			mentionsConversation: userMessage.includes('conversation'),
			framesAsBranch: userMessage.includes('branched from an earlier chat titled "Source title"'),
			includesFirstTurn: userMessage.includes('Add dark mode toggle') && userMessage.includes('Implemented the toggle in settings.'),
			includesSecondTurn: userMessage.includes('Now compact the history') && userMessage.includes('Summarized earlier turns.'),
		}, {
			titles: ['Compaction strategy'],
			persistedTitle: 'Compaction strategy',
			mentionsConversation: true,
			framesAsBranch: true,
			includesFirstTurn: true,
			includesSecondTurn: true,
		});
	});

	test('generateForkedTitle does not clobber a title changed during generation', async () => {
		const copilotApiService = new TestCopilotApiService();
		let resolveTitle!: (title: string) => void;
		copilotApiService.responsePromise = new Promise(resolve => { resolveTitle = resolve; });
		const { controller, stateManager, session, db } = setup(copilotApiService, 'Forked: Source title');

		stateManager.seedDefaultChatTurns(session.toString(), [turn('turn-1', 'Add dark mode toggle', [textPart('Done.')])]);
		controller.generateForkedTitle(session.toString(), undefined, stateManager.getSessionState(session.toString())!.turns, 'Forked: Source title');
		await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'forked title generation should start');
		stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: 'Manual title' });
		resolveTitle('Generated title');
		await Promise.resolve();

		assert.deepStrictEqual({
			title: stateManager.getSessionState(session.toString())?.title,
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			title: 'Manual title',
			persistedTitle: undefined,
		});
	});
});
