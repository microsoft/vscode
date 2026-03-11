/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IBrowserMainWorkbench } from '../../workbench/browser/web.main.js';
import { Workbench as SessionsWorkbench } from '../browser/workbench.js';
import { SessionsBrowserMain } from '../browser/web.main.js';
import { Emitter, Event } from '../../base/common/event.js';
import { CancellationToken } from '../../base/common/cancellation.js';
import { IObservable, observableValue } from '../../base/common/observable.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../workbench/services/chat/common/chatEntitlementService.js';
import { IDefaultAccountService } from '../../platform/defaultAccount/common/defaultAccount.js';
import { IDefaultAccount, IDefaultAccountAuthenticationProvider, ICopilotTokenInfo, IPolicyData } from '../../base/common/defaultAccount.js';
import { IChatAgentService, IChatAgentData, IChatAgentImplementation } from '../../workbench/contrib/chat/common/participants/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../workbench/contrib/chat/common/constants.js';
import { ExtensionIdentifier } from '../../platform/extensions/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { URI } from '../../base/common/uri.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { IChatProgress } from '../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService, IChatSessionItem, IChatSessionFileChange, ChatSessionStatus, IChatSessionHistoryItem } from '../../workbench/contrib/chat/common/chatSessionsService.js';
import { IGitService, IGitExtensionDelegate, IGitRepository } from '../../workbench/contrib/git/common/gitService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../platform/files/common/inMemoryFilesystemProvider.js';
import { VSBuffer } from '../../base/common/buffer.js';

/**
 * Mock files pre-seeded in the in-memory file system. These match the
 * paths in EXISTING_MOCK_FILES and are used by the ChatEditingService
 * to compute before/after diffs.
 */
const MOCK_FS_FILES: Record<string, string> = {
	'/mock-repo/src/index.ts': 'export function main() {\n\tconsole.log("Hello from mock repo");\n}\n',
	'/mock-repo/src/utils.ts': 'export function add(a: number, b: number): number {\n\treturn a + b;\n}\n',
	'/mock-repo/package.json': '{\n\t"name": "mock-repo",\n\t"version": "1.0.0"\n}\n',
	'/mock-repo/README.md': '# Mock Repository\n\nThis is a mock repository for E2E testing.\n',
};

/**
 * Register the mock-fs:// file system provider directly in the workbench
 * so it is available immediately at startup — before any service
 * (SnippetsService, PromptFilesLocator, MCP, etc.) tries to resolve
 * files inside the workspace folder.
 */
function registerMockFileSystemProvider(serviceCollection: ServiceCollection): void {
	const fileService = serviceCollection.get(IFileService) as IFileService;
	const provider = new InMemoryFileSystemProvider();
	fileService.registerProvider('mock-fs', provider);

	// Pre-populate the files so ChatEditingService can read originals for diffs
	for (const [filePath, content] of Object.entries(MOCK_FS_FILES)) {
		const uri = URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: filePath });
		fileService.writeFile(uri, VSBuffer.fromString(content));
	}
	console.log('[Sessions Web Test] Registered mock-fs:// provider with pre-seeded files');
}

const MOCK_ACCOUNT: IDefaultAccount = {
	authenticationProvider: { id: 'github', name: 'GitHub (Mock)', enterprise: false },
	accountName: 'e2e-test-user',
	sessionId: 'mock-session-1',
	enterprise: false,
};

/**
 * Mock implementation of IChatEntitlementService that makes the Sessions
 * window think the user is signed in with a Free Copilot plan.
 */
class MockChatEntitlementService implements IChatEntitlementService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeEntitlement = Event.None;
	readonly onDidChangeQuotaExceeded = Event.None;
	readonly onDidChangeQuotaRemaining = Event.None;
	readonly onDidChangeSentiment = Event.None;
	readonly onDidChangeAnonymous = Event.None;

	readonly entitlement = ChatEntitlement.Free;
	readonly entitlementObs: IObservable<ChatEntitlement> = observableValue('entitlement', ChatEntitlement.Free);

	readonly previewFeaturesDisabled = false;
	readonly organisations: string[] | undefined = undefined;
	readonly isInternal = false;
	readonly sku = 'free';
	readonly copilotTrackingId = 'mock-tracking-id';

	readonly quotas = {};

	readonly sentiment: IChatSentiment = { installed: true, registered: true };
	readonly sentimentObs: IObservable<IChatSentiment> = observableValue('sentiment', { installed: true, registered: true });

	readonly anonymous = false;
	readonly anonymousObs: IObservable<boolean> = observableValue('anonymous', false);

	markAnonymousRateLimited(): void { }
	async update(_token: CancellationToken): Promise<void> { }
}

/**
 * Mock implementation of IDefaultAccountService that returns a fake
 * signed-in account so the "Sign In" button in the sidebar is hidden.
 */
class MockDefaultAccountService implements IDefaultAccountService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeDefaultAccount = Event.None;
	readonly onDidChangePolicyData = Event.None;
	readonly policyData: IPolicyData | null = null;
	readonly copilotTokenInfo: ICopilotTokenInfo | null = null;
	readonly onDidChangeCopilotTokenInfo = Event.None;

	async getDefaultAccount(): Promise<IDefaultAccount | null> { return MOCK_ACCOUNT; }
	getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider { return MOCK_ACCOUNT.authenticationProvider; }
	setDefaultAccountProvider(): void { }
	async refresh(): Promise<IDefaultAccount | null> { return MOCK_ACCOUNT; }
	async signIn(): Promise<IDefaultAccount | null> { return MOCK_ACCOUNT; }
	async signOut(): Promise<void> { }
}

// ---------------------------------------------------------------------------
// Mock chat responses and file changes
// ---------------------------------------------------------------------------

/**
 * Paths that exist in the mock-fs file store pre-seeded by the mock extension.
 * Used to determine whether a textEdit should replace file content (existing)
 * or insert into an empty buffer (new file), so the real ChatEditingService
 * computes meaningful before/after diffs.
 */
const EXISTING_MOCK_FILES = new Set(['/mock-repo/src/index.ts', '/mock-repo/src/utils.ts', '/mock-repo/package.json', '/mock-repo/README.md']);

interface MockFileEdit {
	uri: URI;
	content: string;
}

interface MockResponse {
	text: string;
	fileEdits?: MockFileEdit[];
}

/**
 * Emit textEdit progress items for each file edit using the real ChatModel
 * pipeline. Existing files use a full-file replacement range so the real
 * ChatEditingService computes an accurate diff. New files use an
 * insert-at-beginning range.
 */
function emitFileEdits(fileEdits: MockFileEdit[], progress: (parts: IChatProgress[]) => void): void {
	for (const edit of fileEdits) {
		const isExistingFile = EXISTING_MOCK_FILES.has(edit.uri.path);
		const range = isExistingFile
			? { startLineNumber: 1, startColumn: 1, endLineNumber: 99999, endColumn: 1 }
			: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
		console.log(`[Sessions Web Test] Emitting textEdit for ${edit.uri.toString()} (existing: ${isExistingFile}, range: ${range.startLineNumber}-${range.endLineNumber})`);
		progress([{
			kind: 'textEdit',
			uri: edit.uri,
			edits: [{ range, text: edit.content }],
			done: true,
		}]);
	}
}

/**
 * Return canned response text and file edits keyed by user message keywords.
 *
 * File edits target URIs in the mock-fs:// filesystem. Edits for existing
 * files produce real diffs (original content from mock-fs → new content here).
 * Edits for new files produce "file created" entries.
 */
function getMockResponseWithEdits(message: string): MockResponse {
	if (/build|compile|create/i.test(message)) {
		return {
			text: 'I\'ll help you build the project. Here are the changes:',
			fileEdits: [
				{
					// Modify existing file — adds build import + call
					uri: URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: '/mock-repo/src/index.ts' }),
					content: 'import { build } from "./build";\n\nexport function main() {\n\tconsole.log("Hello from mock repo");\n\tbuild();\n}\n',
				},
				{
					// New file — creates build script
					uri: URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: '/mock-repo/src/build.ts' }),
					content: 'export async function build() {\n\tconsole.log("Building...");\n\tconsole.log("Build complete!");\n}\n',
				},
				{
					// Modify existing file — adds build script
					uri: URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: '/mock-repo/package.json' }),
					content: '{\n\t"name": "mock-repo",\n\t"version": "1.0.0",\n\t"scripts": {\n\t\t"build": "node src/build.ts"\n\t}\n}\n',
				},
			],
		};
	}
	if (/fix|bug/i.test(message)) {
		return {
			text: 'I found the issue and applied the fix. The input validation has been added.',
			fileEdits: [
				{
					// Modify existing file — adds input validation
					uri: URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: '/mock-repo/src/utils.ts' }),
					content: 'export function add(a: number, b: number): number {\n\tif (typeof a !== "number" || typeof b !== "number") {\n\t\tthrow new TypeError("Both arguments must be numbers");\n\t}\n\treturn a + b;\n}\n',
				},
			],
		};
	}
	if (/explain|describe/i.test(message)) {
		return {
			text: 'This project has a simple structure with a main entry point and utility functions.',
		};
	}
	return {
		text: 'I understand your request. Let me work on that.\n\n1. Review the codebase\n2. Make changes\n3. Run tests',
	};
}

// ---------------------------------------------------------------------------
// Workbench contribution — registers mock chat agent and pre-seeds folder
// ---------------------------------------------------------------------------

class MockChatAgentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.test.mockChatAgent';

	private readonly _sessionItems: IChatSessionItem[] = [];
	private readonly _itemsChangedEmitter = new Emitter<void>();
	private readonly _sessionHistory = new Map<string, IChatSessionHistoryItem[]>();

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();
		this._register(this._itemsChangedEmitter);
		this.registerMockAgents();
		this.registerMockSessionProvider();
		this.preseedFolder();
	}

	/**
	 * Track a session for sidebar display and history re-opening.
	 *
	 * Populates `IChatSessionItem.changes` with file change metadata so the
	 * ChangesViewPane can render them for background (copilotcli) sessions.
	 * Background sessions read changes from `IAgentSessionsService.model`
	 * which flows through from `IChatSessionItemController.items`.
	 */
	private addSessionItem(resource: URI, message: string, responseText: string, fileEdits?: MockFileEdit[]): void {
		const key = resource.toString();
		const now = Date.now();

		// Store conversation history for this session (needed for re-opening)
		if (!this._sessionHistory.has(key)) {
			this._sessionHistory.set(key, []);
		}
		this._sessionHistory.get(key)!.push(
			{ type: 'request', prompt: message, participant: 'copilot' },
			{ type: 'response', parts: [{ kind: 'markdownContent', content: { value: responseText, isTrusted: false, supportThemeIcons: false, supportHtml: false } }], participant: 'copilot' },
		);

		// Build file changes for the session list (used by ChangesViewPane for background sessions)
		const changes: IChatSessionFileChange[] | undefined = fileEdits?.map(edit => ({
			modifiedUri: edit.uri,
			insertions: edit.content.split('\n').length,
			deletions: EXISTING_MOCK_FILES.has(edit.uri.path) ? 1 : 0,
		}));

		// Add or update session in list
		const existing = this._sessionItems.find(s => s.resource.toString() === key);
		if (existing) {
			existing.timing.lastRequestStarted = now;
			existing.timing.lastRequestEnded = now;
			if (changes) {
				existing.changes = changes;
			}
		} else {
			this._sessionItems.push({
				resource,
				label: message.slice(0, 50) || 'Mock Session',
				status: ChatSessionStatus.Completed,
				timing: { created: now, lastRequestStarted: now, lastRequestEnded: now },
				...(changes ? { changes } : {}),
			});
		}
		this._itemsChangedEmitter.fire();
	}

	private registerMockAgents(): void {
		const agentIds = ['copilotcli', 'copilot-cloud-agent'];
		const extensionId = new ExtensionIdentifier('vscode.sessions-e2e-mock');
		const self = this;

		for (const agentId of agentIds) {
			const agentData: IChatAgentData = {
				id: agentId,
				name: agentId,
				fullName: `Mock Agent (${agentId})`,
				description: 'Mock chat agent for E2E testing',
				extensionId,
				extensionVersion: '0.0.1',
				extensionPublisherId: 'vscode',
				extensionDisplayName: 'Sessions E2E Mock',
				isDefault: true,
				metadata: {},
				slashCommands: [],
				locations: [ChatAgentLocation.Chat],
				modes: [ChatModeKind.Agent],
				disambiguation: [],
			};

			const agentImpl: IChatAgentImplementation = {
				async invoke(request, progress: (parts: IChatProgress[]) => void, _history, _token) {
					console.log(`[Sessions Web Test] Mock agent "${agentId}" invoked: "${request.message}"`);
					const response = getMockResponseWithEdits(request.message);

					// Stream the text response
					progress([{
						kind: 'markdownContent',
						content: { value: response.text, isTrusted: false, supportThemeIcons: false, supportHtml: false },
					}]);

					// Emit file edits through the real ChatModel pipeline so
					// ChatEditingService computes actual diffs
					if (response.fileEdits) {
						emitFileEdits(response.fileEdits, progress);
						console.log(`[Sessions Web Test] Emitted ${response.fileEdits.length} file edits`);
					}

					self.addSessionItem(request.sessionResource, request.message, response.text, response.fileEdits);
					return { metadata: { mock: true } };
				},
			};

			try {
				this._register(this.chatAgentService.registerDynamicAgent(agentData, agentImpl));
				console.log(`[Sessions Web Test] Registered mock agent: ${agentId}`);
			} catch (err) {
				console.warn(`[Sessions Web Test] Failed to register agent ${agentId}:`, err);
			}
		}
	}

	private registerMockSessionProvider(): void {
		const schemes = ['copilotcli', 'copilot-cloud-agent'];
		const self = this;
		for (const scheme of schemes) {
			try {
				this._register(this.chatSessionsService.registerChatSessionContentProvider(scheme, {
					async provideChatSessionContent(sessionResource, _token) {
						const key = sessionResource.toString();
						const history = self._sessionHistory.get(key) ?? [];
						console.log(`[Sessions Web Test] Opening session ${key} (${history.length} history items)`);
						const disposeEmitter = new Emitter<void>();
						const isComplete = observableValue('isComplete', history.length > 0);
						return {
							sessionResource,
							history,
							isCompleteObs: isComplete,
							onWillDispose: disposeEmitter.event,
							async requestHandler(request, progress, _history, _token) {
								console.log(`[Sessions Web Test] Session request: "${request.message}"`);
								const response = getMockResponseWithEdits(request.message);
								progress([{
									kind: 'markdownContent',
									content: { value: response.text, isTrusted: false, supportThemeIcons: false, supportHtml: false },
								}]);
								if (response.fileEdits) {
									emitFileEdits(response.fileEdits, progress);
								}
								isComplete.set(true, undefined);
							},
							dispose() { disposeEmitter.fire(); disposeEmitter.dispose(); },
						};
					},
				}));

				// Register an item controller so sessions appear in the sidebar list
				const items = this._sessionItems;
				this._register(this.chatSessionsService.registerChatSessionItemController(scheme, {
					onDidChangeChatSessionItems: this._itemsChangedEmitter.event,
					get items() { return items; },
					async refresh() { /* in-memory, no-op */ },
				}));

				console.log(`[Sessions Web Test] Registered session provider for scheme: ${scheme}`);
			} catch (err) {
				console.warn(`[Sessions Web Test] Failed to register session provider for ${scheme}:`, err);
			}
		}
	}

	private preseedFolder(): void {
		const mockFolderUri = URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: '/mock-repo' }).toString();
		this.storageService.store('agentSessions.lastPickedFolder', mockFolderUri, StorageScope.PROFILE, StorageTarget.MACHINE);
		console.log(`[Sessions Web Test] Pre-seeded folder: ${mockFolderUri}`);
	}
}

// Register the contribution so it runs during workbench startup
registerWorkbenchContribution2(MockChatAgentContribution.ID, MockChatAgentContribution, WorkbenchPhase.BlockStartup);

// ---------------------------------------------------------------------------
// MockGitService — resolves immediately instead of waiting 10s for delegate
// ---------------------------------------------------------------------------

class MockGitService implements IGitService {
	declare readonly _serviceBrand: undefined;
	readonly repositories: Iterable<IGitRepository> = [];
	setDelegate(_delegate: IGitExtensionDelegate) { return Disposable.None; }
	async openRepository(_uri: URI) { return undefined; }
}

// ---------------------------------------------------------------------------
// TestSessionsBrowserMain
// ---------------------------------------------------------------------------

/**
 * Test variant of SessionsBrowserMain that injects mock services
 * for E2E testing. Service overrides for entitlements and auth are set
 * in createWorkbench(). The mock chat agent is registered via a
 * workbench contribution (MockChatAgentContribution above).
 */
export class TestSessionsBrowserMain extends SessionsBrowserMain {

	protected override createWorkbench(domElement: HTMLElement, serviceCollection: ServiceCollection, logService: ILogService): IBrowserMainWorkbench {
		console.log('[Sessions Web Test] Injecting mock services');

		// Register mock-fs:// provider FIRST so all services can resolve workspace files
		registerMockFileSystemProvider(serviceCollection);

		// Override entitlement service so Sessions thinks user is signed in
		serviceCollection.set(IChatEntitlementService, new MockChatEntitlementService());

		// Override default account service to hide the "Sign In" button
		serviceCollection.set(IDefaultAccountService, new MockDefaultAccountService());

		// Override git service so openRepository resolves instantly (no 10s barrier wait)
		serviceCollection.set(IGitService, new MockGitService());

		console.log('[Sessions Web Test] Creating Sessions workbench with mocks');
		return new SessionsWorkbench(domElement, undefined, serviceCollection, logService);
	}
}
