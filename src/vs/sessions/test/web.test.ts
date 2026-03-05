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
import { IChatSessionsService, IChatSessionItem, ChatSessionStatus } from '../../workbench/contrib/chat/common/chatSessionsService.js';

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
// Mock chat responses
// ---------------------------------------------------------------------------

function getMockResponse(message: string): string {
	if (/build|compile/i.test(message)) {
		return [
			'I\'ll help you build the project. Here are the changes:\n',
			'```typescript\n// src/build.ts\nimport { main } from "./index";\n\nasync function build() {\n\tconsole.log("Building...");\n\tmain();\n\tconsole.log("Build complete!");\n}\n\nbuild();\n```\n',
			'I\'ve created a new build script.',
		].join('\n');
	}
	if (/fix|bug/i.test(message)) {
		return 'I found the issue and applied the fix. The input validation has been added.';
	}
	if (/explain/i.test(message)) {
		return 'This project has a simple structure with a main entry point and utility functions.';
	}
	return 'I understand your request. Let me work on that.\n\n1. Review the codebase\n2. Make changes\n3. Run tests';
}

// ---------------------------------------------------------------------------
// Workbench contribution — registers mock chat agent and pre-seeds folder
// ---------------------------------------------------------------------------

class MockChatAgentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.test.mockChatAgent';

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();
		this.registerMockAgents();
		this.registerMockSessionProvider();
		this.preseedFolder();
	}

	private registerMockAgents(): void {
		const agentIds = ['copilotcli', 'copilot', 'copilot-cloud-agent'];
		const extensionId = new ExtensionIdentifier('vscode.sessions-e2e-mock');

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
					const responseText = getMockResponse(request.message);
					progress([{
						kind: 'markdownContent',
						content: { value: responseText, isTrusted: false, supportThemeIcons: false, supportHtml: false },
					}]);
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
		// Register a chat session content provider for the 'copilotcli' scheme.
		// This is normally provided by the GitHub Copilot Chat extension.
		const schemes = ['copilotcli', 'copilot-cloud-agent'];
		const itemsChangedEmitter = new Emitter<void>();
		const sessionItems: IChatSessionItem[] = [];

		for (const scheme of schemes) {
			try {
				this._register(this.chatSessionsService.registerChatSessionContentProvider(scheme, {
					async provideChatSessionContent(sessionResource, _token) {
						console.log(`[Sessions Web Test] Creating mock chat session for ${sessionResource.toString()}`);
						const disposeEmitter = new Emitter<void>();
						const isComplete = observableValue('isComplete', false);
						return {
							sessionResource,
							history: [],
							isCompleteObs: isComplete,
							onWillDispose: disposeEmitter.event,
							async requestHandler(request, progress, _history, _token) {
								console.log(`[Sessions Web Test] Session request: "${request.message}"`);
								const responseText = getMockResponse(request.message);
								progress([{
									kind: 'markdownContent',
									content: { value: responseText, isTrusted: false, supportThemeIcons: false, supportHtml: false },
								}]);
								isComplete.set(true, undefined);

								// Add to session list
								const now = Date.now();
								sessionItems.push({
									resource: sessionResource,
									label: request.message.slice(0, 50) || 'Mock Session',
									status: ChatSessionStatus.Completed,
									timing: { created: now, lastRequestStarted: now, lastRequestEnded: now },
								});
								itemsChangedEmitter.fire();
							},
							dispose() { disposeEmitter.fire(); disposeEmitter.dispose(); },
						};
					},
				}));

				// Register an item controller so sessions appear in the sidebar list
				this._register(this.chatSessionsService.registerChatSessionItemController(scheme, {
					onDidChangeChatSessionItems: itemsChangedEmitter.event,
					get items() { return sessionItems; },
					async refresh() { /* no-op for in-memory */ },
				}));

				console.log(`[Sessions Web Test] Registered session provider for scheme: ${scheme}`);
			} catch (err) {
				console.warn(`[Sessions Web Test] Failed to register session provider for ${scheme}:`, err);
			}
		}
	}

	private preseedFolder(): void {
		const mockFolderUri = URI.from({ scheme: 'mock-fs', authority: 'mock-repo', path: '/' }).toString();
		this.storageService.store('agentSessions.lastPickedFolder', mockFolderUri, StorageScope.PROFILE, StorageTarget.MACHINE);
		console.log(`[Sessions Web Test] Pre-seeded folder: ${mockFolderUri}`);
	}
}

// Register the contribution so it runs during workbench startup
registerWorkbenchContribution2(MockChatAgentContribution.ID, MockChatAgentContribution, WorkbenchPhase.BlockStartup);

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

		// Override entitlement service so Sessions thinks user is signed in
		serviceCollection.set(IChatEntitlementService, new MockChatEntitlementService());

		// Override default account service to hide the "Sign In" button
		serviceCollection.set(IDefaultAccountService, new MockDefaultAccountService());

		console.log('[Sessions Web Test] Creating Sessions workbench with mocks');
		return new SessionsWorkbench(domElement, undefined, serviceCollection, logService);
	}
}
