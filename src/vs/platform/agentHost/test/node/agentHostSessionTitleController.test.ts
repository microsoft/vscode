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
import { AH_META_TITLE_SOURCE_DB_KEY, MessageKind, ResponsePartKind, SessionStatus, TurnState, readSessionTitleSource, readSessionWorkspaceless, withSessionWorkspaceless, type ResponsePart, type SessionSummary, type Turn } from '../../common/state/sessionState.js';
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

	function titleSourceOf(stateManager: AgentHostStateManager, session: URI) {
		return readSessionTitleSource(stateManager.getSessionState(session.toString())?._meta);
	}

	test('seedTitleFromFirstMessage applies + persists the first-message fallback with auto provenance (no utility call)', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);

		controller.seedTitleFromFirstMessage(session.toString(), '  Please   explain title generation  ');
		await waitForCondition(async () => await db.getMetadata(AH_META_TITLE_SOURCE_DB_KEY) === 'auto', 'title source should be persisted');

		assert.deepStrictEqual({
			titles: titleActions,
			title: stateManager.getSessionState(session.toString())?.title,
			utilityCalls: copilotApiService.utilityCalls.length,
			persistedTitle: await db.getMetadata('customTitle'),
			persistedSource: await db.getMetadata(AH_META_TITLE_SOURCE_DB_KEY),
			titleSource: titleSourceOf(stateManager, session),
			needsRename: controller.needsRename(session.toString()),
		}, {
			titles: ['Please explain title generation'],
			title: 'Please explain title generation',
			utilityCalls: 0,
			persistedTitle: 'Please explain title generation',
			persistedSource: 'auto',
			titleSource: 'auto',
			needsRename: true,
		});
	});

	test('seedTitleFromFirstMessage skips sessions with an existing title (e.g. forks)', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db, titleActions } = setup(copilotApiService, 'Forked: Source title');

		controller.seedTitleFromFirstMessage(session.toString(), 'Continue forked session');
		await Promise.resolve();

		assert.deepStrictEqual({
			calls: copilotApiService.utilityCalls.length,
			title: stateManager.getSessionState(session.toString())?.title,
			titles: titleActions,
			persistedTitle: await db.getMetadata('customTitle'),
			persistedSource: await db.getMetadata(AH_META_TITLE_SOURCE_DB_KEY),
		}, {
			calls: 0,
			title: 'Forked: Source title',
			titles: [],
			persistedTitle: undefined,
			persistedSource: undefined,
		});
	});

	test('applyAgentRename renames the session with agent provenance and persists both', async () => {
		const { controller, stateManager, session, db, titleActions } = setup();
		controller.seedTitleFromFirstMessage(session.toString(), 'Fix the login bug');
		await waitForCondition(async () => await db.getMetadata(AH_META_TITLE_SOURCE_DB_KEY) === 'auto', 'seed should persist');

		const result = controller.applyAgentRename(session.toString(), '  "Login validation fix"  ');
		await waitForCondition(async () => await db.getMetadata(AH_META_TITLE_SOURCE_DB_KEY) === 'agent', 'rename should persist agent provenance');

		assert.deepStrictEqual({
			result,
			title: stateManager.getSessionState(session.toString())?.title,
			lastDispatchedTitle: titleActions[titleActions.length - 1],
			persistedTitle: await db.getMetadata('customTitle'),
			persistedSource: await db.getMetadata(AH_META_TITLE_SOURCE_DB_KEY),
			titleSource: titleSourceOf(stateManager, session),
			needsRename: controller.needsRename(session.toString()),
		}, {
			result: { status: 'renamed', title: 'Login validation fix' },
			title: 'Login validation fix',
			lastDispatchedTitle: 'Login validation fix',
			persistedTitle: 'Login validation fix',
			persistedSource: 'agent',
			titleSource: 'agent',
			needsRename: false,
		});
	});

	test('applyAgentRename is skipped when the user already named the session', async () => {
		const { controller, stateManager, session } = setup();
		controller.seedTitleFromFirstMessage(session.toString(), 'Fix the login bug');
		controller.markUserSessionTitle(session.toString());

		const result = controller.applyAgentRename(session.toString(), 'Agent chosen title');

		assert.deepStrictEqual({
			result,
			title: stateManager.getSessionState(session.toString())?.title,
			titleSource: titleSourceOf(stateManager, session),
			needsRename: controller.needsRename(session.toString()),
		}, {
			result: { status: 'skippedUserNamed' },
			title: 'Fix the login bug',
			titleSource: 'user',
			needsRename: false,
		});
	});

	test('applyAgentRename rejects an empty/punctuation-only title', () => {
		const { controller, stateManager, session } = setup();
		controller.seedTitleFromFirstMessage(session.toString(), 'Fix the login bug');

		const result = controller.applyAgentRename(session.toString(), '   ...   ');

		assert.deepStrictEqual({
			result,
			title: stateManager.getSessionState(session.toString())?.title,
			titleSource: titleSourceOf(stateManager, session),
		}, {
			result: { status: 'invalid' },
			title: 'Fix the login bug',
			titleSource: 'auto',
		});
	});

	test('markUserSessionTitle sets user provenance and preserves other _meta', async () => {
		const { controller, stateManager, session, db } = setup();
		// Seed an unrelated `_meta` flag to prove the title-source merge preserves it.
		stateManager.setSessionMeta(session.toString(), withSessionWorkspaceless(undefined, true));
		controller.seedTitleFromFirstMessage(session.toString(), 'Fix the login bug');

		controller.markUserSessionTitle(session.toString());
		await waitForCondition(async () => await db.getMetadata(AH_META_TITLE_SOURCE_DB_KEY) === 'user', 'user provenance should persist');

		const meta = stateManager.getSessionState(session.toString())?._meta;
		assert.deepStrictEqual({
			titleSource: readSessionTitleSource(meta),
			workspaceless: readSessionWorkspaceless(meta),
			persistedSource: await db.getMetadata(AH_META_TITLE_SOURCE_DB_KEY),
			needsRename: controller.needsRename(session.toString()),
		}, {
			titleSource: 'user',
			workspaceless: true,
			persistedSource: 'user',
			needsRename: false,
		});
	});

	test('needsRename tracks the title provenance', () => {
		const { controller, session } = setup();

		const beforeSeed = controller.needsRename(session.toString());
		controller.seedTitleFromFirstMessage(session.toString(), 'Fix the login bug');
		const afterSeed = controller.needsRename(session.toString());
		controller.applyAgentRename(session.toString(), 'Login fix');
		const afterAgent = controller.needsRename(session.toString());

		assert.deepStrictEqual(
			{ beforeSeed, afterSeed, afterAgent },
			{ beforeSeed: true, afterSeed: true, afterAgent: false },
		);
	});

	function textPart(content: string): ResponsePart {
		return { kind: ResponsePartKind.Markdown, id: 'm1', content };
	}

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
			titleSource: titleSourceOf(stateManager, session),
			needsRename: controller.needsRename(session.toString()),
			mentionsConversation: userMessage.includes('conversation'),
			framesAsBranch: userMessage.includes('branched from an earlier chat titled "Source title"'),
			includesFirstTurn: userMessage.includes('Add dark mode toggle') && userMessage.includes('Implemented the toggle in settings.'),
			includesSecondTurn: userMessage.includes('Now compact the history') && userMessage.includes('Summarized earlier turns.'),
		}, {
			titles: ['Compaction strategy'],
			persistedTitle: 'Compaction strategy',
			titleSource: 'auto',
			needsRename: true,
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

	test('cancelTitleGeneration aborts an in-flight forked-title generation', async () => {
		const copilotApiService = new TestCopilotApiService();
		let resolveTitle!: (title: string) => void;
		copilotApiService.responsePromise = new Promise(resolve => { resolveTitle = resolve; });
		const { controller, stateManager, session, db } = setup(copilotApiService, 'Forked: Source title');

		stateManager.seedDefaultChatTurns(session.toString(), [turn('turn-1', 'Add dark mode toggle', [textPart('Done.')])]);
		controller.generateForkedTitle(session.toString(), undefined, stateManager.getSessionState(session.toString())!.turns, 'Forked: Source title');
		await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'forked title generation should start');

		// Mirrors the dispose path (disposeSession → cancelSessionTitleGeneration
		// → cancelTitleGeneration): the utility request is aborted and no title
		// is applied or persisted.
		controller.cancelTitleGeneration(session.toString());
		resolveTitle('Generated title');
		await Promise.resolve();

		assert.deepStrictEqual({
			aborted: copilotApiService.utilityCalls[0].options?.signal?.aborted,
			title: stateManager.getSessionState(session.toString())?.title,
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			aborted: true,
			title: 'Forked: Source title',
			persistedTitle: undefined,
		});
	});
});
