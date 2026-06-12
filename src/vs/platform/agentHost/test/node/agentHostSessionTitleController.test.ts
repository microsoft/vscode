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
import { SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
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
			createdAt: 1,
			modifiedAt: 1,
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
			title: stateManager.getSessionState(session.toString())?.summary.title,
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
			title: stateManager.getSessionState(session.toString())?.summary.title,
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
			title: stateManager.getSessionState(session.toString())?.summary.title,
			titles: titleActions,
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			calls: 0,
			title: 'Forked: Source title',
			titles: [],
			persistedTitle: undefined,
		});
	});
});
