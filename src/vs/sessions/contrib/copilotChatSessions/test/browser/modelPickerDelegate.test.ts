/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { getAvailableModels, modelPickerStorageKey, SessionModelPicker } from '../../browser/copilotChatSessionsActions.js';
import { CopilotCLISessionType } from '../../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { ClaudeCodeSessionType } from '../../browser/copilotChatSessionsProvider.js';

function makeModel(id: string, sessionType: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: id,
		metadata: { targetChatSessionType: sessionType } as ILanguageModelChatMetadata,
	};
}

function stubServices(
	disposables: DisposableStore,
	opts?: {
		models?: ILanguageModelChatMetadataAndIdentifier[];
		activeSession?: Partial<IActiveSession>;
		storedEntries?: Map<string, string>;
		setModelSpy?: (sessionId: string, modelId: string) => void;
	},
): { instantiationService: TestInstantiationService; storage: Map<string, string>; activeSession: ReturnType<typeof observableValue<IActiveSession | undefined>>; fireLanguageModelsChanged: () => void } {
	const instantiationService = disposables.add(new TestInstantiationService());
	const models = opts?.models ?? [];
	const storage = opts?.storedEntries ?? new Map<string, string>();

	const activeSession = opts?.activeSession
		? observableValue<IActiveSession | undefined>('activeSession', opts.activeSession as IActiveSession)
		: observableValue<IActiveSession | undefined>('activeSession', undefined);

	const setModelSpy = opts?.setModelSpy ?? (() => { });

	const onDidChangeLanguageModelsEmitter = disposables.add(new Emitter<{ added?: readonly { identifier: string }[]; removed?: readonly string[] }>());

	instantiationService.stub(ILanguageModelsService, {
		onDidChangeLanguageModels: onDidChangeLanguageModelsEmitter.event,
		getLanguageModelIds: () => models.map(m => m.identifier),
		lookupLanguageModel: (id: string) => models.find(m => m.identifier === id)?.metadata,
	} as Partial<ILanguageModelsService>);

	instantiationService.stub(IStorageService, {
		get: (key: string, _scope: StorageScope) => storage.get(key),
		store: (key: string, value: string, _scope: StorageScope, _target: StorageTarget) => { storage.set(key, value); },
	} as Partial<IStorageService>);

	const provider: Partial<ISessionsProvider> = {
		id: 'default-copilot',
		setModel: setModelSpy,
	};

	instantiationService.stub(ISessionsManagementService, {
		activeSession,
	} as unknown as ISessionsManagementService);

	instantiationService.stub(ISessionsProvidersService, {
		onDidChangeProviders: Event.None,
		getProviders: () => [provider as ISessionsProvider],
	} as Partial<ISessionsProvidersService>);

	// Stub IInstantiationService so SessionModelPicker can call createInstance for ModelPickerActionItem
	instantiationService.stub(IInstantiationService, instantiationService);

	instantiationService.stub(IChatEntitlementService, {
		quotas: {},
		onDidChangeQuotaRemaining: Event.None,
		onDidChangeUsageBasedBilling: Event.None,
		onDidChangeEntitlement: Event.None,
	} as Partial<IChatEntitlementService>);

	instantiationService.stub(ITelemetryService, NullTelemetryService);

	return { instantiationService, storage, activeSession, fireLanguageModelsChanged: () => onDidChangeLanguageModelsEmitter.fire({}) };
}

suite('modelPickerStorageKey', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('produces per-session-type keys', () => {
		assert.strictEqual(modelPickerStorageKey(CopilotCLISessionType.id), `sessions.modelPicker.${CopilotCLISessionType.id}.selectedModelId`);
		assert.strictEqual(modelPickerStorageKey(ClaudeCodeSessionType.id), `sessions.modelPicker.${ClaudeCodeSessionType.id}.selectedModelId`);
	});
});

suite('getAvailableModels', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns empty when no active session', () => {
		const models = [makeModel('model-1', CopilotCLISessionType.id)];
		const { instantiationService } = stubServices(disposables, { models });
		const languageModelsService = instantiationService.get(ILanguageModelsService);
		const sessionsManagementService = instantiationService.get(ISessionsManagementService);
		const result = getAvailableModels(languageModelsService, sessionsManagementService);
		assert.deepStrictEqual(result, []);
	});

	test('filters models by session type', () => {
		const models = [
			makeModel('cli-model', CopilotCLISessionType.id),
			makeModel('cloud-model', 'copilot-cloud'),
			makeModel('claude-model', ClaudeCodeSessionType.id),
		];
		const { instantiationService } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 'sess-1', sessionType: ClaudeCodeSessionType.id },
		});
		const languageModelsService = instantiationService.get(ILanguageModelsService);
		const sessionsManagementService = instantiationService.get(ISessionsManagementService);
		const result = getAvailableModels(languageModelsService, sessionsManagementService);
		assert.deepStrictEqual(result, [models[2]]);
	});
});

suite('SessionModelPicker', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('stores selected model under session-type-scoped key', () => {
		const models = [makeModel('model-1', ClaudeCodeSessionType.id)];
		const { instantiationService, storage } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 'sess-1', sessionType: ClaudeCodeSessionType.id },
		});
		// Creating the picker triggers initModel which calls setModel for the first available model
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		assert.strictEqual(storage.get(modelPickerStorageKey(ClaudeCodeSessionType.id)), 'model-1');
		assert.strictEqual(storage.has(modelPickerStorageKey(CopilotCLISessionType.id)), false);
	});

	test('calls provider.setModel on init', () => {
		const calls: { sessionId: string; modelId: string }[] = [];
		const models = [makeModel('model-1', ClaudeCodeSessionType.id)];
		const { instantiationService } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 'sess-1', sessionType: ClaudeCodeSessionType.id },
			setModelSpy: (sessionId, modelId) => calls.push({ sessionId, modelId }),
		});
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		assert.ok(calls.some(c => c.sessionId === 'sess-1' && c.modelId === 'model-1'));
	});

	test('remembers model per session type from storage', () => {
		const models = [makeModel('model-a', ClaudeCodeSessionType.id), makeModel('model-b', ClaudeCodeSessionType.id)];
		const storedEntries = new Map([[modelPickerStorageKey(ClaudeCodeSessionType.id), 'model-b']]);
		const calls: { sessionId: string; modelId: string }[] = [];
		const { instantiationService } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 'sess-1', sessionType: ClaudeCodeSessionType.id },
			storedEntries,
			setModelSpy: (sessionId, modelId) => calls.push({ sessionId, modelId }),
		});
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		// Should pick model-b (remembered) instead of model-a (first)
		assert.ok(calls.some(c => c.modelId === 'model-b'));
	});

	test('does not throw when no active session', () => {
		const { instantiationService } = stubServices(disposables);
		assert.doesNotThrow(() => disposables.add(instantiationService.createInstance(SessionModelPicker)));
	});

	test('different session types use independent storage keys', () => {
		const cliModels = [makeModel('cli-m', CopilotCLISessionType.id)];
		const claudeModels = [makeModel('claude-m', ClaudeCodeSessionType.id)];
		const allModels = [...cliModels, ...claudeModels];

		const { instantiationService, storage, activeSession } = stubServices(disposables, {
			models: allModels,
			activeSession: { providerId: 'default-copilot', sessionId: 's1', sessionType: CopilotCLISessionType.id },
		});
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		assert.strictEqual(storage.get(modelPickerStorageKey(CopilotCLISessionType.id)), 'cli-m');

		// Switch session type
		activeSession.set({ providerId: 'default-copilot', sessionId: 's2', sessionType: ClaudeCodeSessionType.id } as IActiveSession, undefined);

		assert.strictEqual(storage.get(modelPickerStorageKey(ClaudeCodeSessionType.id)), 'claude-m');
		// CLI key should still be intact
		assert.strictEqual(storage.get(modelPickerStorageKey(CopilotCLISessionType.id)), 'cli-m');
	});

	test('propagates selected model to a new session of the same type (#313385)', () => {
		const models = [makeModel('cli-a', CopilotCLISessionType.id), makeModel('cli-b', CopilotCLISessionType.id)];
		const storedEntries = new Map([[modelPickerStorageKey(CopilotCLISessionType.id), 'cli-b']]);
		const calls: { sessionId: string; modelId: string }[] = [];
		const { instantiationService, activeSession } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 's1', sessionType: CopilotCLISessionType.id },
			storedEntries,
			setModelSpy: (sessionId, modelId) => calls.push({ sessionId, modelId }),
		});
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		// Initial session receives the remembered model.
		assert.ok(calls.some(c => c.sessionId === 's1' && c.modelId === 'cli-b'));

		// Switch to a new session of the same type (e.g. user picked a different repo).
		activeSession.set({ providerId: 'default-copilot', sessionId: 's2', sessionType: CopilotCLISessionType.id } as IActiveSession, undefined);

		// The new session must receive the same model so the request isn't sent with the default.
		assert.ok(calls.some(c => c.sessionId === 's2' && c.modelId === 'cli-b'));
	});

	test('does not re-push model to the same session when language models change', () => {
		const models = [makeModel('cli-a', CopilotCLISessionType.id)];
		const calls: { sessionId: string; modelId: string }[] = [];
		const { instantiationService, fireLanguageModelsChanged } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 's1', sessionType: CopilotCLISessionType.id },
			setModelSpy: (sessionId, modelId) => calls.push({ sessionId, modelId }),
		});
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		const initialCallCount = calls.filter(c => c.sessionId === 's1').length;
		assert.ok(initialCallCount > 0, 'expected initial setModel to fire');

		// Re-fire language-models-changed multiple times. The active session and
		// selected model haven't changed, so the provider must not be re-notified.
		fireLanguageModelsChanged();
		fireLanguageModelsChanged();

		assert.strictEqual(calls.filter(c => c.sessionId === 's1').length, initialCallCount);
	});
});
