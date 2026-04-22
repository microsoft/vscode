/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { CLAUDE_CODE_SESSION_TYPE, COPILOT_CLI_SESSION_TYPE } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { getAvailableModels, modelPickerStorageKey, SessionModelPicker } from '../../browser/copilotChatSessionsActions.js';

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
): { instantiationService: TestInstantiationService; storage: Map<string, string>; activeSession: ReturnType<typeof observableValue<IActiveSession | undefined>> } {
	const instantiationService = disposables.add(new TestInstantiationService());
	const models = opts?.models ?? [];
	const storage = opts?.storedEntries ?? new Map<string, string>();

	const activeSession = opts?.activeSession
		? observableValue<IActiveSession | undefined>('activeSession', opts.activeSession as IActiveSession)
		: observableValue<IActiveSession | undefined>('activeSession', undefined);

	const setModelSpy = opts?.setModelSpy ?? (() => { });

	instantiationService.stub(ILanguageModelsService, {
		onDidChangeLanguageModels: Event.None,
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

	return { instantiationService, storage, activeSession };
}

suite('modelPickerStorageKey', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('produces per-session-type keys', () => {
		assert.strictEqual(modelPickerStorageKey(COPILOT_CLI_SESSION_TYPE), `sessions.modelPicker.${COPILOT_CLI_SESSION_TYPE}.selectedModelId`);
		assert.strictEqual(modelPickerStorageKey(CLAUDE_CODE_SESSION_TYPE), `sessions.modelPicker.${CLAUDE_CODE_SESSION_TYPE}.selectedModelId`);
	});
});

suite('getAvailableModels', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns empty when no active session', () => {
		const models = [makeModel('model-1', COPILOT_CLI_SESSION_TYPE)];
		const { instantiationService } = stubServices(disposables, { models });
		const languageModelsService = instantiationService.get(ILanguageModelsService);
		const sessionsManagementService = instantiationService.get(ISessionsManagementService);
		const result = getAvailableModels(languageModelsService, sessionsManagementService);
		assert.deepStrictEqual(result, []);
	});

	test('filters models by session type', () => {
		const models = [
			makeModel('cli-model', COPILOT_CLI_SESSION_TYPE),
			makeModel('cloud-model', 'copilot-cloud'),
			makeModel('claude-model', CLAUDE_CODE_SESSION_TYPE),
		];
		const { instantiationService } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 'sess-1', sessionType: CLAUDE_CODE_SESSION_TYPE },
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
		const models = [makeModel('model-1', CLAUDE_CODE_SESSION_TYPE)];
		const { instantiationService, storage } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 'sess-1', sessionType: CLAUDE_CODE_SESSION_TYPE },
		});
		// Creating the picker triggers initModel which calls setModel for the first available model
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		assert.strictEqual(storage.get(modelPickerStorageKey(CLAUDE_CODE_SESSION_TYPE)), 'model-1');
		assert.strictEqual(storage.has(modelPickerStorageKey(COPILOT_CLI_SESSION_TYPE)), false);
	});

	test('calls provider.setModel on init', () => {
		const calls: { sessionId: string; modelId: string }[] = [];
		const models = [makeModel('model-1', CLAUDE_CODE_SESSION_TYPE)];
		const { instantiationService } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 'sess-1', sessionType: CLAUDE_CODE_SESSION_TYPE },
			setModelSpy: (sessionId, modelId) => calls.push({ sessionId, modelId }),
		});
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		assert.ok(calls.some(c => c.sessionId === 'sess-1' && c.modelId === 'model-1'));
	});

	test('remembers model per session type from storage', () => {
		const models = [makeModel('model-a', CLAUDE_CODE_SESSION_TYPE), makeModel('model-b', CLAUDE_CODE_SESSION_TYPE)];
		const storedEntries = new Map([[modelPickerStorageKey(CLAUDE_CODE_SESSION_TYPE), 'model-b']]);
		const calls: { sessionId: string; modelId: string }[] = [];
		const { instantiationService } = stubServices(disposables, {
			models,
			activeSession: { providerId: 'default-copilot', sessionId: 'sess-1', sessionType: CLAUDE_CODE_SESSION_TYPE },
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
		const cliModels = [makeModel('cli-m', COPILOT_CLI_SESSION_TYPE)];
		const claudeModels = [makeModel('claude-m', CLAUDE_CODE_SESSION_TYPE)];
		const allModels = [...cliModels, ...claudeModels];

		const { instantiationService, storage, activeSession } = stubServices(disposables, {
			models: allModels,
			activeSession: { providerId: 'default-copilot', sessionId: 's1', sessionType: COPILOT_CLI_SESSION_TYPE },
		});
		disposables.add(instantiationService.createInstance(SessionModelPicker));
		assert.strictEqual(storage.get(modelPickerStorageKey(COPILOT_CLI_SESSION_TYPE)), 'cli-m');

		// Switch session type
		activeSession.set({ providerId: 'default-copilot', sessionId: 's2', sessionType: CLAUDE_CODE_SESSION_TYPE } as IActiveSession, undefined);

		assert.strictEqual(storage.get(modelPickerStorageKey(CLAUDE_CODE_SESSION_TYPE)), 'claude-m');
		// CLI key should still be intact
		assert.strictEqual(storage.get(modelPickerStorageKey(COPILOT_CLI_SESSION_TYPE)), 'cli-m');
	});
});
