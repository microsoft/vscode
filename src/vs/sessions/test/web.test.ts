/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IBrowserMainWorkbench } from '../../workbench/browser/web.main.js';
import { Workbench as SessionsWorkbench } from '../browser/workbench.js';
import { SessionsBrowserMain } from '../browser/web.main.js';
import { Event } from '../../base/common/event.js';
import { CancellationToken } from '../../base/common/cancellation.js';
import { IObservable, observableValue } from '../../base/common/observable.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../workbench/services/chat/common/chatEntitlementService.js';
import { IDefaultAccountService } from '../../platform/defaultAccount/common/defaultAccount.js';
import { IDefaultAccount, IDefaultAccountAuthenticationProvider, ICopilotTokenInfo, IPolicyData } from '../../base/common/defaultAccount.js';

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

/**
 * Test variant of SessionsBrowserMain that injects mock services
 * for E2E testing (auth, entitlements).
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
