/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Workbench as SessionsWorkbench } from '../browser/workbench.js';
import { SessionsBrowserMain } from '../browser/web.main.js';
import { Emitter, Event } from '../../base/common/event.js';
import { observableValue } from '../../base/common/observable.js';
import { ChatEntitlement, IChatEntitlementService } from '../../workbench/services/chat/common/chatEntitlementService.js';
import { IDefaultAccountService } from '../../platform/defaultAccount/common/defaultAccount.js';
import { IChatAgentService } from '../../workbench/contrib/chat/common/participants/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../workbench/contrib/chat/common/constants.js';
import { ExtensionIdentifier } from '../../platform/extensions/common/extensions.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { URI } from '../../base/common/uri.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { registerWorkbenchContribution2 } from '../../workbench/common/contributions.js';
import { IChatSessionsService } from '../../workbench/contrib/chat/common/chatSessionsService.js';
import { IGitService } from '../../workbench/contrib/git/common/gitService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { ITerminalService } from '../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalExtensions } from '../../platform/terminal/common/terminal.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { InMemoryFileSystemProvider } from '../../platform/files/common/inMemoryFilesystemProvider.js';
import { VSBuffer } from '../../base/common/buffer.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../platform/instantiation/common/extensions.js';
import { isEqual } from '../../base/common/resources.js';
/**
 * Mock files pre-seeded in the in-memory file system. These match the
 * paths in EXISTING_MOCK_FILES and are used by the ChatEditingService
 * to compute before/after diffs.
 */
const MOCK_FS_FILES = {
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
function registerMockFileSystemProvider(serviceCollection) {
    const fileService = serviceCollection.get(IFileService);
    const provider = new InMemoryFileSystemProvider();
    fileService.registerProvider('mock-fs', provider);
    // Pre-populate the files so ChatEditingService can read originals for diffs
    for (const [filePath, content] of Object.entries(MOCK_FS_FILES)) {
        const uri = URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: filePath });
        fileService.writeFile(uri, VSBuffer.fromString(content));
    }
    console.log('[Sessions Web Test] Registered mock-fs:// provider with pre-seeded files');
}
const MOCK_ACCOUNT = {
    authenticationProvider: { id: 'github', name: 'GitHub (Mock)', enterprise: false },
    accountName: 'e2e-test-user',
    sessionId: 'mock-session-1',
    enterprise: false,
};
/**
 * Mock implementation of IChatEntitlementService that makes the Sessions
 * window think the user is signed in with a Free Copilot plan.
 */
class MockChatEntitlementService {
    constructor() {
        this.onDidChangeEntitlement = Event.None;
        this.onDidChangeQuotaExceeded = Event.None;
        this.onDidChangeQuotaRemaining = Event.None;
        this.onDidChangeSentiment = Event.None;
        this.onDidChangeAnonymous = Event.None;
        this.entitlement = ChatEntitlement.Free;
        this.entitlementObs = observableValue('entitlement', ChatEntitlement.Free);
        this.previewFeaturesDisabled = false;
        this.organisations = undefined;
        this.isInternal = false;
        this.sku = 'free';
        this.copilotTrackingId = 'mock-tracking-id';
        this.quotas = {};
        this.sentiment = { completed: true, registered: true };
        this.sentimentObs = observableValue('sentiment', { completed: true, registered: true });
        this.anonymous = false;
        this.anonymousObs = observableValue('anonymous', false);
    }
    markAnonymousRateLimited() { }
    async update(_token) { }
}
/**
 * Mock implementation of IDefaultAccountService that returns a fake
 * signed-in account so the "Sign In" button in the sidebar is hidden.
 */
class MockDefaultAccountService {
    constructor() {
        this.onDidChangeDefaultAccount = Event.None;
        this.onDidChangePolicyData = Event.None;
        this.policyData = null;
        this.copilotTokenInfo = null;
        this.onDidChangeCopilotTokenInfo = Event.None;
    }
    async getDefaultAccount() { return MOCK_ACCOUNT; }
    getDefaultAccountAuthenticationProvider() { return MOCK_ACCOUNT.authenticationProvider; }
    setDefaultAccountProvider() { }
    async refresh() { return MOCK_ACCOUNT; }
    async signIn() { return MOCK_ACCOUNT; }
    async signOut() { }
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
/**
 * Emit textEdit progress items for each file edit using the real ChatModel
 * pipeline. Existing files use a full-file replacement range so the real
 * ChatEditingService computes an accurate diff. New files use an
 * insert-at-beginning range.
 */
function emitFileEdits(fileEdits, progress) {
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
function getMockResponseWithEdits(message) {
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
let MockChatAgentContribution = class MockChatAgentContribution extends Disposable {
    static { this.ID = 'sessions.test.mockChatAgent'; }
    constructor(chatAgentService, chatSessionsService, terminalService) {
        super();
        this.chatAgentService = chatAgentService;
        this.chatSessionsService = chatSessionsService;
        this.terminalService = terminalService;
        this._sessionItems = [];
        this._itemsChangedEmitter = new Emitter();
        this._sessionHistory = new Map();
        this._worktreeCounter = 0;
        this._register(this._itemsChangedEmitter);
        this.registerMockAgents();
        this.registerMockSessionProvider();
        this.registerMockTerminalBackend();
    }
    /**
     * Track a session for sidebar display and history re-opening.
     *
     * Populates `IChatSessionItem.changes` with file change metadata so the
     * ChangesViewPane can render them for background (copilotcli) sessions.
     * Background sessions read changes from `IAgentSessionsService.model`
     * which flows through from `IChatSessionItemController.items`.
     */
    addSessionItem(resource, message, responseText, fileEdits) {
        const key = resource.toString();
        const now = Date.now();
        // Store conversation history for this session (needed for re-opening)
        if (!this._sessionHistory.has(key)) {
            this._sessionHistory.set(key, []);
        }
        this._sessionHistory.get(key).push({ type: 'request', prompt: message, participant: 'copilot' }, { type: 'response', parts: [{ kind: 'markdownContent', content: { value: responseText, isTrusted: false, supportThemeIcons: false, supportHtml: false } }], participant: 'copilot' });
        // Build file changes for the session list (used by ChangesViewPane for background sessions)
        const changes = fileEdits?.map(edit => ({
            modifiedUri: edit.uri,
            insertions: edit.content.split('\n').length,
            deletions: EXISTING_MOCK_FILES.has(edit.uri.path) ? 1 : 0,
        }));
        // Add or update session in list
        const existingIndex = this._sessionItems.findIndex(s => isEqual(s.resource, resource));
        let addedOrUpdated = existingIndex !== -1 ? { ...this._sessionItems[existingIndex] } : undefined;
        if (addedOrUpdated) {
            addedOrUpdated.timing = { ...addedOrUpdated.timing, lastRequestStarted: now, lastRequestEnded: now };
            if (changes) {
                addedOrUpdated.changes = changes;
            }
            this._sessionItems[existingIndex] = addedOrUpdated;
        }
        else {
            addedOrUpdated = {
                resource,
                label: message.slice(0, 50) || 'Mock Session',
                status: 1 /* ChatSessionStatus.Completed */,
                timing: { created: now, lastRequestStarted: now, lastRequestEnded: now },
                metadata: { worktreePath: `/mock-worktrees/session-${++this._worktreeCounter}` },
                ...(changes ? { changes } : {}),
            };
            this._sessionItems.push(addedOrUpdated);
        }
        if (addedOrUpdated) {
            this._itemsChangedEmitter.fire({ addedOrUpdated: [addedOrUpdated] });
        }
    }
    registerMockAgents() {
        const agentIds = ['copilotcli', 'copilot-cloud-agent'];
        const extensionId = new ExtensionIdentifier('vscode.sessions-e2e-mock');
        const self = this;
        for (const agentId of agentIds) {
            const agentData = {
                id: agentId,
                name: agentId,
                fullName: `Mock Agent (${agentId})`,
                description: 'Mock chat agent for E2E testing',
                extensionId,
                extensionVersion: '0.0.1',
                extensionPublisherId: 'vscode',
                extensionDisplayName: 'Sessions E2E Mock',
                isDefault: agentId === 'copilotcli',
                metadata: {},
                slashCommands: [],
                locations: [ChatAgentLocation.Chat],
                modes: [ChatModeKind.Agent],
                disambiguation: [],
            };
            const agentImpl = {
                async invoke(request, progress, _history, _token) {
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
                        console.log(`[Sessions Web Test] Emitted ${response.fileEdits.length} file edits OK`);
                    }
                    self.addSessionItem(request.sessionResource, request.message, response.text, response.fileEdits);
                    return { metadata: { mock: true } };
                },
            };
            try {
                this._register(this.chatAgentService.registerDynamicAgent(agentData, agentImpl));
                console.log(`[Sessions Web Test] Registered mock agent: ${agentId}`);
            }
            catch (err) {
                console.warn(`[Sessions Web Test] Failed to register agent ${agentId}:`, err);
            }
        }
    }
    registerMockSessionProvider() {
        const schemes = ['copilotcli', 'copilot-cloud-agent'];
        const self = this;
        for (const scheme of schemes) {
            try {
                this._register(this.chatSessionsService.registerChatSessionContentProvider(scheme, {
                    async provideChatSessionContent(sessionResource, _token) {
                        const key = sessionResource.toString();
                        // Ensure the history array is stored in _sessionHistory so
                        // addSessionItem pushes into the SAME reference returned here.
                        if (!self._sessionHistory.has(key)) {
                            self._sessionHistory.set(key, []);
                        }
                        const history = self._sessionHistory.get(key);
                        console.log(`[Sessions Web Test] Opening session ${key} (${history.length} history items)`);
                        const disposeEmitter = new Emitter();
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
                // Register an item controller so sessions appear in the sidebar list.
                // Only copilotcli (Background) sessions need real items — the
                // copilot-cloud-agent controller must return an empty array to
                // prevent it from overwriting sessions with the wrong providerType
                // during a full model resolve.
                const controllerItems = scheme === 'copilotcli' ? this._sessionItems : [];
                this._register(this.chatSessionsService.registerChatSessionItemController(scheme, {
                    onDidChangeChatSessionItems: this._itemsChangedEmitter.event,
                    get items() { return controllerItems; },
                    async refresh() { },
                }));
                console.log(`[Sessions Web Test] Registered session provider for scheme: ${scheme}`);
            }
            catch (err) {
                console.warn(`[Sessions Web Test] Failed to register session provider for ${scheme}:`, err);
            }
        }
    }
    registerMockTerminalBackend() {
        const terminalService = this.terminalService;
        const backend = this.createMockTerminalBackend();
        Registry.as(TerminalExtensions.Backend).registerTerminalBackend(backend);
        terminalService.registerProcessSupport(true);
        console.log('[Sessions Web Test] Registered mock terminal backend');
    }
    createMockTerminalBackend() {
        return {
            remoteAuthority: undefined,
            isVirtualProcess: false,
            isResponsive: true,
            whenReady: Promise.resolve(),
            setReady: () => { },
            onDidRequestDetach: Event.None,
            attachToProcess: async () => { throw new Error('Not supported'); },
            attachToRevivedProcess: async () => { throw new Error('Not supported'); },
            listProcesses: async () => [],
            getProfiles: async () => [],
            getDefaultProfile: async () => undefined,
            getDefaultSystemShell: async () => '/bin/mock-shell',
            getShellEnvironment: async () => ({}),
            setTerminalLayoutInfo: async () => { },
            getTerminalLayoutInfo: async () => undefined,
            reduceConnectionGraceTime: () => { },
            requestDetachInstance: () => { },
            acceptDetachInstanceReply: () => { },
            persistTerminalState: () => { },
            createProcess: async (_shellLaunchConfig, _cwd, _cols, _rows, _unicodeVersion, _env, _options, _shouldPersist) => {
                const onProcessData = new Emitter();
                const onProcessReady = new Emitter();
                const onProcessExit = new Emitter();
                const onDidChangeHasChildProcesses = new Emitter();
                const onDidChangeProperty = new Emitter();
                // Resolve cwd from createProcess arg or shellLaunchConfig
                const rawCwd = _cwd || _shellLaunchConfig.cwd;
                const cwd = !rawCwd ? '/' : typeof rawCwd === 'string' ? rawCwd : rawCwd.path;
                console.log(`[Sessions Web Test] Mock terminal createProcess cwd: '${cwd}' (raw _cwd: '${_cwd}', slc.cwd: '${_shellLaunchConfig.cwd}')`);
                // Fire ready after a microtask so the terminal service can wire up listeners
                setTimeout(() => {
                    onProcessReady.fire({ pid: 1, cwd, windowsPty: undefined });
                }, 0);
                return {
                    id: 0,
                    shouldPersist: false,
                    onProcessData: onProcessData.event,
                    onProcessReady: onProcessReady.event,
                    onDidChangeHasChildProcesses: onDidChangeHasChildProcesses.event,
                    onDidChangeProperty: onDidChangeProperty.event,
                    onProcessExit: onProcessExit.event,
                    start: async () => undefined,
                    shutdown: async () => { },
                    input: async () => { },
                    resize: () => { },
                    clearBuffer: () => { },
                    acknowledgeDataEvent: () => { },
                    setUnicodeVersion: async () => { },
                    getInitialCwd: async () => cwd,
                    getCwd: async () => cwd,
                    getLatency: async () => [],
                    processBinary: async () => { },
                    refreshProperty: async (property) => { throw new Error(`Not supported: ${property}`); },
                    updateProperty: async () => { },
                    clearUnrespondedRequest: () => { },
                };
            },
            getWslPath: async (original, _direction) => original,
            getEnvironment: async () => ({}),
            getLatency: async () => [],
            getPerformanceMarks: () => [],
            updateTitle: async () => { },
            updateIcon: async () => { },
            setNextCommandId: async () => { },
            restartPtyHost: () => { },
            installAutoReply: async () => { },
            uninstallAllAutoReplies: async () => { },
            onPtyHostUnresponsive: Event.None,
            onPtyHostResponsive: Event.None,
            onPtyHostRestart: Event.None,
            onPtyHostConnected: Event.None,
        };
    }
};
MockChatAgentContribution = __decorate([
    __param(0, IChatAgentService),
    __param(1, IChatSessionsService),
    __param(2, ITerminalService)
], MockChatAgentContribution);
// Register the contribution so it runs during workbench startup
registerWorkbenchContribution2(MockChatAgentContribution.ID, MockChatAgentContribution, 1 /* WorkbenchPhase.BlockStartup */);
// ---------------------------------------------------------------------------
// MockGitService — resolves immediately instead of waiting 10s for delegate
// ---------------------------------------------------------------------------
class MockGitService {
    constructor() {
        this.repositories = [];
    }
    setDelegate(_delegate) { return Disposable.None; }
    async openRepository(_uri) { return undefined; }
}
// ---------------------------------------------------------------------------
// TestSessionsBrowserMain
// ---------------------------------------------------------------------------
/**
 * Test variant of SessionsBrowserMain that injects mock services
 * for E2E testing. Mock singletons are patched into the global
 * singleton registry before `super.open()` so they take effect
 * during both `BrowserMain.initServices()` and `Workbench.initServices()`.
 * Original descriptors are restored when the workbench shuts down.
 */
export class TestSessionsBrowserMain extends SessionsBrowserMain {
    constructor() {
        super(...arguments);
        this._savedDescriptors = [];
    }
    async open() {
        // Patch the global singleton registry BEFORE super.open() calls initServices().
        // getSingletonServiceDescriptors() returns the mutable internal array, so
        // replacing entries here ensures both BrowserMain and Workbench pick up mocks.
        const registry = getSingletonServiceDescriptors();
        const overrides = [
            [IChatEntitlementService, new SyncDescriptor(MockChatEntitlementService)],
            [IDefaultAccountService, new SyncDescriptor(MockDefaultAccountService)],
            [IGitService, new SyncDescriptor(MockGitService)],
        ];
        for (const [serviceId, mockDescriptor] of overrides) {
            const idx = registry.findIndex(([id]) => id === serviceId);
            if (idx !== -1) {
                this._savedDescriptors.push([serviceId, registry[idx][1]]);
                registry[idx] = [serviceId, mockDescriptor];
            }
            else {
                registry.push([serviceId, mockDescriptor]);
            }
        }
        const workbench = await super.open();
        // Restore original descriptors now that the workbench has started,
        // so subsequent tests in the same process are not affected.
        for (const [serviceId, original] of this._savedDescriptors) {
            const idx = registry.findIndex(([id]) => id === serviceId);
            if (idx !== -1) {
                registry[idx] = [serviceId, original];
            }
        }
        return workbench;
    }
    preseedFolder(storageService) {
        const mockFolderUri = URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: '/mock-repo' });
        const providerId = 'default-copilot';
        // Seed recent workspaces so resolveWorkspace() can hydrate the selection
        const recentWorkspaces = JSON.stringify([{ uri: mockFolderUri.toJSON(), providerId, checked: true }]);
        storageService.store('sessions.recentlyPickedWorkspaces', recentWorkspaces, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        console.log(`[Sessions Web Test] Pre-seeded folder: ${mockFolderUri.toString()}`);
    }
    createWorkbench(domElement, serviceCollection, logService) {
        // Register mock-fs:// provider so all services can resolve workspace files
        registerMockFileSystemProvider(serviceCollection);
        this.preseedFolder(serviceCollection.get(IStorageService));
        return new SessionsWorkbench(domElement, undefined, serviceCollection, logService);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy90ZXN0L3dlYi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBS2hHLE9BQU8sRUFBRSxTQUFTLElBQUksaUJBQWlCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN6RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTVELE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZUFBZSxFQUFFLHVCQUF1QixFQUFrQixNQUFNLGdFQUFnRSxDQUFDO0FBQzFJLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBNEMsTUFBTSxnRUFBZ0UsQ0FBQztBQUM3SSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDckYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSwwQ0FBMEMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0MsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVELE9BQU8sRUFBMEIsOEJBQThCLEVBQWtCLE1BQU0seUNBQXlDLENBQUM7QUFFakksT0FBTyxFQUFFLG9CQUFvQixFQUFnSCxNQUFNLDREQUE0RCxDQUFDO0FBQ2hOLE9BQU8sRUFBRSxXQUFXLEVBQXlDLE1BQU0sa0RBQWtELENBQUM7QUFDdEgsT0FBTyxF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