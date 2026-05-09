/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionOptions } from '@github/copilot/sdk';
import assert from 'assert';
import * as fs from 'fs/promises';
import { platform, tmpdir } from 'os';
import * as path from 'path';
import type { ChatParticipantToolToken, ChatPromptReference } from 'vscode';
import { IAgentSessionsWorkspace } from '../../src/extension/chatSessions/common/agentSessionsWorkspace';
import { IChatSessionMetadataStore } from '../../src/extension/chatSessions/common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../../src/extension/chatSessions/common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeService } from '../../src/extension/chatSessions/common/chatSessionWorktreeService';
import { MockChatSessionMetadataStore } from '../../src/extension/chatSessions/common/test/mockChatSessionMetadataStore';
import { emptyWorkspaceInfo, IWorkspaceInfo } from '../../src/extension/chatSessions/common/workspaceInfo';
import { ICustomSessionTitleService } from '../../src/extension/chatSessions/copilotcli/common/customSessionTitleService';
import { ChatDelegationSummaryService, IChatDelegationSummaryService } from '../../src/extension/chatSessions/copilotcli/common/delegationSummaryService';
import { CopilotCLIAgents, CopilotCLIModels, CopilotCLISDK, ICopilotCLIAgents, ICopilotCLIModels, ICopilotCLISDK } from '../../src/extension/chatSessions/copilotcli/node/copilotCli';
import { CopilotCLIImageSupport, ICopilotCLIImageSupport } from '../../src/extension/chatSessions/copilotcli/node/copilotCLIImageSupport';
import { CopilotCLIPromptResolver } from '../../src/extension/chatSessions/copilotcli/node/copilotcliPromptResolver';
import { ICopilotCLISession } from '../../src/extension/chatSessions/copilotcli/node/copilotcliSession';
import { CopilotCLISessionService, ICopilotCLISessionService, ICreateSessionOptions } from '../../src/extension/chatSessions/copilotcli/node/copilotcliSessionService';
import { CopilotCLISkills, ICopilotCLISkills } from '../../src/extension/chatSessions/copilotcli/node/copilotCLISkills';
import { CopilotCLIMCPHandler, ICopilotCLIMCPHandler } from '../../src/extension/chatSessions/copilotcli/node/mcpHandler';
import { IQuestion, IQuestionAnswer, IUserQuestionHandler } from '../../src/extension/chatSessions/copilotcli/node/userInputHelpers';
import { IPromptVariablesService, NullPromptVariablesService } from '../../src/extension/prompt/node/promptVariablesService';
import { ChatSummarizerProvider } from '../../src/extension/prompt/node/summarizer';
import { MockChatResponseStream, TestChatRequest } from '../../src/extension/test/node/testHelpers';
import { IToolsService } from '../../src/extension/tools/common/toolsService';
import { TestToolsService } from '../../src/extension/tools/node/test/testToolsService';
import { IChatDebugFileLoggerService, NullChatDebugFileLoggerService } from '../../src/platform/chat/common/chatDebugFileLoggerService';
import { IFileSystemService } from '../../src/platform/filesystem/common/fileSystemService';
import { NodeFileSystemService } from '../../src/platform/filesystem/node/fileSystemServiceImpl';
import { IMcpService, NullMcpService } from '../../src/platform/mcp/common/mcpService';
import { IPromptsService } from '../../src/platform/promptFiles/common/promptsService';
import { MockPromptsService } from '../../src/platform/promptFiles/test/common/mockPromptsService';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { IQualifiedFile, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { ChatReferenceDiagnostic } from '../../src/util/common/test/shims/chatTypes';
import { disposableTimeout, IntervalTimer } from '../../src/util/vs/base/common/async';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { DisposableStore, IReference } from '../../src/util/vs/base/common/lifecycle';
import { URI } from '../../src/util/vs/base/common/uri';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ChatRequest, ChatSessionStatus, ChatToolInvocationPart, Diagnostic, DiagnosticSeverity, LanguageModelTextPart, LanguageModelToolResult2, Location, Range, Uri } from '../../src/vscodeTypes';
import { ssuite, stest } from '../base/stest';

const permissionConfirmationInvocations: Array<{ name: string; input: unknown }> = [];

class TestCopilotCLIToolsService extends TestToolsService {
	override async invokeTool(name: string, options: any, token: CancellationToken): Promise<LanguageModelToolResult2> {
		if (name === 'vscode_get_confirmation' || name === 'vscode_get_terminal_confirmation') {
			permissionConfirmationInvocations.push({ name, input: options.input });
			return new LanguageModelToolResult2([new LanguageModelTextPart('yes')]);
		}

		// `manage_todo_list` is invoked by CopilotCLISession at session start to clear any
		// previous todo list, but the underlying tool does not implement `invoke` in the
		// test toolsService. Return a no-op success result so session startup does not fail.
		if (name === 'manage_todo_list') {
			return new LanguageModelToolResult2([new LanguageModelTextPart('ok')]);
		}
		return super.invokeTool(name, options, token);
	}
}

/**
 * Reads the GitHub OAuth token from the environment.
 *
 * The token is loaded automatically by `dotenv.config()` in `test/simulationMain.ts`
 * from the `.env` file at the workspace root. We only ever read `process.env` so the
 * token value never appears in any tool call output, log line, or LM request emitted
 * by this test file.
 */
function getGitHubTokenFromEnv(): string {
	const token = process.env.GITHUB_OAUTH_TOKEN;
	if (!token) {
		throw new Error('GITHUB_OAUTH_TOKEN is not set. Add it to the .env file at the repo root (it is loaded by dotenv in test/simulationMain.ts).');
	}
	return token;
}

// Force the Copilot CLI runtime to use the public CAPI endpoint regardless of
// the AuthInfo we hand it. The runtime's `getCopilotApiUrl()` checks
// `process.env.COPILOT_API_URL` first (highest precedence), so setting it here
// guarantees the model list is fetched against an endpoint we know works with
// the GITHUB_OAUTH_TOKEN, instead of getting an empty list and cascading into
// "No model available."
if (!process.env.COPILOT_API_URL) {
	process.env.COPILOT_API_URL = 'https://api.githubcopilot.com';
}

// Force the SDK to route Anthropic models to `/v1/messages` instead of
// `/responses`. The default routing sends Claude models to `/responses`,
// which CAPI rejects with `400 model_not_supported`. The runtime reads ExP
// flag overrides from `process.env.COPILOT_EXP_<UPPER_SNAKE_CASE_FLAG>`,
// which works without setting up an ExP service in tests.
// if (!process.env.COPILOT_EXP_COPILOT_CLI_ANTHROPIC_MESSAGES_API) {
// process.env.COPILOT_EXP_COPILOT_CLI_ANTHROPIC_MESSAGES_API = 'true';
// }

function sessionOptionsFor(workingDirectory: Uri | undefined): ICreateSessionOptions {
	return {
		// workingDirectory,
		model: 'claude-opus-4.7',
		workspace: {
			folder: workingDirectory,
			repository: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		} satisfies IWorkspaceInfo
	};
}

async function registerChatServices(testingServiceCollection: TestingServiceCollection) {
	class TestCustomSessionTitleService implements ICustomSessionTitleService {
		readonly _serviceBrand: undefined;
		private readonly titles = new Map<string, string>();
		async getCustomSessionTitle(sessionId: string) {
			return this.titles.get(sessionId);
		}
		async setCustomSessionTitle(sessionId: string, title: string): Promise<void> {
			this.titles.set(sessionId, title);
		}
		async generateSessionTitle(_sessionId: string, _request: { prompt?: string; command?: string }, _token: CancellationToken): Promise<string | undefined> {
			return undefined;
		}
	}

	class TestCopilotCLISessionService extends CopilotCLISessionService {
		override async monitorSessionFiles() {
			// Override to do nothing in tests
		}
		protected override async createSessionsOptions(options: { model?: string; workingDirectory?: Uri; workspace: IWorkspaceInfo; mcpServers?: SessionOptions['mcpServers']; sessionId?: string; debugTargetSessionIds?: readonly string[] }) {
			const sessionOptions = await super.createSessionsOptions({ ...options, agent: undefined });
			const mutableOptions = sessionOptions as SessionOptions;
			mutableOptions.enableStreaming = true;
			mutableOptions.skipCustomInstructions = true;
			return sessionOptions;
		}
	}

	class TestCopilotCLISDK extends CopilotCLISDK {
		protected override async ensureShims(): Promise<void> {
			// Override to do nothing in tests
		}
		override async getAuthInfo(): Promise<NonNullable<SessionOptions['authInfo']>> {
			return {
				type: 'token',
				token: getGitHubTokenFromEnv(),
				host: 'https://github.com',
				// Without `copilotUser.endpoints.api` the runtime's `getCopilotApiUrl()`
				// returns undefined, `retrieveAvailableModels()` short-circuits to an
				// empty list, and every model check below fails. Pointing it at the
				// public Copilot API endpoint makes model resolution actually contact
				// CAPI for the user's enabled models.
				copilotUser: {
					endpoints: {
						api: 'https://api.githubcopilot.com',
					},
				},
			};
		}
	}

	class UserQuestionHandler implements IUserQuestionHandler {
		declare _serviceBrand: undefined;
		constructor(
		) {
		}
		async askUserQuestion(question: IQuestion, toolInvocationToken: ChatParticipantToolToken, token: CancellationToken): Promise<IQuestionAnswer | undefined> {
			return undefined;
		}
	}

	let accessor = testingServiceCollection.clone().createTestingAccessor();
	let instaService = accessor.get(IInstantiationService);
	const summarizer = instaService.createInstance(ChatSummarizerProvider);
	const delegatingSummarizerProvider = instaService.createInstance(ChatDelegationSummaryService, summarizer);
	testingServiceCollection.define(ICopilotCLISkills, new SyncDescriptor(CopilotCLISkills));
	testingServiceCollection.define(ICopilotCLISessionService, new SyncDescriptor(TestCopilotCLISessionService));
	testingServiceCollection.define(ICopilotCLIModels, new SyncDescriptor(CopilotCLIModels));
	testingServiceCollection.define(ICopilotCLISDK, new SyncDescriptor(TestCopilotCLISDK));
	testingServiceCollection.define(ICopilotCLIAgents, new SyncDescriptor(CopilotCLIAgents));
	testingServiceCollection.define(ICustomSessionTitleService, new SyncDescriptor(TestCustomSessionTitleService));
	testingServiceCollection.define(ICopilotCLIMCPHandler, new SyncDescriptor(CopilotCLIMCPHandler));
	testingServiceCollection.define(IMcpService, new SyncDescriptor(NullMcpService));
	testingServiceCollection.define(IFileSystemService, new SyncDescriptor(NodeFileSystemService));
	testingServiceCollection.define(ICopilotCLIImageSupport, new SyncDescriptor(CopilotCLIImageSupport));
	testingServiceCollection.define(IToolsService, new SyncDescriptor(TestCopilotCLIToolsService, [new Set()]));
	testingServiceCollection.define(IUserQuestionHandler, new SyncDescriptor(UserQuestionHandler));
	testingServiceCollection.define(IChatDelegationSummaryService, delegatingSummarizerProvider);
	testingServiceCollection.define(IChatSessionMetadataStore, new SyncDescriptor(MockChatSessionMetadataStore));
	testingServiceCollection.define(IAgentSessionsWorkspace, { _serviceBrand: undefined, isAgentSessionsWorkspace: false } as IAgentSessionsWorkspace);
	testingServiceCollection.define(IChatSessionWorkspaceFolderService, {
		_serviceBrand: undefined,
		async deleteTrackedWorkspaceFolder() { },
		async trackSessionWorkspaceFolder() { },
		async getSessionWorkspaceFolder() { return undefined; },
		async getSessionWorkspaceFolderEntry() { return undefined; },
		async getRepositoryProperties() { return undefined; },
		async setRepositoryProperties() { },
		async handleRequestCompleted() { },
		async getWorkspaceChanges() { return undefined; },
		async hasCachedChanges() { return false; },
		clearWorkspaceChanges() { return []; },
		onDidChangeWorkspaceFolderChanges: () => ({ dispose() { } }),
	} as IChatSessionWorkspaceFolderService);
	testingServiceCollection.define(IChatSessionWorktreeService, {
		_serviceBrand: undefined,
		async createWorktree() { return undefined; },
		async getWorktreeProperties() { return undefined; },
		async setWorktreeProperties() { },
		async getWorktreeRepository() { return undefined; },
		async getWorktreePath() { return undefined; },
		async applyWorktreeChanges() { },
		async getSessionIdForWorktree() { return undefined; },
		async getWorktreeChanges() { return undefined; },
		async handleRequestCompleted() { },
		async getAdditionalWorktreeProperties() { return []; },
		async setAdditionalWorktreeProperties() { },
		async handleRequestCompletedForWorktree() { },
		async cleanupWorktreeOnArchive() { return { cleaned: false }; },
		async recreateWorktreeOnUnarchive() { return { recreated: false }; },
		async hasCachedChanges() { return false; },
		onDidChangeWorktreeChanges: () => ({ dispose() { } }),
	} as IChatSessionWorktreeService);
	testingServiceCollection.define(IPromptVariablesService, new SyncDescriptor(NullPromptVariablesService));
	testingServiceCollection.define(IPromptsService, new SyncDescriptor(MockPromptsService));
	testingServiceCollection.define(IChatDebugFileLoggerService, new NullChatDebugFileLoggerService());
	const simulationWorkspace = new SimulationWorkspace();
	simulationWorkspace.setupServices(testingServiceCollection);

	accessor = testingServiceCollection.createTestingAccessor();
	const copilotCLISessionService = accessor.get(ICopilotCLISessionService);
	const sdk = accessor.get(ICopilotCLISDK);
	instaService = accessor.get(IInstantiationService);
	const promptResolver = instaService.createInstance(CopilotCLIPromptResolver);

	async function populateWorkspaceFiles(workingDirectory: string) {
		const fileLanguages = new Map<string, string>([
			['.js', 'javascript'],
			['.ts', 'typescript'],
			['.py', 'python'],
		]);
		const workspaceUri = Uri.file(workingDirectory);
		// Enumerate all files and folders under workingDirectory

		const files: Uri[] = [];
		const folders: Uri[] = [];
		await fs.readdir(workingDirectory, { withFileTypes: true }).then((dirents) => {
			for (const dirent of dirents) {
				const fullPath = path.join(workingDirectory, dirent.name);
				if (dirent.isFile()) {
					files.push(Uri.file(fullPath));
				} else if (dirent.isDirectory()) {
					folders.push(Uri.file(fullPath));
				}
			}
		});

		const fileList = await Promise.all(files.map(async (fileUri) => {
			const content = await fs.readFile(fileUri.fsPath, 'utf-8');
			return {
				uri: fileUri,
				fileContents: content,
				kind: 'qualifiedFile',
				languageId: fileLanguages.get(path.extname(fileUri.fsPath)),
			} satisfies IQualifiedFile;
		}));
		simulationWorkspace.resetFromFiles(fileList, [workspaceUri]);
	}

	return {
		sessionService: copilotCLISessionService, promptResolver, init: async (workingDirectory: URI) => {
			await populateWorkspaceFiles(workingDirectory.fsPath);
			await sdk.getPackage();
		},
		authInfo: await sdk.getAuthInfo()
	};
}

// NOTE: Ensure all files/folders/workingDirectories are under test/scenarios/test-cli for path replacements to work correctly.
const sourcePath = path.join(__dirname, '..', 'test', 'scenarios', 'test-cli');
let tmpDirCounter = 0;
function testRunner(cb: (services: { sessionService: ICopilotCLISessionService; promptResolver: CopilotCLIPromptResolver; init: (workingDirectory: URI) => Promise<void>; authInfo: NonNullable<SessionOptions['authInfo']> }, scenariosPath: string, toolInvocations: ChatToolInvocationPart[], stream: MockChatResponseStream, disposables: DisposableStore) => Promise<void>) {
	return async (testingServiceCollection: TestingServiceCollection) => {
		const disposables = new DisposableStore();
		// Temp folder can be `/var/folders/....` in our code we use `realpath` to resolve any symlinks.
		// That results in these temp folders being resolved as `/private/var/folders/...` on macOS.
		const scenariosPath = path.join(tmpdir() + tmpDirCounter++, 'vscode-copilot-chat', 'test-cli');
		await fs.rm(scenariosPath, { recursive: true, force: true }).catch(() => { /* Ignore */ });
		await fs.mkdir(scenariosPath, { recursive: true });
		await fs.cp(sourcePath, scenariosPath, { recursive: true, force: true, errorOnExist: false });
		const toolInvocations: ChatToolInvocationPart[] = [];
		permissionConfirmationInvocations.length = 0;
		try {
			const services = await registerChatServices(testingServiceCollection);
			const stream = new MockChatResponseStream((part) => {
				if (part instanceof ChatToolInvocationPart) {
					toolInvocations.push(part);
				}
			});
			await cb(services, await fs.realpath(scenariosPath), toolInvocations, stream, disposables);
		} finally {
			await fs.rm(scenariosPath, { recursive: true }).catch(() => { /* Ignore */ });
			disposables.dispose();
		}
	};
}

function assertStreamContains(stream: MockChatResponseStream, expectedContent: string, message?: string) {
	const output = stream.output.join('');
	assert.ok(output.includes(expectedContent), message ?? `Expected response to include "${expectedContent}", actual output: ${output}`);
}

function assertNoErrorsInStream(stream: MockChatResponseStream) {
	const output = stream.output.join('');
	assert.ok(!output.includes('❌'), `Expected no errors in stream, actual output: ${output}`);
	assert.ok(!output.includes('Error'), `Expected no errors in stream, actual output: ${output}`);
}

async function assertFileContains(filePath: string, expectedContent: string, exactCount?: number) {
	const fileContent = await fs.readFile(filePath, 'utf-8');
	assert.ok(fileContent.includes(expectedContent), `Expected to contain "${expectedContent}", contents = ${fileContent}`);
	if (typeof exactCount === 'number') {
		const actualCount = Array.from(fileContent.matchAll(new RegExp(expectedContent, 'g'))).length;
		assert.strictEqual(actualCount, exactCount, `Expected to find "${expectedContent}" exactly ${exactCount} times, but found ${actualCount} times in contents = ${fileContent}`);
	}
}

async function assertFileNotContains(filePath: string, expectedContent: string) {
	const fileContent = await fs.readFile(filePath, 'utf-8');
	assert.ok(!fileContent.includes(expectedContent), `Expected not to contain "${expectedContent}", contents = ${fileContent}`);
}

ssuite.skip({ title: '@cli', location: 'external' }, async (_) => {
	stest({ description: 'can start a session' },
		testRunner(async ({ sessionService, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt: 'What is 1+8?' }, [], undefined, authInfo, CancellationToken.None);

			// Verify we have a response of 9.
			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			assertStreamContains(stream, '9');

			// Can send a subsequent request.
			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt: 'What is 11+25?' }, [], undefined, authInfo, CancellationToken.None);
			// Verify we have a response of 36.
			assertStreamContains(stream, '36');
		})
	);

	stest({ description: 'can resume a session' },
		testRunner(async ({ sessionService, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);

			let sessionId = '';
			// Start session.
			{
				const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
				sessionId = session.object.sessionId;

				await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt: 'What is 1+8?' }, [], undefined, authInfo, CancellationToken.None);
				session.dispose();
			}

			// Resume the session.
			{
				const session = await new Promise<IReference<ICopilotCLISession>>((resolve, reject) => {
					const interval = disposables.add(new IntervalTimer());
					interval.cancelAndSet(async () => {
						const session = await sessionService.getSession({ sessionId, ...sessionOptionsFor(workingDirectory) }, CancellationToken.None);
						if (session) {
							interval.dispose();
							resolve(session);
						}
					}, 50);
					disposables.add(disposableTimeout(() => reject(new Error('Timed out waiting for session')), 5_000));
				});
				disposables.add(session);
				disposables.add(session.object.attachStream(stream));

				await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt: 'What was my previous question?' }, [], undefined, authInfo, CancellationToken.None);

				// Verify we have a response of 9.
				assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
				assertNoErrorsInStream(stream);
				assertStreamContains(stream, '8');
			}
		})
	);
	stest({ description: 'can read file without permission' },
		testRunner(async ({ sessionService, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const file = URI.joinPath(workingDirectory, 'sample.js');
			const prompt = `Explain the contents of the file '${path.basename(file.fsPath)}'. There is no need to check for contents in the directory. This file exists on disc.`;
			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, [], undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			assertStreamContains(stream, 'add');
		})
	);
	stest({ description: 'request permission when reading file outside workspace' },
		testRunner(async ({ sessionService, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);

			const externalFile = path.join(scenariosPath, 'wkspc2', 'foobar.js');
			const prompt = `Explain the contents of the file '${externalFile}'. This file exists on disc but not in the current working directory. There's no need to search the directory, just read this file and explain its contents.`;
			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, [], undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			const streamOutput = stream.output.join('');
			assert.ok(permissionConfirmationInvocations.length > 0, 'Expected permission to be requested for external file, output:' + streamOutput);
		})
	);
	stest({ description: 'can read attachment without permission' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const file = URI.joinPath(workingDirectory, 'sample.js').fsPath;
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Explain the contents of the attached file. There is no need to check for contents in the directory. This file exists on disc.`,
				[file],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			assertStreamContains(stream, 'add');
		})
	);
	stest({ description: 'can edit file' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const file = URI.joinPath(workingDirectory, 'sample.js').fsPath;
			let { prompt, attachments } = await resolvePromptWithFileReferences(
				`Remove comments form add function and add a subtract function to #file:sample.js.`,
				[file],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			await assertFileNotContains(file, 'Sample function to add two values');
			await assertFileContains(file, 'function subtract', 1);
			await assertFileContains(file, 'function add', 1);

			// Multi-turn edit
			({ prompt, attachments } = await resolvePromptWithFileReferences(
				`Now add a divide function.`,
				[],
				promptResolver
			));
			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			// Ensure previous edits are preserved (in past there have been cases where SDK applies edits again)
			await assertFileNotContains(file, 'Sample function to add two values');
			await assertFileContains(file, 'function subtract', 1);
			await assertFileContains(file, 'function add', 1);
		})
	);
	stest({ description: 'explain selection' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const file = URI.joinPath(workingDirectory, 'utils.js').fsPath;

			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`explain what the selected statement does`,
				[createFileSelectionReference(file, new Range(10, 0, 10, 10))],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertStreamContains(stream, 'throw');
		})
	);
	stest({ description: 'can create a file' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Create a file named math.js that contains a function to compute square of a number.`,
				[],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			await assertFileContains(URI.joinPath(workingDirectory, 'math.js').fsPath, 'function', 1);
		})
	);
	stest({ description: 'can list files in directory' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`What files are in the current directory.`,
				[],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			assertStreamContains(stream, 'sample.js');
			assertStreamContains(stream, 'utils.js');
			assertStreamContains(stream, 'stringUtils.js');
			assertStreamContains(stream, 'demo.py');
		})
	);
	stest({ description: 'can fix problems' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const file = URI.joinPath(workingDirectory, 'stringUtils.js').fsPath;
			const diag = new Diagnostic(new Range(7, 0, 7, 1), '} expected', DiagnosticSeverity.Error);
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Fix the problem`,
				[createDiagnosticReference(file, [diag])],
				promptResolver
			);
			let contents = await fs.readFile(file, 'utf-8');
			assert.ok(!contents.trim().endsWith('}'), '} is missing');
			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);
			contents = await fs.readFile(file, 'utf-8');
			assert.ok(contents.trim().endsWith('}'), `} has not been added, contents = ${contents}`);
		})
	);

	stest({ description: 'can fix multiple problems in multiple files' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const tsFile = URI.joinPath(workingDirectory, 'stringUtils.js').fsPath;
			const tsDiag = new Diagnostic(new Range(7, 0, 7, 1), '} expected', DiagnosticSeverity.Error);
			const pyFile = URI.joinPath(workingDirectory, 'demo.py').fsPath;
			const pyDiag1 = new Diagnostic(new Range(3, 21, 3, 21), 'Expected \':\', found new line', DiagnosticSeverity.Error);
			const pyDiag2 = new Diagnostic(new Range(19, 13, 19, 13), 'Statement ends with an unnecessary semicolon', DiagnosticSeverity.Warning);

			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Fix the problem`,
				[createDiagnosticReference(tsFile, [tsDiag]), createDiagnosticReference(pyFile, [pyDiag1, pyDiag2])],
				promptResolver
			);
			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			const tsContents = await fs.readFile(tsFile, 'utf-8');
			assert.ok(tsContents.trim().endsWith('}'), `} has not been added, contents = ${tsContents}`);
			assertFileContains(pyFile, 'def printFibb(nterms):');
			assertFileNotContains(pyFile, 'printFibb(34);');
		})
	);

	stest({ description: 'can run terminal commands' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);

			const command = platform() === 'win32' ? 'Get-Location' : 'pwd';
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Use terminal command '${command}' to determine my current directory`,
				[],
				promptResolver
			);
			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assertNoErrorsInStream(stream);
			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertStreamContains(stream, 'wkspc1');
			assert.ok(permissionConfirmationInvocations.some(invocation => invocation.name === 'vscode_get_terminal_confirmation'));
		})
	);
});

function createWithRequestWithFileReference(prompt: string, filesOrReferences: (string | ChatPromptReference)[]): ChatRequest {
	const request = new TestChatRequest(prompt);
	request.references = filesOrReferences.map(file => {
		if (typeof file !== 'string') {
			return file;
		}
		return createFileReference(file);
	});
	return request;
}

function createFileReference(file: string): ChatPromptReference {
	return {
		id: `file-${file}`,
		name: `file:${path.basename(file)}`,
		value: Uri.file(file),
	} satisfies ChatPromptReference;
}

function createFileSelectionReference(file: string, range: Range): ChatPromptReference {
	const uri = Uri.file(file);
	return {
		id: `file-${file}`,
		name: `file:${path.basename(file)}`,
		value: new Location(uri, range),
	} satisfies ChatPromptReference;
}

function createDiagnosticReference(file: string, diag: Diagnostic[]): ChatPromptReference {
	const uri = Uri.file(file);
	return {
		id: `file-${file}`,
		name: `file:${path.basename(file)}`,
		value: new ChatReferenceDiagnostic([[uri, diag]]),
	} satisfies ChatPromptReference;
}


function resolvePromptWithFileReferences(prompt: string, filesOrReferences: (string | ChatPromptReference)[], promptResolver: CopilotCLIPromptResolver): Promise<{ prompt: string; attachments: any[] }> {
	return promptResolver.resolvePrompt(createWithRequestWithFileReference(prompt, filesOrReferences), undefined, [], emptyWorkspaceInfo(), [], CancellationToken.None);
}
