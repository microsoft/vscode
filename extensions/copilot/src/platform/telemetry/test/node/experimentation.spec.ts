/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { IExperimentationService as ITASExperimentationService } from 'vscode-tas-client';
import { mock } from '../../../../util/common/test/simpleMock';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../extContext/common/extensionContext';
import { ILogService } from '../../../log/common/logService';
import { FetchOptions, HeadersImpl, IFetcherService, Response } from '../../../networking/common/fetcherService';
import { createPlatformServices, ITestingServicesAccessor } from '../../../test/node/services';
import { TreatmentsChangeEvent } from '../../common/nullExperimentationService';
import { createTasFetch } from '../../vscode-node/tasFetch';
import { BaseExperimentationService, RevocationGate, TASClientDelegateFn, UserInfoStore } from '../../node/baseExperimentationService';


function toExpectedTreatment(name: string, org: string | undefined, sku: string | undefined): string | undefined {
	return `${name}.${org}.${sku}`;
}

class TestExperimentationService extends BaseExperimentationService {
	private _mockTasService: MockTASExperimentationService | undefined;

	constructor(
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@ICopilotTokenStore tokenStore: ICopilotTokenStore,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService
	) {
		const delegateFn: TASClientDelegateFn = (globalState: any, userInfoStore: UserInfoStore) => {
			return new MockTASExperimentationService(userInfoStore);
		};

		super(delegateFn, extensionContext, tokenStore, configurationService, logService);
		this._mockTasService = this._delegate as MockTASExperimentationService;
	}

	get mockTasService(): MockTASExperimentationService {
		if (!this._mockTasService) {
			throw new Error('Mock TAS service not initialized');
		}
		return this._mockTasService;
	}
}

/** Captures the memento + revocation gate handed to each delegate generation. */
class RevocationTestExperimentationService extends BaseExperimentationService {
	public readonly captured: { memento: vscode.Memento; gate: RevocationGate }[];

	constructor(
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@ICopilotTokenStore tokenStore: ICopilotTokenStore,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService
	) {
		const captured: { memento: vscode.Memento; gate: RevocationGate }[] = [];
		const delegateFn: TASClientDelegateFn = (memento, userInfoStore, gate) => {
			captured.push({ memento, gate });
			return new MockTASExperimentationService(userInfoStore);
		};

		super(delegateFn, extensionContext, tokenStore, configurationService, logService);
		this.captured = captured;
	}

	recreate(): void {
		this.recreateDelegate();
	}
}

class MockTASExperimentationService implements ITASExperimentationService {
	private _initializePromise: Promise<void> | undefined;
	private _initialFetch: Promise<void> | undefined;
	private _initialized = false;
	private _fetchedTreatments = false;
	public refreshCallCount = 0;
	public treatmentRequests: Array<{ configId: string; name: string; org: string | undefined; sku: string | undefined }> = [];

	constructor(private userInfoStore: UserInfoStore) { }

	get initializePromise(): Promise<void> {
		if (this._initializePromise) {
			return this._initializePromise;
		}

		// Resolve after 100ms to simulate async initialization
		this._initializePromise = new Promise<void>((resolve) => {
			setTimeout(() => {
				this._initialized = true;
				resolve();
			}, 100);
		});

		return this._initializePromise;
	}

	get initialFetch(): Promise<void> {
		if (this._initialFetch) {
			return this._initialFetch;
		}

		// Resolve after 100ms to simulate async fetch
		this._initialFetch = new Promise<void>((resolve) => {
			setTimeout(() => {
				this._fetchedTreatments = true;
				resolve();
			}, 100);
		});

		return this._initialFetch;
	}

	isFlightEnabled(flight: string): boolean {
		throw new Error('Method not implemented.');
	}
	isCachedFlightEnabled(flight: string): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	isFlightEnabledAsync(flight: string): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	getTreatmentVariable<T extends boolean | number | string>(configId: string, name: string): T | undefined {
		if (!this._initialized) {
			return undefined;
		}

		if (!this._fetchedTreatments) {
			return undefined;
		}

		// This suite models treatments served by the legacy endpoint (bare keys). The new
		// assignments endpoint does not assign these, so scoped lookups resolve to undefined,
		// exercising the service's bare-key fallback.
		if (name.startsWith('/vscode/')) {
			return undefined;
		}

		const org = this.userInfoStore.internalOrg;
		const sku = this.userInfoStore.sku;

		// Track requests for testing
		this.treatmentRequests.push({ configId, name, org, sku });

		return toExpectedTreatment(name, org, sku) as T | undefined;
	}

	getTreatmentVariableAsync<T extends boolean | number | string>(configId: string, name: string, checkCache?: boolean): Promise<T | undefined> {
		// Track refresh calls
		if (configId === 'vscode' && name === 'refresh') {
			this.refreshCallCount++;
		}
		return Promise.resolve(this.getTreatmentVariable(configId, name));
	}

	// Test helper methods
	reset(): void {
		this.refreshCallCount = 0;
		this.treatmentRequests = [];
	}

	dispose(): void { }
}

describe('ExP Service Tests', () => {
	let accessor: ITestingServicesAccessor;
	let expService: TestExperimentationService;
	let copilotTokenService: ICopilotTokenStore;
	let extensionContext: IVSCodeExtensionContext;

	const GitHubProToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token-gh-pro', username: 'fake', sku: 'pro', copilot_plan: 'unknown', organization_list: ['4535c7beffc844b46bb1ed4aa04d759a'] }));
	const GitHubAndMicrosoftEnterpriseToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token-gh-msft-enterprise', username: 'fake', sku: 'enterprise', copilot_plan: 'unknown', organization_list: ['4535c7beffc844b46bb1ed4aa04d759a', 'a5db0bcaae94032fe715fb34a5e4bce2'] }));
	const MicrosoftEnterpriseToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token-msft-enterprise', username: 'fake', sku: 'enterprise', copilot_plan: 'unknown', organization_list: ['a5db0bcaae94032fe715fb34a5e4bce2'] }));
	const NoOrgFreeToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token-no-org-free', username: 'fake', sku: 'free', copilot_plan: 'unknown' }));
	const VscodeTeamMemberToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token-vscode-team', username: 'fake', sku: 'enterprise', copilot_plan: 'unknown', isVscodeTeamMember: true }));
	const NonVscodeTeamMemberToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token-non-vscode-team', username: 'fake', sku: 'enterprise', copilot_plan: 'unknown', isVscodeTeamMember: false }));
	const SnEnabledToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'sn=1;tid=test', username: 'fake', sku: 'pro', copilot_plan: 'unknown', organization_list: ['4535c7beffc844b46bb1ed4aa04d759a'] }));
	const SnDisabledToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'sn=0;tid=test', username: 'fake', sku: 'pro', copilot_plan: 'unknown', organization_list: ['4535c7beffc844b46bb1ed4aa04d759a'] }));

	beforeAll(() => {
		const testingServiceCollection = createPlatformServices();
		accessor = testingServiceCollection.createTestingAccessor();
		extensionContext = accessor.get(IVSCodeExtensionContext);
		copilotTokenService = accessor.get(ICopilotTokenStore);
		expService = accessor.get(IInstantiationService).createInstance(TestExperimentationService);
	});

	beforeEach(() => {
		// Reset the mock service before each test
		expService.mockTasService.reset();
		// Clear any existing tokens
		copilotTokenService.copilotToken = undefined;
	});

	const GetNewTreatmentsChangedPromise = () => {
		return new Promise<TreatmentsChangeEvent>((resolve) => {
			expService.onDidTreatmentsChange((event) => {
				resolve(event);
			});
		});
	};

	it('revokes a superseded delegate so its late writes are dropped', async () => {
		const svc = accessor.get(IInstantiationService).createInstance(RevocationTestExperimentationService);
		const globalState = accessor.get(IVSCodeExtensionContext).globalState;

		expect(svc.captured.length).toBe(1);
		svc.recreate();
		expect(svc.captured.length).toBe(2);

		const [gen1, gen2] = svc.captured;
		expect(gen1.gate.isRevoked).toBe(true);
		expect(gen2.gate.isRevoked).toBe(false);

		// A superseded (revoked) generation's writes are dropped; the current one's land.
		await gen1.memento.update('exp.revoke.test', 'stale');
		expect(globalState.get('exp.revoke.test')).toBeUndefined();
		await gen2.memento.update('exp.revoke.test', 'fresh');
		expect(globalState.get('exp.revoke.test')).toBe('fresh');

		svc.dispose();
	});

	it('should return treatments based on copilot token', async () => {
		await expService.hasTreatments();
		let expectedTreatment = toExpectedTreatment('a', undefined, undefined);
		let treatment = expService.getTreatmentVariable<string>('a');
		expect(treatment).toBe(expectedTreatment);

		let treatmentsChangePromise = GetNewTreatmentsChangedPromise();

		// Sign in as GitHub with Pro SKU
		copilotTokenService.copilotToken = GitHubProToken;
		await treatmentsChangePromise;

		expectedTreatment = toExpectedTreatment('a', 'github', 'pro');
		treatment = expService.getTreatmentVariable<string>('a');
		expect(treatment).toBe(expectedTreatment);

		treatmentsChangePromise = GetNewTreatmentsChangedPromise();

		// Sign in as GitHub and Microsoft with Enterprise SKU
		copilotTokenService.copilotToken = GitHubAndMicrosoftEnterpriseToken;
		await treatmentsChangePromise;

		expectedTreatment = toExpectedTreatment('a', 'github', 'enterprise');
		treatment = expService.getTreatmentVariable<string>('a');
		expect(treatment).toBe(expectedTreatment);

		treatmentsChangePromise = GetNewTreatmentsChangedPromise();

		// Sign in as Microsoft with Enterprise SKU
		copilotTokenService.copilotToken = MicrosoftEnterpriseToken;
		await treatmentsChangePromise;

		expectedTreatment = toExpectedTreatment('a', 'microsoft', 'enterprise');
		treatment = expService.getTreatmentVariable<string>('a');
		expect(treatment).toBe(expectedTreatment);

		treatmentsChangePromise = GetNewTreatmentsChangedPromise();

		// Sign in as NoOrg with Free SKU
		copilotTokenService.copilotToken = NoOrgFreeToken;
		await treatmentsChangePromise;

		expectedTreatment = toExpectedTreatment('a', undefined, 'free');
		treatment = expService.getTreatmentVariable<string>('a');
		expect(treatment).toBe(expectedTreatment);

		treatmentsChangePromise = GetNewTreatmentsChangedPromise();

		// Sign out
		copilotTokenService.copilotToken = undefined;
		await treatmentsChangePromise;

		expectedTreatment = toExpectedTreatment('a', undefined, undefined);
		treatment = expService.getTreatmentVariable<string>('a');
		expect(treatment).toBe(expectedTreatment);
	});

	it('should trigger treatments refresh when user info changes', async () => {
		await expService.hasTreatments();

		// Reset mock to track refresh calls
		expService.mockTasService.reset();

		// Change token should trigger refresh
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = GitHubProToken;
		await treatmentsChangePromise;

		// Verify refresh was called
		expect(expService.mockTasService.refreshCallCount).toBe(1);
	});

	it('should handle cached user info on initialization', async () => {
		// Simulate cached values in global state
		await extensionContext.globalState.update(UserInfoStore.INTERNAL_ORG_STORAGE_KEY, 'github');
		await extensionContext.globalState.update(UserInfoStore.SKU_STORAGE_KEY, 'pro');

		// Create new service instance to test initialization
		const newExpService = accessor.get(IInstantiationService).createInstance(TestExperimentationService);
		await newExpService.hasTreatments();

		// Should use cached values initially
		const treatment = newExpService.getTreatmentVariable<string>('test');
		expect(treatment).toBe(toExpectedTreatment('test', 'github', 'pro'));

		// Clean up
		await extensionContext.globalState.update(UserInfoStore.INTERNAL_ORG_STORAGE_KEY, undefined);
		await extensionContext.globalState.update(UserInfoStore.SKU_STORAGE_KEY, undefined);
	});

	it('should handle multiple treatment variables', async () => {
		await expService.hasTreatments();

		// Set up promise BEFORE token change
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = GitHubProToken;
		await treatmentsChangePromise;

		// Test string treatment
		const stringTreatment = expService.getTreatmentVariable<string>('stringVar');
		expect(stringTreatment).toBe(toExpectedTreatment('stringVar', 'github', 'pro'));

		// Test different config and variable names
		const anotherTreatment = expService.getTreatmentVariable<string>('featureFlag');
		expect(anotherTreatment).toBe(toExpectedTreatment('featureFlag', 'github', 'pro'));

		// Verify all requests were tracked
		const requests = expService.mockTasService.treatmentRequests;
		expect(requests.some(r => r.name === 'stringVar')).toBe(true);
		expect(requests.some(r => r.name === 'featureFlag')).toBe(true);
	});

	it('should not fire events when relevant user info does not change', async () => {
		await expService.hasTreatments();

		// Query a treatment to register it for change detection
		expService.getTreatmentVariable<string>('testTreatment');

		// Set initial token with promise BEFORE token change
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = GitHubProToken;
		await treatmentsChangePromise;

		// Reset mock
		expService.mockTasService.reset();

		let eventFired = false;
		const eventHandler = () => { eventFired = true; };
		expService.onDidTreatmentsChange(eventHandler);

		// We need a separate token just to make sure we get passed the copilot token change guard
		const newGitHubProToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'github-test', username: 'fake',
			sku: 'pro', copilot_plan: 'unknown',
			organization_list: ['4535c7beffc844b46bb1ed4aa04d759a']
		}));
		copilotTokenService.copilotToken = newGitHubProToken; // Same token

		// Wait a bit to see if event fires
		await new Promise(resolve => setTimeout(resolve, 50));

		// Event should not have fired since user info didn't change
		expect(eventFired).toBe(false);
		expect(expService.mockTasService.refreshCallCount).toBe(0);
	});

	it('should detect GitHub organization correctly', async () => {
		await expService.hasTreatments();

		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = GitHubProToken;
		await treatmentsChangePromise;

		const treatment = expService.getTreatmentVariable<string>('orgTest');
		expect(treatment).toBe(toExpectedTreatment('orgTest', 'github', 'pro'));
	});

	it('should detect GitHub and Microsoft organization correctly', async () => {
		await expService.hasTreatments();

		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = GitHubAndMicrosoftEnterpriseToken;
		await treatmentsChangePromise;

		const treatment = expService.getTreatmentVariable<string>('orgTest');
		expect(treatment).toBe(toExpectedTreatment('orgTest', 'github', 'enterprise'));
	});

	it('should detect Microsoft organization correctly', async () => {
		await expService.hasTreatments();

		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = MicrosoftEnterpriseToken;
		await treatmentsChangePromise;

		const treatment = expService.getTreatmentVariable<string>('orgTest');
		expect(treatment).toBe(toExpectedTreatment('orgTest', 'microsoft', 'enterprise'));
	});

	it('should handle no organization correctly', async () => {
		await expService.hasTreatments();

		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = NoOrgFreeToken;
		await treatmentsChangePromise;

		const treatment = expService.getTreatmentVariable<string>('orgTest');
		expect(treatment).toBe(toExpectedTreatment('orgTest', undefined, 'free'));
	});

	it('should return undefined before initialization completes', async () => {
		// Create a fresh service that hasn't been initialized yet
		const newExpService = accessor.get(IInstantiationService).createInstance(TestExperimentationService);

		// Should return undefined before initialization
		const treatmentBeforeInit = newExpService.getTreatmentVariable<string>('test');
		expect(treatmentBeforeInit).toBeUndefined();

		// Initialize and verify it works
		await newExpService.hasTreatments();
		const treatmentAfterInit = newExpService.getTreatmentVariable<string>('test');
		expect(treatmentAfterInit).toBeDefined();
	});

	it('should persist user info to global state', async () => {
		await expService.hasTreatments();

		// Clear any existing cached values
		await extensionContext.globalState.update(UserInfoStore.INTERNAL_ORG_STORAGE_KEY, undefined);
		await extensionContext.globalState.update(UserInfoStore.SKU_STORAGE_KEY, undefined);

		// Set a token and wait for update
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = GitHubProToken;
		await treatmentsChangePromise;

		// Verify values were cached in global state
		const cachedOrg = extensionContext.globalState.get<string>(UserInfoStore.INTERNAL_ORG_STORAGE_KEY);
		const cachedSku = extensionContext.globalState.get<string>(UserInfoStore.SKU_STORAGE_KEY);
		expect(cachedOrg).toBe('github');
		expect(cachedSku).toBe('pro');
	});

	it('should only include previously queried treatments in change events', async () => {
		await expService.hasTreatments();

		// Query one treatment before sign-in
		const queriedTreatment = expService.getTreatmentVariable<string>('queriedTreatment');
		expect(queriedTreatment).toBe(toExpectedTreatment('queriedTreatment', undefined, undefined));

		// Don't query another treatment (notQueriedTreatment)

		// Set up promise for treatment changes
		let treatmentChangePromise = GetNewTreatmentsChangedPromise();

		// Sign in - this should trigger treatment changes
		copilotTokenService.copilotToken = GitHubProToken;
		let treatmentChangeEvent = await treatmentChangePromise;

		// Verify only the previously queried treatment is in the affected list
		expect(treatmentChangeEvent).toBeDefined();
		expect(treatmentChangeEvent.affectedTreatmentVariables).toContain('queriedTreatment');
		expect(treatmentChangeEvent.affectedTreatmentVariables).not.toContain('notQueriedTreatment');

		// Now query the treatment that wasn't queried before to verify it has the new value
		const notQueriedTreatment = expService.getTreatmentVariable<string>('notQueriedTreatment');
		expect(notQueriedTreatment).toBe(toExpectedTreatment('notQueriedTreatment', 'github', 'pro'));

		// And verify the previously queried treatment has the updated value
		const updatedQueriedTreatment = expService.getTreatmentVariable<string>('queriedTreatment');
		expect(updatedQueriedTreatment).toBe(toExpectedTreatment('queriedTreatment', 'github', 'pro'));

		// Set up promise for treatment changes
		treatmentChangePromise = GetNewTreatmentsChangedPromise();

		// Sign out - this should trigger another treatment change event
		copilotTokenService.copilotToken = undefined;
		treatmentChangeEvent = await treatmentChangePromise;

		// Verify both queried treatments are in the affected list now
		expect(treatmentChangeEvent).toBeDefined();
		expect(treatmentChangeEvent.affectedTreatmentVariables).toContain('queriedTreatment');
		expect(treatmentChangeEvent.affectedTreatmentVariables).toContain('notQueriedTreatment');

		// Verify both treatments have the signed-out value
		const signedOutQueriedTreatment = expService.getTreatmentVariable<string>('queriedTreatment');
		expect(signedOutQueriedTreatment).toBe(toExpectedTreatment('queriedTreatment', undefined, undefined));
		const signedOutNotQueriedTreatment = expService.getTreatmentVariable<string>('notQueriedTreatment');
		expect(signedOutNotQueriedTreatment).toBe(toExpectedTreatment('notQueriedTreatment', undefined, undefined));
	});

	it('should detect VS Code team member correctly', async () => {
		await expService.hasTreatments();

		// Sign in as VS Code team member
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = VscodeTeamMemberToken;
		await treatmentsChangePromise;

		// Verify isVscodeTeamMember is set in UserInfoStore
		const userInfoStore = new UserInfoStore(extensionContext, copilotTokenService);
		expect(userInfoStore.isVscodeTeamMember).toBe(true);
	});

	it('should detect non-VS Code team member correctly', async () => {
		await expService.hasTreatments();

		// Sign in as non VS Code team member
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = NonVscodeTeamMemberToken;
		await treatmentsChangePromise;

		// Verify isVscodeTeamMember is set correctly in UserInfoStore
		const userInfoStore = new UserInfoStore(extensionContext, copilotTokenService);
		expect(userInfoStore.isVscodeTeamMember).toBe(false);
	});

	it('should persist VS Code team member status to global state', async () => {
		await expService.hasTreatments();

		// Clear any existing cached values
		await extensionContext.globalState.update(UserInfoStore.IS_VSCODE_TEAM_MEMBER_STORAGE_KEY, undefined);

		// Set a token and wait for update
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = VscodeTeamMemberToken;
		await treatmentsChangePromise;

		// Verify value was cached in global state
		const cachedIsVscodeTeamMember = extensionContext.globalState.get<boolean>(UserInfoStore.IS_VSCODE_TEAM_MEMBER_STORAGE_KEY);
		expect(cachedIsVscodeTeamMember).toBe(true);
	});

	it('should use cached VS Code team member status on initialization', async () => {
		// Simulate cached value in global state
		await extensionContext.globalState.update(UserInfoStore.IS_VSCODE_TEAM_MEMBER_STORAGE_KEY, true);

		// Create new UserInfoStore instance to test initialization
		const newUserInfoStore = new UserInfoStore(extensionContext, copilotTokenService);

		// Should use cached value initially (when no token is present)
		expect(newUserInfoStore.isVscodeTeamMember).toBe(true);

		// Clean up
		await extensionContext.globalState.update(UserInfoStore.IS_VSCODE_TEAM_MEMBER_STORAGE_KEY, undefined);
	});

	it('should track organization list for targeting', async () => {
		await expService.hasTreatments();

		// Set a token with organizations
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = GitHubAndMicrosoftEnterpriseToken;
		await treatmentsChangePromise;

		// Verify organization list is correctly tracked
		const userInfoStore = new UserInfoStore(extensionContext, copilotTokenService);
		expect(userInfoStore.organizationList).toBeDefined();
		expect(userInfoStore.organizationList).toContain('4535c7beffc844b46bb1ed4aa04d759a'); // GitHub org
		expect(userInfoStore.organizationList).toContain('a5db0bcaae94032fe715fb34a5e4bce2'); // Microsoft org
	});

	it('should persist organization list to global state', async () => {
		await expService.hasTreatments();

		// Clear any existing cached values
		await extensionContext.globalState.update(UserInfoStore.ORGANIZATION_LIST_STORAGE_KEY, undefined);

		// Set a token and wait for update
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = GitHubAndMicrosoftEnterpriseToken;
		await treatmentsChangePromise;

		// Verify value was cached in global state
		const cachedOrgList = extensionContext.globalState.get<string[]>(UserInfoStore.ORGANIZATION_LIST_STORAGE_KEY);
		expect(cachedOrgList).toBeDefined();
		expect(cachedOrgList).toContain('4535c7beffc844b46bb1ed4aa04d759a');
		expect(cachedOrgList).toContain('a5db0bcaae94032fe715fb34a5e4bce2');
	});

	it('should use cached organization list on initialization', async () => {
		// Simulate cached value in global state
		const testOrgList = ['org1', 'org2', 'org3'];
		await extensionContext.globalState.update(UserInfoStore.ORGANIZATION_LIST_STORAGE_KEY, testOrgList);

		// Create new UserInfoStore instance to test initialization
		const newUserInfoStore = new UserInfoStore(extensionContext, copilotTokenService);

		// Should use cached value initially (when no token is present)
		expect(newUserInfoStore.organizationList).toEqual(testOrgList);

		// Clean up
		await extensionContext.globalState.update(UserInfoStore.ORGANIZATION_LIST_STORAGE_KEY, undefined);
	});

	it('should handle empty organization list', async () => {
		await expService.hasTreatments();

		// Set a token with no organizations
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = NoOrgFreeToken;
		await treatmentsChangePromise;

		// Verify organization list is empty
		const userInfoStore = new UserInfoStore(extensionContext, copilotTokenService);
		expect(userInfoStore.organizationList).toBeDefined();
		expect(userInfoStore.organizationList?.length).toBe(0);
	});

	it('should trigger treatment refresh when VS Code team membership changes', async () => {
		await expService.hasTreatments();

		// Start as signed out
		copilotTokenService.copilotToken = undefined;

		// Wait a bit for any pending state
		await new Promise(resolve => setTimeout(resolve, 50));

		// Reset mock to track refresh calls
		expService.mockTasService.reset();

		// Sign in as VS Code team member - this will trigger a user info change (from undefined to a value)
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = VscodeTeamMemberToken;
		await treatmentsChangePromise;

		// Verify refresh was called
		expect(expService.mockTasService.refreshCallCount).toBe(1);

		// Verify the UserInfoStore has the correct value
		const userInfoStore = new UserInfoStore(extensionContext, copilotTokenService);
		expect(userInfoStore.isVscodeTeamMember).toBe(true);
	});

	it('should detect sn token flag correctly', async () => {
		await expService.hasTreatments();

		// Sign in with sn=1 token
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = SnEnabledToken;
		await treatmentsChangePromise;

		// Verify isSn is set in UserInfoStore
		const userInfoStore = new UserInfoStore(extensionContext, copilotTokenService);
		expect(userInfoStore.isSn).toBe(true);
	});

	it('should detect sn token flag as false when explicitly disabled', async () => {
		await expService.hasTreatments();

		// Sign in with sn=0 token
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = SnDisabledToken;
		await treatmentsChangePromise;

		// Verify isSn is false in UserInfoStore
		const userInfoStore = new UserInfoStore(extensionContext, copilotTokenService);
		expect(userInfoStore.isSn).toBe(false);
	});

	it('should persist sn flag to global state', async () => {
		await expService.hasTreatments();

		// Clear any existing cached values
		await extensionContext.globalState.update(UserInfoStore.IS_SN_STORAGE_KEY, undefined);

		// Set a token and wait for update
		const treatmentsChangePromise = GetNewTreatmentsChangedPromise();
		copilotTokenService.copilotToken = SnEnabledToken;
		await treatmentsChangePromise;

		// Verify value was cached in global state
		const cachedIsSn = extensionContext.globalState.get<boolean>(UserInfoStore.IS_SN_STORAGE_KEY);
		expect(cachedIsSn).toBe(true);
	});

	it('should use cached sn flag on initialization', async () => {
		// Simulate cached value in global state
		await extensionContext.globalState.update(UserInfoStore.IS_SN_STORAGE_KEY, true);

		// Create new UserInfoStore instance to test initialization
		const newUserInfoStore = new UserInfoStore(extensionContext, copilotTokenService);

		// Should use cached value initially (when no token is present)
		expect(newUserInfoStore.isSn).toBe(true);

		// Clean up
		await extensionContext.globalState.update(UserInfoStore.IS_SN_STORAGE_KEY, undefined);
	});
});

/**
 * A delegate whose initial fetch is completed manually, so tests can control ordering, and
 * that records when it is disposed. Used to exercise endpoint-driven delegate recreation.
 */
class ControllableMockTAS implements ITASExperimentationService {
	public disposed = false;
	private _resolveInitialFetch!: () => void;
	private readonly _treatments = new Map<string, boolean | number | string>();

	readonly initializePromise = Promise.resolve();
	readonly initialFetch: Promise<void>;

	constructor() {
		this.initialFetch = new Promise<void>(resolve => { this._resolveInitialFetch = resolve; });
	}

	completeInitialFetch(): void {
		this._resolveInitialFetch();
	}

	setTreatment(name: string, value: boolean | number | string): void {
		this._treatments.set(name, value);
	}

	isFlightEnabled(): boolean { throw new Error('Method not implemented.'); }
	isCachedFlightEnabled(): Promise<boolean> { throw new Error('Method not implemented.'); }
	isFlightEnabledAsync(): Promise<boolean> { throw new Error('Method not implemented.'); }
	getTreatmentVariable<T extends boolean | number | string>(_configId: string, name: string): T | undefined {
		return this._treatments.get(name) as T | undefined;
	}
	getTreatmentVariableAsync<T extends boolean | number | string>(configId: string, name: string): Promise<T | undefined> {
		return Promise.resolve(this.getTreatmentVariable<T>(configId, name));
	}
	dispose(): void { this.disposed = true; }
}

class RecreatableExperimentationService extends BaseExperimentationService {
	public readonly delegates: ControllableMockTAS[];

	constructor(
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@ICopilotTokenStore tokenStore: ICopilotTokenStore,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService
	) {
		const delegates: ControllableMockTAS[] = [];
		const delegateFn: TASClientDelegateFn = () => {
			const delegate = new ControllableMockTAS();
			delegates.push(delegate);
			return delegate;
		};

		super(delegateFn, extensionContext, tokenStore, configurationService, logService);
		this.delegates = delegates;
	}

	triggerRecreate(): void {
		this.recreateDelegate();
	}
}

describe('ExP Service delegate recreation', () => {
	let accessor: ITestingServicesAccessor;

	beforeAll(() => {
		const testingServiceCollection = createPlatformServices();
		accessor = testingServiceCollection.createTestingAccessor();
	});

	const create = () => accessor.get(IInstantiationService).createInstance(RecreatableExperimentationService);

	it('disposes the previous delegate and switches to the new one on recreation', () => {
		const service = create();
		expect(service.delegates.length).toBe(1);
		const first = service.delegates[0];

		service.triggerRecreate();

		expect(service.delegates.length).toBe(2);
		const second = service.delegates[1];
		expect(first.disposed).toBe(true);
		expect(second.disposed).toBe(false);

		// The final delegate is disposed together with the service.
		service.dispose();
		expect(second.disposed).toBe(true);
	});

	it('ignores a superseded delegate\'s initial fetch completion', async () => {
		const service = create();
		const first = service.delegates[0];

		// Seed a previously-read treatment so a change would be detectable if (wrongly) signaled.
		first.setTreatment('x', 'v0');
		expect(service.getTreatmentVariable<string>('x')).toBe('v0');

		service.triggerRecreate();
		service.delegates[1].setTreatment('x', 'v1');

		let fired = false;
		service.onDidTreatmentsChange(() => { fired = true; });

		// The superseded (first) delegate completing its fetch must not signal changes.
		first.completeInitialFetch();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(fired).toBe(false);

		service.dispose();
	});

	it('signals treatment changes after the replacement delegate completes its initial fetch', async () => {
		const service = create();
		const first = service.delegates[0];

		first.setTreatment('x', 'v0');
		expect(service.getTreatmentVariable<string>('x')).toBe('v0');

		service.triggerRecreate();
		const second = service.delegates[1];
		second.setTreatment('x', 'v1');

		const changePromise = new Promise<TreatmentsChangeEvent>(resolve => {
			service.onDidTreatmentsChange(resolve);
		});

		second.completeInitialFetch();
		const event = await changePromise;

		expect(event.affectedTreatmentVariables).toContain('x');
		expect(service.getTreatmentVariable<string>('x')).toBe('v1');

		service.dispose();
	});
});

describe('ExP Service scoped treatment resolution', () => {
	let accessor: ITestingServicesAccessor;

	beforeAll(() => {
		const testingServiceCollection = createPlatformServices();
		accessor = testingServiceCollection.createTestingAccessor();
	});

	const create = () => accessor.get(IInstantiationService).createInstance(RecreatableExperimentationService);

	it('resolves a treatment served only under the /vscode/ assignments scope prefix', () => {
		const service = create();
		const delegate = service.delegates[0];

		// The new assignments endpoint returns the key with a `/vscode/` scope prefix only.
		delegate.setTreatment('/vscode/config.chat.copilot.subagentModelGuidance.enabled', true);

		expect(service.getTreatmentVariable<boolean>('config.chat.copilot.subagentModelGuidance.enabled')).toBe(true);

		service.dispose();
	});

	it('prefers the /vscode/ scoped key (new endpoint) over the bare key on collision', () => {
		const service = create();
		const delegate = service.delegates[0];

		delegate.setTreatment('config.foo', 'bare');
		delegate.setTreatment('/vscode/config.foo', 'scoped');

		expect(service.getTreatmentVariable<string>('config.foo')).toBe('scoped');

		service.dispose();
	});
});

/**
 * Records every request routed through the fetcher service so a test can assert that both TAS
 * endpoints go through it (proxy-aware transport) with the expected method and call site.
 */
class RecordingFetcherService extends mock<IFetcherService>() {
	public readonly calls: { url: string; method: string; callSite: string; body?: string }[] = [];

	override readonly onDidFetch = Event.None;
	override readonly onDidCompleteFetch = Event.None;

	override getUserAgentLibrary(): string {
		return 'test-fetcher';
	}

	override fetch(url: string, options: FetchOptions): Promise<Response> {
		this.calls.push({ url, method: options.method ?? 'GET', callSite: options.callSite, body: options.body });
		return Promise.resolve(Response.fromText(200, 'OK', new HeadersImpl({}), '{}', 'test-stub'));
	}
}

describe('TAS proxy transport adapter', () => {

	it('routes both the legacy GET and the assignments POST through the fetcher service with the expected call sites', async () => {
		const fetcher = new RecordingFetcherService();
		const tasFetch = createTasFetch(fetcher);

		await tasFetch('https://default.exp-tas.com/vscode/ab', { method: 'GET', headers: { 'X-Legacy': '1' } });
		await tasFetch('https://exp.example.test/vscode/api/v1/assignments', { method: 'POST', headers: { 'X-New': '1' }, body: '{"parameters":{}}' });

		expect(fetcher.calls).toEqual([
			{ url: 'https://default.exp-tas.com/vscode/ab', method: 'GET', callSite: 'exp.legacy', body: undefined },
			{ url: 'https://exp.example.test/vscode/api/v1/assignments', method: 'POST', callSite: 'exp.assignments', body: '{"parameters":{}}' },
		]);
	});
});
