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
import { buildChatUri, buildDefaultChatUri, MessageKind, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, TurnState, type ResponsePart, type SessionSummary, type ToolCallCompletedState, type Turn } from '../../common/state/sessionState.js';
import { type AutoMergeMethod, type CreatedPullRequest, type GitHubIssueOrPullRequest, type IAgentHostOctoKitService } from '../../node/shared/agentHostOctoKitService.js';
import { type ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import { AGENT_HOST_TITLE_SOURCE_AGENT, AGENT_HOST_TITLE_SOURCE_AUTO, customChatTitleSourceMetadataKey, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
import { sessionServerToolDefinitions } from '../../node/shared/sessionServerTools.js';
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

class TestAgentHostOctoKitService implements IAgentHostOctoKitService {
	declare readonly _serviceBrand: undefined;

	readonly calls: { owner: string; repo: string; number: number; token: string; signal: AbortSignal }[] = [];
	readonly responses = new Map<string, GitHubIssueOrPullRequest | Error>();
	readonly pendingResponses = new Set<string>();

	async createPullRequest(): Promise<CreatedPullRequest> {
		throw new Error('not used');
	}

	async findPullRequestByHeadBranch(): Promise<CreatedPullRequest | undefined> {
		throw new Error('not used');
	}

	async findPullRequestByHeadSha(): Promise<CreatedPullRequest | undefined> {
		throw new Error('not used');
	}

	async getIssueOrPullRequest(owner: string, repo: string, number: number, token: string, signal: AbortSignal): Promise<GitHubIssueOrPullRequest> {
		this.calls.push({ owner, repo, number, token, signal });
		const key = `${owner}/${repo}#${number}`;
		if (this.pendingResponses.has(key)) {
			return new Promise((_resolve, reject) => {
				if (signal.aborted) {
					reject(signal.reason);
					return;
				}
				signal.addEventListener('abort', () => reject(signal.reason), { once: true });
			});
		}
		const response = this.responses.get(key);
		if (response instanceof Error) {
			throw response;
		}
		if (!response) {
			throw new Error('missing test response');
		}
		return response;
	}

	async enablePullRequestAutoMerge(_pullRequestId: string, _mergeMethod: AutoMergeMethod): Promise<void> {
		throw new Error('not used');
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

	function setup(
		copilotApiService = new TestCopilotApiService(),
		title = '',
		getGitHubCopilotToken = () => 'gh-token',
		octoKitService = new TestAgentHostOctoKitService(),
		getGitHubToken = () => 'github-token',
		gitHubContextRequestTimeout?: number,
		getGitHubHost = () => 'github.com',
		activeAgentTitleGeneration = false,
	): {
		controller: AgentHostSessionTitleController;
		stateManager: AgentHostStateManager;
		session: URI;
		db: TestSessionDatabase;
		titleActions: string[];
		copilotApiService: TestCopilotApiService;
		octoKitService: TestAgentHostOctoKitService;
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
			getGitHubToken,
			getGitHubHost,
			gitHubContextRequestTimeout,
			octoKitService,
			copilotApiService,
			isActiveAgentTitleGenerationEnabled: () => activeAgentTitleGeneration,
		}, new NullLogService()));
		return { controller, stateManager, session, db, titleActions, copilotApiService, octoKitService };
	}

	test('active-agent mode completes the word crossing the 40-character fallback target without utility generation', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, session, db, titleActions } = setup(copilotApiService, '', undefined, undefined, undefined, undefined, undefined, true);

		controller.seedTitleFromFirstMessage(session.toString(), 'Investigate why restored Agent Host sessions sometimes lose titles');
		const instruction = await controller.prepareInstructionForAgent(session.toString(), buildDefaultChatUri(session));

		assert.deepStrictEqual(titleActions, ['Investigate why restored Agent Host sessions...']);
		assert.strictEqual(copilotApiService.utilityCalls.length, 0);
		assert.strictEqual(instruction, 'This chat currently has an auto-generated or placeholder name. Before doing any other work or responding to the user, you MUST call the `rename_chat` tool exactly once to give it a short, descriptive title based on the user\'s intent. If the prompt references a pull request or issue link, resolve that link first and use its context when choosing the title. Do not skip this call even if the current name already seems descriptive.');
		await waitForCondition(async () => await db.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY) === AGENT_HOST_TITLE_SOURCE_AUTO, 'auto provenance should be persisted');
	});

	test('active-agent fallback hard-truncates a single oversized word', () => {
		const { controller, session, titleActions } = setup(undefined, '', undefined, undefined, undefined, undefined, undefined, true);

		controller.seedTitleFromFirstMessage(session.toString(), 'x'.repeat(50));

		assert.deepStrictEqual(titleActions, [`${'x'.repeat(37)}...`]);
	});

	test('active-agent fallback hard-caps an oversized token crossing the target', () => {
		const { controller, session, titleActions } = setup(undefined, '', undefined, undefined, undefined, undefined, undefined, true);

		controller.seedTitleFromFirstMessage(session.toString(), `Fix https://example.com/${'x'.repeat(500)}`);

		assert.strictEqual(titleActions[0].length, 40);
		assert.ok(titleActions[0].endsWith('...'));
	});

	test('active-agent fallback omits the ellipsis when the crossing word completes the prompt', () => {
		const { controller, session, titleActions } = setup(undefined, '', undefined, undefined, undefined, undefined, undefined, true);

		controller.seedTitleFromFirstMessage(session.toString(), 'Investigate why restored Agent Host sessions');

		assert.deepStrictEqual(titleActions, ['Investigate why restored Agent Host sessions']);
	});

	test('utility-model mode does not add an active-agent reminder', async () => {
		const { controller, session } = setup();
		controller.seedTitleFromFirstMessage(session.toString(), 'Explain title generation');

		assert.strictEqual(await controller.prepareInstructionForAgent(session.toString(), buildDefaultChatUri(session)), undefined);
	});

	test('materialized server tools override later root setting changes', async () => {
		const enabled = setup(undefined, '', undefined, undefined, undefined, undefined, undefined, false);
		enabled.stateManager.dispatchServerAction(enabled.session.toString(), {
			type: ActionType.SessionServerToolsChanged,
			tools: sessionServerToolDefinitions,
		});
		enabled.controller.seedTitleFromFirstMessage(enabled.session.toString(), 'Use advertised rename tool');

		const disabled = setup(undefined, '', undefined, undefined, undefined, undefined, undefined, true);
		disabled.stateManager.dispatchServerAction(disabled.session.toString(), {
			type: ActionType.SessionServerToolsChanged,
			tools: [],
		});
		disabled.controller.seedTitleFromFirstMessage(disabled.session.toString(), 'Do not use missing rename tool');

		assert.ok((await enabled.controller.prepareInstructionForAgent(enabled.session.toString(), buildDefaultChatUri(enabled.session)))?.includes('`rename_chat`'));
		assert.strictEqual(await disabled.controller.prepareInstructionForAgent(disabled.session.toString(), buildDefaultChatUri(disabled.session)), undefined);
		assert.strictEqual(disabled.copilotApiService.utilityCalls.length, 1);
	});

	test('active-agent mode reminds peer chats and keeps deterministic fork provenance without utility calls', async () => {
		const copilotApiService = new TestCopilotApiService();
		const { controller, stateManager, session, db } = setup(copilotApiService, 'Session title', undefined, undefined, undefined, undefined, undefined, true);
		const chat = buildChatUri(session.toString(), 'peer-1');
		stateManager.addChat(session.toString(), chat, {});
		controller.seedTitleFromFirstMessage(session.toString(), 'Investigate peer chat', chat);

		const instruction = await controller.prepareInstructionForAgent(session.toString(), chat);
		assert.strictEqual(instruction, 'This chat currently has an auto-generated or placeholder name. Before doing any other work or responding to the user, you MUST call the `rename_chat` tool exactly once to give it a short, descriptive title based on the user\'s intent. If the prompt references a pull request or issue link, resolve that link first and use its context when choosing the title. Do not skip this call even if the current name already seems descriptive.');

		controller.generateForkedTitle(session.toString(), undefined, [], 'Forked: Session title', 'Session title');
		assert.strictEqual(copilotApiService.utilityCalls.length, 0);
		await waitForCondition(async () => await db.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY) === AGENT_HOST_TITLE_SOURCE_AUTO, 'fork auto provenance should be persisted');
		await waitForCondition(async () => await db.getMetadata(customChatTitleSourceMetadataKey(chat)) === AGENT_HOST_TITLE_SOURCE_AUTO, 'peer auto provenance should be persisted');
	});

	test('multi-chat default uses its own persisted title provenance after controller recreation', async () => {
		const independentlyRenamed = setup(undefined, 'Session title', undefined, undefined, undefined, undefined, undefined, true);
		const defaultChat = buildDefaultChatUri(independentlyRenamed.session);
		independentlyRenamed.stateManager.addChat(independentlyRenamed.session.toString(), buildChatUri(independentlyRenamed.session.toString(), 'peer'), {});
		await independentlyRenamed.db.setMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AUTO);
		await independentlyRenamed.db.setMetadata(customChatTitleSourceMetadataKey(defaultChat), AGENT_HOST_TITLE_SOURCE_AGENT);

		const independentRenameInstruction = await independentlyRenamed.controller.prepareInstructionForAgent(independentlyRenamed.session.toString(), defaultChat);

		const independentlyAutomatic = setup(undefined, 'Session title', undefined, undefined, undefined, undefined, undefined, true);
		independentlyAutomatic.stateManager.addChat(independentlyAutomatic.session.toString(), buildChatUri(independentlyAutomatic.session.toString(), 'peer'), {});
		await independentlyAutomatic.db.setMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AGENT);
		await independentlyAutomatic.db.setMetadata(customChatTitleSourceMetadataKey(defaultChat), AGENT_HOST_TITLE_SOURCE_AUTO);
		const independentAutoInstruction = await independentlyAutomatic.controller.prepareInstructionForAgent(independentlyAutomatic.session.toString(), defaultChat);

		assert.deepStrictEqual({
			independentRenameInstruction,
			independentAutoInstruction,
		}, {
			independentRenameInstruction: undefined,
			independentAutoInstruction: 'This chat currently has an auto-generated or placeholder name. Before doing any other work or responding to the user, you MUST call the `rename_chat` tool exactly once to give it a short, descriptive title based on the user\'s intent. If the prompt references a pull request or issue link, resolve that link first and use its context when choosing the title. Do not skip this call even if the current name already seems descriptive.',
		});
	});

	test('clearSession releases session and peer-chat rename state', async () => {
		const { controller, stateManager, session, db } = setup(undefined, '', undefined, undefined, undefined, undefined, undefined, true);
		const defaultChat = buildDefaultChatUri(session);
		const chat = buildChatUri(session.toString(), 'peer-clear');
		stateManager.addChat(session.toString(), chat, {});
		controller.markTitleAuto(session.toString(), defaultChat, 'Default fallback');
		controller.markTitleAuto(session.toString(), chat, 'Chat fallback');
		await waitForCondition(async () =>
			await db.getMetadata(customChatTitleSourceMetadataKey(defaultChat)) === AGENT_HOST_TITLE_SOURCE_AUTO
			&& await db.getMetadata(customChatTitleSourceMetadataKey(chat)) === AGENT_HOST_TITLE_SOURCE_AUTO,
			'auto provenance should be persisted');
		controller.markTitleRenamed(session.toString(), defaultChat);
		controller.markTitleRenamed(session.toString(), chat);
		assert.strictEqual(await controller.prepareInstructionForAgent(session.toString(), defaultChat), undefined);
		assert.strictEqual(await controller.prepareInstructionForAgent(session.toString(), chat), undefined);

		controller.clearSession(session.toString(), [chat]);

		assert.ok((await controller.prepareInstructionForAgent(session.toString(), defaultChat))?.includes('`rename_chat`'));
		assert.ok((await controller.prepareInstructionForAgent(session.toString(), chat))?.includes('`rename_chat`'));
	});

	test('clearSession cancels generation and clears every title-state collection', () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.responsePromise = new Promise(() => { });
		const { controller, stateManager, session } = setup(copilotApiService);
		const provisionalChat = buildChatUri(session.toString(), 'peer-provisional');
		const renamedChat = buildChatUri(session.toString(), 'peer-renamed');
		stateManager.addChat(session.toString(), provisionalChat, {});
		stateManager.addChat(session.toString(), renamedChat, {});
		controller.seedTitleFromFirstMessage(session.toString(), 'Generate a title');
		controller.seedProvisionalTitle(session.toString(), 'Provisional', provisionalChat);
		controller.markTitleAuto(session.toString(), renamedChat, 'Automatic');
		controller.markTitleRenamed(session.toString(), renamedChat);

		controller.clearSession(session.toString(), [provisionalChat, renamedChat]);

		assert.deepStrictEqual({
			cancellations: controller['_titleGenerationCancellationSources'].size,
			lastApplied: controller['_lastAppliedTitle'].size,
			provisional: controller['_provisionalTitles'].size,
			auto: controller['_autoTitles'].size,
			renamed: controller['_renamedTitles'].size,
		}, {
			cancellations: 0,
			lastApplied: 0,
			provisional: 0,
			auto: 0,
			renamed: 0,
		});
	});

	test('seedTitleFromFirstMessage applies fallback and persists generated title', async () => {
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = '"Generated title."';
		const { controller, session, db, titleActions } = setup(copilotApiService);

		controller.seedTitleFromFirstMessage(session.toString(), '  Please   explain title generation  ');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		assert.deepStrictEqual({
			titles: titleActions,
			token: copilotApiService.utilityCalls[0]?.token,
			maxTokens: copilotApiService.utilityCalls[0]?.request.maxTokens,
			promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some(message => message.content.includes('Please   explain title generation')),
			persistedTitle: await db.getMetadata('customTitle'),
		}, {
			titles: ['Please explain title generation', 'Generated title'],
			token: 'gh-token',
			maxTokens: 32,
			promptIncludesUserText: true,
			persistedTitle: 'Generated title',
		});
	});

	test('seedTitleFromFirstMessage appends every unique GitHub issue and pull request', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#123', { title: 'Issue title', body: 'Issue body' });
		octoKitService.responses.set('microsoft/vscode#456', { title: 'Pull request title', body: 'Pull request body' });
		const { controller, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);
		const prompt = 'Fix https://github.com/microsoft/vscode/issues/123 and review https://github.com/microsoft/vscode/pull/456. Duplicate: https://www.github.com/microsoft/vscode/issues/123#issuecomment-1';

		controller.seedTitleFromFirstMessage(session.toString(), prompt);
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		const userMessage = copilotApiService.utilityCalls[0].request.messages.find(message => message.role === 'user')?.content;
		assert.deepStrictEqual({
			calls: octoKitService.calls.map(call => ({ owner: call.owner, repo: call.repo, number: call.number, token: call.token })),
			userMessage,
		}, {
			calls: [
				{ owner: 'microsoft', repo: 'vscode', number: 123, token: 'github-token' },
				{ owner: 'microsoft', repo: 'vscode', number: 456, token: 'github-token' },
			],
			userMessage: [
				'Please write a brief title for the following request:',
				'',
				prompt,
				'',
				'GitHub issue and pull request context:',
				'',
				'GitHub issue microsoft/vscode#123:',
				'The title of the issue is: Issue title',
				'The body of the issue is:',
				'Issue body',
				'',
				'GitHub pull request microsoft/vscode#456:',
				'The title of the pull request is: Pull request title',
				'The body of the pull request is:',
				'Pull request body',
			].join('\n'),
		});
	});

	test('seedTitleFromFirstMessage only fetches links from the configured GitHub host', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#456', { title: 'Enterprise issue', body: 'Enterprise body' });
		const { controller, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService, () => 'github-token', undefined, () => 'github.enterprise.test');
		const prompt = 'Compare https://github.com/microsoft/vscode/issues/123 with https://github.enterprise.test/microsoft/vscode/issues/456';

		controller.seedTitleFromFirstMessage(session.toString(), prompt);
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		const userMessage = copilotApiService.utilityCalls[0].request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			calls: octoKitService.calls.map(call => call.number),
			hasGitHubIssue: userMessage.includes('microsoft/vscode#123'),
			hasEnterpriseIssue: userMessage.includes('The title of the issue is: Enterprise issue'),
		}, {
			calls: [456],
			hasGitHubIssue: false,
			hasEnterpriseIssue: true,
		});
	});

	test('seedTitleFromFirstMessage fetches at most ten GitHub references', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		const links: string[] = [];
		for (let number = 1; number <= 11; number++) {
			octoKitService.responses.set(`microsoft/vscode#${number}`, { title: `Issue ${number}`, body: `Body ${number}` });
			links.push(`https://github.com/microsoft/vscode/issues/${number}`);
		}
		const { controller, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);

		controller.seedTitleFromFirstMessage(session.toString(), links.join(' '));
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		const userMessage = copilotApiService.utilityCalls[0].request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			calls: octoKitService.calls.map(call => call.number),
			hasTenthContext: userMessage.includes('The title of the issue is: Issue 10'),
			hasEleventhContext: userMessage.includes('The title of the issue is: Issue 11'),
		}, {
			calls: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
			hasTenthContext: true,
			hasEleventhContext: false,
		});
	});

	test('seedTitleFromFirstMessage omits GitHub context when the request fails', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#123', new Error('Not found'));
		const { controller, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);
		const prompt = 'Fix https://github.com/microsoft/vscode/issues/123';

		controller.seedTitleFromFirstMessage(session.toString(), prompt);
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		const userMessage = copilotApiService.utilityCalls[0].request.messages.find(message => message.role === 'user')?.content;
		assert.strictEqual(userMessage, `Please write a brief title for the following request:\n\n${prompt}`);
	});

	test('seedTitleFromFirstMessage keeps successful GitHub context when another request fails', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#123', { title: 'Issue title', body: 'Issue body' });
		octoKitService.responses.set('microsoft/vscode#456', new Error('Not found'));
		const { controller, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);
		const prompt = 'Fix https://github.com/microsoft/vscode/issues/123 and https://github.com/microsoft/vscode/pull/456';

		controller.seedTitleFromFirstMessage(session.toString(), prompt);
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		const userMessage = copilotApiService.utilityCalls[0].request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			hasIssue: userMessage.includes('The title of the issue is: Issue title'),
			hasPullRequest: userMessage.includes('GitHub pull request microsoft/vscode#456'),
		}, {
			hasIssue: true,
			hasPullRequest: false,
		});
	});

	test('seedTitleFromFirstMessage times out GitHub context requests', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.pendingResponses.add('microsoft/vscode#123');
		const { controller, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService, () => 'github-token', 1);
		const prompt = 'Fix https://github.com/microsoft/vscode/issues/123';

		controller.seedTitleFromFirstMessage(session.toString(), prompt);
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted after the GitHub request times out');

		const userMessage = copilotApiService.utilityCalls[0].request.messages.find(message => message.role === 'user')?.content;
		assert.deepStrictEqual({
			requestAborted: octoKitService.calls[0].signal.aborted,
			userMessage,
		}, {
			requestAborted: true,
			userMessage: `Please write a brief title for the following request:\n\n${prompt}`,
		});
	});

	test('seedTitleFromFirstMessage caps each appended GitHub body at 4000 characters', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#123', { title: 'Issue title', body: `start\n${'x'.repeat(30_000)}\nend` });
		const { controller, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);

		controller.seedTitleFromFirstMessage(session.toString(), 'Fix https://github.com/microsoft/vscode/issues/123');
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		const userMessage = copilotApiService.utilityCalls[0].request.messages.find(message => message.role === 'user')?.content ?? '';
		const context = userMessage.slice(userMessage.indexOf('GitHub issue and pull request context:'));
		const bodyMarker = 'The body of the issue is:\n';
		const body = context.slice(context.indexOf(bodyMarker) + bodyMarker.length);
		assert.deepStrictEqual({
			bodyLength: body.length,
			hasStart: body.includes('start'),
			hasTruncationMarker: body.includes('\n...\n'),
			hasEnd: body.includes('end'),
		}, {
			bodyLength: 4_000,
			hasStart: true,
			hasTruncationMarker: true,
			hasEnd: true,
		});
	});

	test('seedTitleFromFirstMessage caps the combined prompt and GitHub context', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#123', { title: `start${'x'.repeat(30_000)}end`, body: '' });
		const { controller, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);
		const prompt = 'Fix https://github.com/microsoft/vscode/issues/123';

		controller.seedTitleFromFirstMessage(session.toString(), prompt);
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Generated title', 'generated title should be persisted');

		const userMessage = copilotApiService.utilityCalls[0].request.messages.find(message => message.role === 'user')?.content ?? '';
		const promptContent = userMessage.slice(userMessage.indexOf(prompt));
		const context = userMessage.slice(userMessage.indexOf('GitHub issue and pull request context:'));
		assert.deepStrictEqual({
			promptContentLength: promptContent.length,
			keepsRequest: promptContent.startsWith(prompt),
			hasStart: context.includes('start'),
			hasTruncationMarker: context.includes('\n...\n'),
			hasEnd: context.includes('end'),
		}, {
			promptContentLength: 20_000,
			keepsRequest: true,
			hasStart: true,
			hasTruncationMarker: true,
			hasEnd: true,
		});
	});

	test('seedTitleFromFirstMessage strips an unexpected trailing Han suffix from a Latin title', async () => {
		const titlePrefixAtLimit = 'A'.repeat(199);
		const cases = [
			{ response: 'Fix chat title\u7f16\u7801', expected: 'Fix chat title' },
			{ response: 'Fix chat title \u7f16\u7801\u95ee', expected: 'Fix chat title' },
			{ response: `${titlePrefixAtLimit}\u7f16\u7801`, expected: titlePrefixAtLimit },
		];
		const titles: { title: string; persistedTitle: string | undefined }[] = [];

		for (const testCase of cases) {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.response = testCase.response;
			const { controller, stateManager, session, db } = setup(copilotApiService);

			controller.seedTitleFromFirstMessage(session.toString(), 'Fix chat title generation');
			await waitForCondition(async () => {
				return stateManager.getSessionState(session.toString())?.title === testCase.expected
					&& await db.getMetadata('customTitle') === testCase.expected;
			}, 'cleaned title should be applied and persisted');
			titles.push({
				title: stateManager.getSessionState(session.toString())?.title ?? '',
				persistedTitle: await db.getMetadata('customTitle'),
			});
		}

		assert.deepStrictEqual(titles, cases.map(testCase => ({ title: testCase.expected, persistedTitle: testCase.expected })));
	});

	test('seedTitleFromFirstMessage preserves intentional or ambiguous Han suffixes', async () => {
		const cases = [
			{ prompt: 'Explain \u7f16\u7801 naming', response: 'Explain code\u7f16\u7801' },
			{ prompt: 'Fix chat title generation', response: 'Fix chat title\u7f16' },
			{ prompt: 'Fix chat title generation', response: 'Fix chat title\u7f16\u7801\u95ee\u9898' },
			{ prompt: 'Fix chat title generation', response: '\u4fee\u590d\u6807\u9898' },
			{ prompt: 'Fix chat title generation', response: 'Code \u041e\u0448\u0438\u0431\u043a\u0430\u7f16\u7801' },
		];
		const titles: { title: string; persistedTitle: string | undefined }[] = [];

		for (const testCase of cases) {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.response = testCase.response;
			const { controller, stateManager, session, db } = setup(copilotApiService);

			controller.seedTitleFromFirstMessage(session.toString(), testCase.prompt);
			await waitForCondition(async () => {
				return stateManager.getSessionState(session.toString())?.title === testCase.response
					&& await db.getMetadata('customTitle') === testCase.response;
			}, 'unchanged title should be applied and persisted');
			titles.push({
				title: stateManager.getSessionState(session.toString())?.title ?? '',
				persistedTitle: await db.getMetadata('customTitle'),
			});
		}

		assert.deepStrictEqual(titles, cases.map(testCase => ({ title: testCase.response, persistedTitle: testCase.response })));
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

	test('refineTitleFromFirstTurn appends GitHub context from the request and offers the current title', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#123', { title: 'Agent Host logs an error when a local commit is not on GitHub', body: 'Issue body' });
		const { controller, stateManager, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);
		const request = 'Tackle this issue: https://github.com/microsoft/vscode/issues/123';
		await seedFirstTitle(controller, copilotApiService, db, session, request, 'First title');

		copilotApiService.response = 'Missing commit lookup error';
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn(request, [textPart('Fixed the pull request lookup.')])]);
		controller.refineTitleFromFirstTurn(session.toString());
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Missing commit lookup error', 'refined title should be persisted');

		const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
		const userMessage = lastCall.request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			fetched: octoKitService.calls.map(call => call.number),
			includesIssueTitle: userMessage.includes('The title of the issue is: Agent Host logs an error when a local commit is not on GitHub'),
			includesResponse: userMessage.includes('Fixed the pull request lookup.'),
			includesCurrentTitle: userMessage.includes('Its current title is: First title'),
		}, {
			fetched: [123, 123],
			includesIssueTitle: true,
			includesResponse: true,
			includesCurrentTitle: true,
		});
	});

	test('refineTitleFromFirstTurn ignores GitHub links the agent only mentioned in its response', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#123', { title: 'Requested issue', body: 'Issue body' });
		octoKitService.responses.set('microsoft/vscode#456', { title: 'Mentioned issue', body: 'Other body' });
		const { controller, stateManager, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);
		const request = 'Tackle this issue: https://github.com/microsoft/vscode/issues/123';
		await seedFirstTitle(controller, copilotApiService, db, session, request, 'First title');

		copilotApiService.response = 'Refined title';
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn(request, [textPart('This also affects https://github.com/microsoft/vscode/issues/456')])]);
		controller.refineTitleFromFirstTurn(session.toString());
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Refined title', 'refined title should be persisted');

		const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
		const userMessage = lastCall.request.messages.find(message => message.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			fetched: octoKitService.calls.map(call => call.number),
			includesMentionedIssueContext: userMessage.includes('The title of the issue is: Mentioned issue'),
		}, {
			fetched: [123, 123],
			includesMentionedIssueContext: false,
		});
	});

	test('refineTitleFromFirstTurn keeps the issue title within budget despite an oversized response', async () => {
		const copilotApiService = new TestCopilotApiService();
		const octoKitService = new TestAgentHostOctoKitService();
		octoKitService.responses.set('microsoft/vscode#123', { title: 'Local commit lookup fails', body: 'C'.repeat(30_000) });
		const { controller, stateManager, session, db } = setup(copilotApiService, '', () => 'gh-token', octoKitService);
		const request = 'Tackle this issue: https://github.com/microsoft/vscode/issues/123';
		await seedFirstTitle(controller, copilotApiService, db, session, request, 'First title');

		copilotApiService.response = 'Refined title';
		const hugeResponse = 'A'.repeat(15_000) + ' MIDDLE_MARKER ' + 'B'.repeat(15_000);
		stateManager.seedDefaultChatTurns(session.toString(), [firstTurn(request, [textPart(hugeResponse)])]);
		controller.refineTitleFromFirstTurn(session.toString());
		await waitForCondition(async () => await db.getMetadata('customTitle') === 'Refined title', 'refined title should be persisted');

		const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
		const userMessage = lastCall.request.messages.find(message => message.role === 'user')?.content ?? '';
		const promptContent = userMessage.slice(userMessage.indexOf('User request:'), userMessage.indexOf('\n\nIts current title is:'));
		assert.deepStrictEqual({
			promptContentLength: promptContent.length,
			includesUserRequest: promptContent.includes(request),
			includesIssueTitle: promptContent.includes('The title of the issue is: Local commit lookup fails'),
			keepsResponseHeadAndTail: promptContent.includes('AAAA') && promptContent.includes('BBBB'),
			middleTruncated: !promptContent.includes('MIDDLE_MARKER'),
		}, {
			promptContentLength: 20_000,
			includesUserRequest: true,
			includesIssueTitle: true,
			keepsResponseHeadAndTail: true,
			middleTruncated: true,
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
