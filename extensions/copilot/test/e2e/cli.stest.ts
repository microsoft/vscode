/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionOptions } from '@github/copilot/sdk';
import assert from 'assert';
import * as fs from 'fs/promises';
import * as http from 'http';
import { platform, tmpdir } from 'os';
import * as path from 'path';
import type { ChatParticipantToolToken, ChatPromptReference, ChatResource } from 'vscode';
import { OpenAIAdapterFactoryForSTests } from '../../src/extension/agents/node/adapters/openaiAdapterForSTests';
import { ILanguageModelServer, ILanguageModelServerConfig, LanguageModelServer } from '../../src/extension/agents/node/langModelServer';
import { IAgentSessionsWorkspace } from '../../src/extension/chatSessions/common/agentSessionsWorkspace';
import { IChatPromptFileService } from '../../src/extension/chatSessions/common/chatPromptFileService';
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
import { CopilotCLISessionService, ICopilotCLISessionService } from '../../src/extension/chatSessions/copilotcli/node/copilotcliSessionService';
import { CopilotCLISkills, ICopilotCLISkills } from '../../src/extension/chatSessions/copilotcli/node/copilotCLISkills';
import { CopilotCLIMCPHandler, ICopilotCLIMCPHandler } from '../../src/extension/chatSessions/copilotcli/node/mcpHandler';
import { IPromptVariablesService, NullPromptVariablesService } from '../../src/extension/prompt/node/promptVariablesService';
import { IQuestion, IQuestionAnswer, IUserQuestionHandler } from '../../src/extension/chatSessions/copilotcli/node/userInputHelpers';
import { ChatSummarizerProvider } from '../../src/extension/prompt/node/summarizer';
import { MockChatResponseStream, TestChatRequest } from '../../src/extension/test/node/testHelpers';
import { IToolsService } from '../../src/extension/tools/common/toolsService';
import { TestToolsService } from '../../src/extension/tools/node/test/testToolsService';
import { IChatDebugFileLoggerService, NullChatDebugFileLoggerService } from '../../src/platform/chat/common/chatDebugFileLoggerService';
import { IEndpointProvider } from '../../src/platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../src/platform/filesystem/common/fileSystemService';
import { NodeFileSystemService } from '../../src/platform/filesystem/node/fileSystemServiceImpl';
import { ILogService } from '../../src/platform/log/common/logService';
import { IMcpService, NullMcpService } from '../../src/platform/mcp/common/mcpService';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { IQualifiedFile, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { createServiceIdentifier } from '../../src/util/common/services';
import { ChatReferenceDiagnostic } from '../../src/util/common/test/shims/chatTypes';
import { disposableTimeout, IntervalTimer } from '../../src/util/vs/base/common/async';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { Event, Emitter } from '../../src/util/vs/base/common/event';
import { Lazy } from '../../src/util/vs/base/common/lazy';
import { Disposable, DisposableStore, IReference } from '../../src/util/vs/base/common/lifecycle';
import { URI } from '../../src/util/vs/base/common/uri';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ChatRequest, ChatSessionStatus, ChatToolInvocationPart, Diagnostic, DiagnosticSeverity, LanguageModelTextPart, LanguageModelToolResult2, Location, Range, Uri } from '../../src/vscodeTypes';
import { ssuite, stest } from '../base/stest';

interface ChatToolResourcesInvocationData {
	values: Array<Uri | Location>;
}

const permissionConfirmationInvocations: Array<{ name: string; input: unknown }> = [];

class TestCopilotCLIToolsService extends TestToolsService {
	override async invokeTool(name: string, options: any, token: CancellationToken): Promise<LanguageModelToolResult2> {
		if (name === 'vscode_get_confirmation' || name === 'vscode_get_terminal_confirmation') {
			permissionConfirmationInvocations.push({ name, input: options.input });
			return new LanguageModelToolResult2([new LanguageModelTextPart('yes')]);
		}

		return super.invokeTool(name, options, token);
	}
}
export class MockChatPromptFileService extends Disposable implements IChatPromptFileService {
	declare _serviceBrand: undefined;
	customAgents: ChatResource[] = [];
	instructions: ChatResource[] = [];
	skills: ChatResource[] = [];
	readonly hooks: readonly ChatResource[] = [];
	readonly plugins: readonly ChatResource[] = [];
	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	private readonly _onDidChangeInstructions = this._register(new Emitter<void>());
	private readonly _onDidChangeSkills = this._register(new Emitter<void>());
	readonly onDidChangeHooks = Event.None;
	readonly onDidChangePlugins = Event.None;

	get onDidChangeCustomAgents() {
		return this._onDidChangeCustomAgents.event;
	}

	get onDidChangeInstructions() {
		return this._onDidChangeInstructions.event;
	}

	get onDidChangeSkills() {
		return this._onDidChangeSkills.event;
	}
	get customAgentPromptFiles() {
		return [];
	}
	constructor() {
		super();
	}
}

const keys = ['COPILOT_ENABLE_ALT_PROVIDERS', 'COPILOT_AGENT_MODEL', 'GH_TOKEN', 'COPILOT_API_URL', 'GITHUB_COPILOT_API_TOKEN'];
const originalValues: Record<string, string | undefined> = {};
for (const key of keys) {
	originalValues[key] = process.env[key];
}

function restoreEnvVariables() {
	for (const key of keys) {
		process.env[key] = originalValues[key];
	}
}

let testCounter = 0;
function trackEnvVariablesBeforeTests() {
	testCounter++;
}

/**
 * Tests run in parallel, so only restore env variables after all tests have completed.
 */
function restoreEnvVariablesAfterTests() {
	testCounter--;
	if (testCounter === 0) {
		restoreEnvVariables();
	}
}

function sessionOptionsFor(workingDirectory: Uri | undefined) {
	return {
		workingDirectory,
		workspace: {
			folder: workingDirectory,
			repository: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		} satisfies IWorkspaceInfo
	};
}

async function registerChatServices(testingServiceCollection: TestingServiceCollection) {
	const ITestSessionOptionsProvider = createServiceIdentifier<TestSessionOptionsProvider>('ITestSessionOptionsProvider');
	class TestSessionOptionsProvider {
		declare _serviceBrand: undefined;

		private readonly langModelServerConfig: Lazy<Promise<ILanguageModelServerConfig>>;

		constructor(
			@ILanguageModelServer private readonly languageModelServer: ILanguageModelServer,
		) {
			this.langModelServerConfig = new Lazy<Promise<ILanguageModelServerConfig>>(async () => {
				await this.languageModelServer.start();
				return this.languageModelServer.getConfig();
			});
		}

		public async getOptions(): Promise<Pick<SessionOptions, 'authInfo' | 'copilotUrl'>> {
			const serverConfig = await this.langModelServerConfig.value;

			const url = `http://localhost:${serverConfig.port}`;
			const ghToken = serverConfig.nonce;
			process.env.COPILOT_ENABLE_ALT_PROVIDERS = 'true';
			process.env.COPILOT_AGENT_MODEL = 'sweagent-capi:gpt-5';
			process.env.GH_TOKEN = ghToken;
			process.env.COPILOT_API_URL = url;
			process.env.GITHUB_COPILOT_API_TOKEN = ghToken;
			return {
				authInfo: {
					type: 'env',
					login: '',
					envVar: 'GH_TOKEN',
					token: ghToken,
					host: url
				},
				copilotUrl: url,
			};
		}
	}

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
			const testOptionsProvider = this.instantiationService.invokeFunction((accessor) => accessor.get(ITestSessionOptionsProvider));
			const overrideOptions = await testOptionsProvider.getOptions();
			const sessionOptions = await super.createSessionsOptions({ ...options, agent: undefined });
			const mutableOptions = sessionOptions as SessionOptions;
			mutableOptions.authInfo = overrideOptions.authInfo ?? sessionOptions.authInfo;
			mutableOptions.copilotUrl = overrideOptions.copilotUrl ?? sessionOptions.copilotUrl;
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
			const testOptionsProvider = this.instantiationService.invokeFunction((accessor) => accessor.get(ITestSessionOptionsProvider));
			const options = await testOptionsProvider.getOptions();
			return options.authInfo!;
		}
	}

	const requestHooks: ((body: string) => string)[] = [];
	const responseHooks: ((body: string) => string)[] = [];
	class TestLanguageModelServer extends LanguageModelServer {
		constructor(
			@ILogService logService: ILogService,
			@IEndpointProvider endpointProvider: IEndpointProvider
		) {
			super(logService, endpointProvider);
			const oaiAdapterFactory = new OpenAIAdapterFactoryForSTests();
			this.adapterFactories.set('/chat/completions', oaiAdapterFactory);
			requestHooks.forEach(requestHook => oaiAdapterFactory.addHooks(requestHook));
			responseHooks.forEach(responseHook => oaiAdapterFactory.addHooks(undefined, responseHook));
			this.requestHandlers.set('/graphql', { method: 'POST', handler: this.graphqlHandler.bind(this) });
			this.requestHandlers.set('/models', { method: 'GET', handler: this.modelsHandler.bind(this) });
		}

		private async graphqlHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			const data = {
				viewer: {
					login: '',
					copilotEndpoints: {
						api: `http://localhost:${this.config.port}`
					}
				}
			};
			res.end(JSON.stringify({ data }));
		}
		private async modelsHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
			res.writeHead(200, { 'Content-Type': 'application/json', 'x-github-request-id': 'TESTREQUESTID1234' });
			const endpoints = await this.endpointProvider.getAllChatEndpoints();
			const data = endpoints.map(e => {
				return {
					id: e.model,
					name: e.model,
					capabilities: {
						supports: {
							vision: e.supportsVision,
						},
						limits: {
							max_prompt_tokens: e.modelMaxPromptTokens,
							max_context_window_tokens: e.maxOutputTokens,
						}
					}
				};
			});
			res.end(JSON.stringify({ data }));
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
	testingServiceCollection.define(ITestSessionOptionsProvider, new SyncDescriptor(TestSessionOptionsProvider));
	testingServiceCollection.define(ILanguageModelServer, new SyncDescriptor(TestLanguageModelServer));
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
	testingServiceCollection.define(IChatPromptFileService, new SyncDescriptor(MockChatPromptFileService));
	testingServiceCollection.define(IChatSessionMetadataStore, new SyncDescriptor(MockChatSessionMetadataStore));
	testingServiceCollection.define(IAgentSessionsWorkspace, { _serviceBrand: undefined, isAgentSessionsWorkspace: false } as IAgentSessionsWorkspace);
	testingServiceCollection.define(IChatSessionWorkspaceFolderService, {
		_serviceBrand: undefined,
		async deleteTrackedWorkspaceFolder() { },
		async trackSessionWorkspaceFolder() { },
		async getSessionWorkspaceFolder() { return undefined; },
		async getSessionWorkspaceFolderEntry() { return undefined; },
		async getRepositoryProperties() { return undefined; },
		async handleRequestCompleted() { },
		async getWorkspaceChanges() { return undefined; },
		clearWorkspaceChanges() { return []; },
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
	} as IChatSessionWorktreeService);
	testingServiceCollection.define(IPromptVariablesService, new SyncDescriptor(NullPromptVariablesService));
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

	function registerHooks(workingDirectory: string) {
		requestHooks.push((body: string) => {
			// Replace PID and <current_datetime> values with static values
			body = body.replace(/Current process PID: \d+ - CRITICAL: Do not kill this process or any parent processes as this is your own runtime\./g,
				'Current process PID: 1111 - CRITICAL: Do not kill this process or any parent processes as this is your own runtime.');
			body = body.replace(/<current_datetime>[^<]+<\/current_datetime>/g,
				'<current_datetime>2025-01-01T12:10:00.111Z</current_datetime>');
			return body;
		});

		// Any file/folder reference in body should be replaced with static values
		const folderName = path.basename(workingDirectory);
		const testPath = `/Users/testUser/vscode-copilot-chat/test/scenarios/test-cli/${folderName}`;
		const testPathParent = `/Users/testUser/vscode-copilot-chat/test/scenarios/test-cli`;
		const workingDirectoryParent = path.dirname(workingDirectory);

		function replacePaths(body: string, from: string, to: string) {
			body = body
				// Unix folders that are part of file names, e.g. /folder/file.txt
				.replaceAll(`${from}/`, `${to}/`)
				// Windows folders that are part of file names, e.g. c:\folder\file.txt
				.replaceAll(`${from}\\`, `${to}\\`);

			// Any other references to the working directory
			body = body.replaceAll(from, to);

			// Replace in JSON content, Unix folders that are part of file names, e.g. /folder/file.txt
			from = from.replaceAll('/', '//').replaceAll('\\', '\\\\');
			to = to.replaceAll('/', '//').replaceAll('\\', '\\\\');

			body = body
				// Unix folders that are part of file names, e.g. /folder/file.txt
				.replaceAll(`${from}/`, `${to}/`)
				// Windows folders that are part of file names, e.g. c:\folder\file.txt
				.replaceAll(`${from}\\`, `${to}\\`);
			// Replace in JSON content, Any other references to the working directory
			body = body.replaceAll(from, to);
			return body;
		}

		requestHooks.push((body: string) => {
			body = replacePaths(body, workingDirectory, testPath);
			body = replacePaths(body, workingDirectoryParent, testPathParent);

			// Replace references to vsc-copilot-chat root with test dir
			body = replacePaths(body, vscCopilotRoot, testPath);
			return body;
		});

		responseHooks.push((body: string) => {
			body = replacePaths(body, testPath, workingDirectory);
			body = replacePaths(body, testPathParent, workingDirectoryParent);
			return body;
		});
	}

	return {
		sessionService: copilotCLISessionService, promptResolver, init: async (workingDirectory: URI) => {
			if (platform() !== 'win32') {
				// Paths conversions are only done for non-Windows platforms.
				// Hooks are used to ensure we have stable paths on linux/macOS, so that request/responses can be cached.
				registerHooks(workingDirectory.fsPath);
			}

			await populateWorkspaceFiles(workingDirectory.fsPath);
			await sdk.getPackage();
		},
		authInfo: await sdk.getAuthInfo()
	};
}

const vscCopilotRoot = path.join(__dirname, '..');
// NOTE: Ensure all files/folders/workingDirectories are under test/scenarios/test-cli for path replacements to work correctly.
const sourcePath = path.join(__dirname, '..', 'test', 'scenarios', 'test-cli');
let tmpDirCounter = 0;
function testRunner(cb: (services: { sessionService: ICopilotCLISessionService; promptResolver: CopilotCLIPromptResolver; init: (workingDirectory: URI) => Promise<void>; authInfo: NonNullable<SessionOptions['authInfo']> }, scenariosPath: string, toolInvocations: ChatToolInvocationPart[], stream: MockChatResponseStream, disposables: DisposableStore) => Promise<void>) {
	return async (testingServiceCollection: TestingServiceCollection) => {
		trackEnvVariablesBeforeTests();
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
			restoreEnvVariablesAfterTests();
			disposables.dispose();
		}
	};
}

function assertStreamContains(stream: MockChatResponseStream, expectedContent: string, message?: string) {
	const output = stream.output.join('\n');
	assert.ok(output.includes(expectedContent), message ?? `Expected response to include "${expectedContent}", actual output: ${output}`);
}

function assertNoErrorsInStream(stream: MockChatResponseStream) {
	const output = stream.output.join('\n');
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

function getToolInvocationsByName(toolInvocations: ChatToolInvocationPart[], toolName: string): ChatToolInvocationPart[] {
	return toolInvocations.filter(t => t.toolName.toLocaleLowerCase() === toolName.toLocaleLowerCase());
}

function assertToolInvocationHasFiles(invocation: ChatToolInvocationPart, expectedFileCount: number, message?: string) {
	const data = invocation.toolSpecificData as ChatToolResourcesInvocationData | undefined;
	assert.ok(data, message ?? 'Expected toolSpecificData to exist');
	assert.ok(data.values, message ?? 'Expected toolSpecificData.values to exist');
	assert.strictEqual(data.values.length, expectedFileCount, message ?? `Expected ${expectedFileCount} files, got ${data.values.length}`);
}

function assertToolInvocationMessageContains(invocation: ChatToolInvocationPart, expectedPattern: string, message?: string) {
	const pastTenseMessage = typeof invocation.pastTenseMessage === 'string' ? invocation.pastTenseMessage : invocation.pastTenseMessage?.value;
	assert.ok(pastTenseMessage?.includes(expectedPattern), message ?? `Expected pastTenseMessage to contain "${expectedPattern}", got "${pastTenseMessage}"`);
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
			const streamOutput = stream.output.join('\n');
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

	stest({ description: 'glob tool returns files with correct toolSpecificData' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Use the glob tool to find all JavaScript files (*.js) in the current directory. Do not use any other search tools.`,
				[],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);

			const globInvocations = getToolInvocationsByName(toolInvocations, 'search');
			assert.ok(globInvocations.length > 0, 'Expected at least one glob tool invocation');
			const invocation = globInvocations[globInvocations.length - 1];
			// wkspc1 has sample.js, utils.js, stringUtils.js
			assertToolInvocationHasFiles(invocation, 3);
			assertToolInvocationMessageContains(invocation, '3 result');
		})
	);

	stest({ description: 'glob tool with no matches has empty toolSpecificData' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Use the glob tool to find all files matching *.xyz in the current directory. Do not use any other search tools.`,
				[],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);

			const globInvocations = getToolInvocationsByName(toolInvocations, 'search');
			assert.ok(globInvocations.length > 0, 'Expected at least one glob tool invocation');
			const invocation = globInvocations[globInvocations.length - 1];
			assertToolInvocationHasFiles(invocation, 0);
			// When no results, the message ends with '.' (no result count)
			const pastTenseMessage = typeof invocation.pastTenseMessage === 'string' ? invocation.pastTenseMessage : invocation.pastTenseMessage?.value;
			assert.ok(pastTenseMessage?.endsWith('.'), `Expected pastTenseMessage to end with '.', got "${pastTenseMessage}"`);
		})
	);

	stest({ description: 'grep tool returns files with correct toolSpecificData' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Use the grep tool to search for the word 'function' in the current directory. Do not use any other search tools.`,
				[],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);

			const grepInvocations = getToolInvocationsByName(toolInvocations, 'search');
			assert.ok(grepInvocations.length > 0, 'Expected at least one grep tool invocation');
			const invocation = grepInvocations[grepInvocations.length - 1];
			// All JS files in wkspc1 contain 'function': sample.js, utils.js, stringUtils.js
			const data = invocation.toolSpecificData as ChatToolResourcesInvocationData | undefined;
			assert.ok(data && data.values && data.values.length > 0, 'Expected grep to find matching files');
			assertToolInvocationMessageContains(invocation, 'result');
		})
	);

	stest({ description: 'grep tool with no matches has empty toolSpecificData' },
		testRunner(async ({ sessionService, promptResolver, init, authInfo }, scenariosPath, toolInvocations, stream, disposables) => {
			const workingDirectory = URI.file(path.join(scenariosPath, 'wkspc1'));
			await init(workingDirectory);
			const { prompt, attachments } = await resolvePromptWithFileReferences(
				`Use the grep tool to search for the pattern 'xyzNonExistentPattern123' in the current directory. Do not use any other search tools.`,
				[],
				promptResolver
			);

			const session = await sessionService.createSession(sessionOptionsFor(workingDirectory), CancellationToken.None);
			disposables.add(session);
			disposables.add(session.object.attachStream(stream));

			await session.object.handleRequest({ id: '', toolInvocationToken: undefined as never }, { prompt }, attachments, undefined, authInfo, CancellationToken.None);

			assert.strictEqual(session.object.status, ChatSessionStatus.Completed);
			assertNoErrorsInStream(stream);

			const grepInvocations = getToolInvocationsByName(toolInvocations, 'search');
			assert.ok(grepInvocations.length > 0, 'Expected at least one grep tool invocation');
			const invocation = grepInvocations[grepInvocations.length - 1];
			assertToolInvocationHasFiles(invocation, 0);
			// When no results, the message ends with '.' (no result count)
			const pastTenseMessage = typeof invocation.pastTenseMessage === 'string' ? invocation.pastTenseMessage : invocation.pastTenseMessage?.value;
			assert.ok(pastTenseMessage?.endsWith('.'), `Expected pastTenseMessage to end with '.', got "${pastTenseMessage}"`);
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
