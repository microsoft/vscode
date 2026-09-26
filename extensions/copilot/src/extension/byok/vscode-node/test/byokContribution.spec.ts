/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../platform/log/common/logService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { Emitter } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';

const vscodeMocks = vi.hoisted(() => ({
	executeCommand: vi.fn(),
	registerLanguageModelChatProvider: vi.fn(),
}));

const policyMocks = vi.hoisted(() => ({
	resolveClientBYOKAllowed: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
	create: (providerId: string, providerName = providerId) => class {
		static readonly providerId = providerId;
		static readonly providerName = providerName;
		updateKnownModels(): void { }
	},
}));

vi.mock('vscode', () => ({
	commands: { executeCommand: vscodeMocks.executeCommand },
	lm: { registerLanguageModelChatProvider: vscodeMocks.registerLanguageModelChatProvider },
}));

vi.mock('../byokPolicy', () => ({
	resolveClientBYOKAllowed: policyMocks.resolveClientBYOKAllowed,
}));

vi.mock('../byokStorageService', () => ({
	BYOKStorageService: class { },
}));

vi.mock('../anthropicProvider', () => ({
	AnthropicLMProvider: providerMocks.create('anthropic', 'Anthropic'),
}));

vi.mock('../azureProvider', () => ({
	AzureBYOKModelProvider: providerMocks.create('azure'),
}));

vi.mock('../customEndpointProvider', () => ({
	CustomEndpointBYOKModelProvider: providerMocks.create('customEndpoint'),
}));

vi.mock('../customOAIProvider', () => ({
	CustomOAIBYOKModelProvider: providerMocks.create('customOAI'),
}));

vi.mock('../geminiNativeProvider', () => ({
	GeminiNativeBYOKLMProvider: providerMocks.create('google', 'Google'),
}));

vi.mock('../ollamaProvider', () => ({
	OllamaLMProvider: providerMocks.create('ollama'),
}));

vi.mock('../openAIProvider', () => ({
	OAIBYOKLMProvider: providerMocks.create('openai', 'OpenAI'),
}));

vi.mock('../openRouterProvider', () => ({
	OpenRouterLMProvider: providerMocks.create('openrouter'),
}));

vi.mock('../xAIProvider', () => ({
	XAIBYOKLMProvider: providerMocks.create('xai', 'xAI'),
}));

import { BYOKContrib } from '../byokContribution';

interface TestProviderRegistration {
	dispose: Mock;
}

class TestAuthenticationService {
	private readonly _authenticationChangeEmitter = new Emitter<void>();
	private readonly _copilotTokenChangeEmitter = new Emitter<void>();

	readonly onDidAuthenticationChange = this._authenticationChangeEmitter.event;
	readonly onDidCopilotTokenChange = this._copilotTokenChangeEmitter.event;
	anyGitHubSession: { account: { id: string } } | undefined = { account: { id: 'account-id' } };

	fireAuthenticationChange(): void {
		this._authenticationChangeEmitter.fire();
	}

	fireCopilotTokenChange(): void {
		this._copilotTokenChangeEmitter.fire();
	}
}

class TestConfigurationService {
	private readonly _changeEmitter = new Emitter<{ affectsConfiguration: (section: string) => boolean }>();

	readonly onDidChangeConfiguration = this._changeEmitter.event;

	fireChange(section: string): void {
		this._changeEmitter.fire({ affectsConfiguration: candidate => candidate === section });
	}
}

class TestInstantiationService {
	readonly createInstance = vi.fn((constructor: new (...args: never[]) => object) => new constructor());
}

function createFetcherService(): IFetcherService {
	return {
		fetch: vi.fn().mockResolvedValue({
			json: vi.fn().mockResolvedValue({ version: 1, modelInfo: {} }),
		}),
	} as unknown as IFetcherService;
}

function createLogService(): ILogService {
	return {
		info: vi.fn(),
		warn: vi.fn(),
	} as unknown as ILogService;
}

async function waitForPolicyApplications(count: number): Promise<void> {
	await vi.waitFor(() => expect(policyMocks.resolveClientBYOKAllowed).toHaveBeenCalledTimes(count));
}

describe('BYOKContrib policy integration', () => {
	let contribution: BYOKContrib | undefined;
	let authService: TestAuthenticationService;
	let configurationService: TestConfigurationService;
	let providerRegistrations: TestProviderRegistration[];

	beforeEach(() => {
		vi.clearAllMocks();
		authService = new TestAuthenticationService();
		configurationService = new TestConfigurationService();
		providerRegistrations = [];
		vscodeMocks.executeCommand.mockResolvedValue(undefined);
		vscodeMocks.registerLanguageModelChatProvider.mockImplementation(() => {
			const registration = { dispose: vi.fn() };
			providerRegistrations.push(registration);
			return registration;
		});
	});

	afterEach(() => {
		contribution?.dispose();
		contribution = undefined;
	});

	function createContribution(): BYOKContrib {
		return new BYOKContrib(
			createFetcherService(),
			createLogService(),
			{} as IVSCodeExtensionContext,
			authService as unknown as IAuthenticationService,
			new TestInstantiationService() as unknown as IInstantiationService,
			configurationService as unknown as IConfigurationService,
		);
	}

	it.each([
		{ policy: 'allow', allowed: true, expectedProviderRegistrations: 9 },
		{ policy: 'deny', allowed: false, expectedProviderRegistrations: 0 },
	])('publishes the initial $policy policy during startup', async ({ allowed, expectedProviderRegistrations }) => {
		policyMocks.resolveClientBYOKAllowed.mockResolvedValue(allowed);
		contribution = createContribution();

		expect(policyMocks.resolveClientBYOKAllowed).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('setContext', 'github.copilot.clientByokEnabled', allowed));

		expect({
			providerRegistrations: vscodeMocks.registerLanguageModelChatProvider.mock.calls.length,
			contextUpdates: vscodeMocks.executeCommand.mock.calls,
		}).toEqual({
			providerRegistrations: expectedProviderRegistrations,
			contextUpdates: [['setContext', 'github.copilot.clientByokEnabled', allowed]],
		});
	});

	it('keeps provider registration and the context key aligned across policy transitions', async () => {
		policyMocks.resolveClientBYOKAllowed.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		contribution = createContribution();

		await vi.waitFor(() => expect(vscodeMocks.registerLanguageModelChatProvider).toHaveBeenCalledTimes(9));
		expect(vscodeMocks.executeCommand).toHaveBeenLastCalledWith('setContext', 'github.copilot.clientByokEnabled', true);

		authService.fireCopilotTokenChange();
		await vi.waitFor(() => expect(vscodeMocks.executeCommand).toHaveBeenLastCalledWith('setContext', 'github.copilot.clientByokEnabled', false));

		expect({
			providerIds: vscodeMocks.registerLanguageModelChatProvider.mock.calls.map(call => call[0]),
			providerDisposals: providerRegistrations.map(registration => registration.dispose.mock.calls.length),
			contextValues: vscodeMocks.executeCommand.mock.calls.map(call => call[2]),
		}).toEqual({
			providerIds: ['ollama', 'anthropic', 'google', 'xai', 'openai', 'openrouter', 'azure', 'customOAI', 'customEndpoint'],
			providerDisposals: Array(9).fill(1),
			contextValues: [true, false],
		});
	});

	it('does not apply a superseded asynchronous policy result', async () => {
		const olderPolicy = new DeferredPromise<boolean>();
		const newerPolicy = new DeferredPromise<boolean>();
		policyMocks.resolveClientBYOKAllowed
			.mockImplementationOnce(() => olderPolicy.p)
			.mockImplementationOnce(() => newerPolicy.p);
		contribution = createContribution();
		await waitForPolicyApplications(1);
		const olderIsCurrent = policyMocks.resolveClientBYOKAllowed.mock.calls[0][4] as () => boolean;
		expect(olderIsCurrent()).toBe(true);

		authService.fireAuthenticationChange();
		await waitForPolicyApplications(2);
		const newerIsCurrent = policyMocks.resolveClientBYOKAllowed.mock.calls[1][4] as () => boolean;
		expect({ older: olderIsCurrent(), newer: newerIsCurrent() }).toEqual({ older: false, newer: true });
		await newerPolicy.complete(false);
		await vi.waitFor(() => expect(vscodeMocks.executeCommand).toHaveBeenCalledOnce());
		await olderPolicy.complete(true);
		await Promise.resolve();

		expect({
			providerRegistrations: vscodeMocks.registerLanguageModelChatProvider.mock.calls.length,
			contextUpdates: vscodeMocks.executeCommand.mock.calls,
		}).toEqual({
			providerRegistrations: 0,
			contextUpdates: [['setContext', 'github.copilot.clientByokEnabled', false]],
		});
	});

	it('reevaluates policy when its identity changes without coupling authenticated policy to endpoint overrides', async () => {
		policyMocks.resolveClientBYOKAllowed.mockResolvedValue(false);
		contribution = createContribution();
		await waitForPolicyApplications(1);

		configurationService.fireChange(ConfigKey.Shared.DebugOverrideCAPIUrl.fullyQualifiedId);
		await Promise.resolve();
		expect(policyMocks.resolveClientBYOKAllowed).toHaveBeenCalledTimes(1);

		configurationService.fireChange(ConfigKey.Shared.AuthProvider.fullyQualifiedId);
		await waitForPolicyApplications(2);

		authService.anyGitHubSession = undefined;
		configurationService.fireChange(ConfigKey.Shared.DebugOverrideCAPIUrl.fullyQualifiedId);
		await waitForPolicyApplications(3);
	});
});
