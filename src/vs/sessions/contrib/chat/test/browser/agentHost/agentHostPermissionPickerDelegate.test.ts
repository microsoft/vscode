/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IResolveSessionConfigResult, ISessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema } from '../../../browser/agentHost/agentHostPermissionPickerDelegate.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';

const PROVIDER_ID = 'local-agent-host';
const SESSION_ID = 'local-agent-host:s1';

function makeWellKnownConfig(value: string | undefined): IResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				autoApprove: {
					title: 'Auto Approve',
					description: '',
					type: 'string',
					enum: ['default', 'autoApprove', 'autopilot'],
					sessionMutable: true,
				},
			},
		},
		values: value === undefined ? {} : { autoApprove: value },
	} as IResolveSessionConfigResult;
}

class FakeProvider implements Pick<IAgentHostSessionsProvider, 'id' | 'onDidChangeSessionConfig' | 'getSessionConfig' | 'setSessionConfigValue'> {
	readonly id: string = PROVIDER_ID;
	private readonly _onDidChange = new Emitter<string>();
	readonly onDidChangeSessionConfig: Event<string> = this._onDidChange.event;

	config: IResolveSessionConfigResult | undefined;
	readonly setCalls: Array<[string, string, string]> = [];

	getSessionConfig(_sessionId: string): IResolveSessionConfigResult | undefined {
		return this.config;
	}
	async setSessionConfigValue(sessionId: string, property: string, value: string): Promise<void> {
		this.setCalls.push([sessionId, property, value]);
	}
	fireChange(sessionId: string = SESSION_ID): void {
		this._onDidChange.fire(sessionId);
	}
	dispose(): void {
		this._onDidChange.dispose();
	}
}

interface ITestRig {
	readonly delegate: AgentHostPermissionPickerDelegate;
	readonly provider: FakeProvider;
	readonly activeSessionObs: ReturnType<typeof observableValue<IActiveSession | undefined>>;
}

function setup(store: Pick<DisposableStore, 'add'>, activeSession: IActiveSession | undefined, configValue?: string): ITestRig {
	const provider = new FakeProvider();
	store.add({ dispose: () => provider.dispose() });
	if (configValue !== undefined) {
		provider.config = makeWellKnownConfig(configValue);
	}
	const onDidChangeProviders = store.add(new Emitter<ISessionsProvidersChangeEvent>());
	const sessionsProvidersService = new (class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = onDidChangeProviders.event;
		override getProviders(): ISessionsProvider[] { return [provider as unknown as ISessionsProvider]; }
		override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
			return id === provider.id ? (provider as unknown as T) : undefined;
		}
	})();
	const activeSessionObs = observableValue<IActiveSession | undefined>('activeSession', activeSession);
	const sessionsManagementService = new (class extends mock<ISessionsManagementService>() {
		override readonly activeSession = activeSessionObs;
	})();

	const insta = store.add(new TestInstantiationService());
	insta.set(ISessionsManagementService, sessionsManagementService);
	insta.set(ISessionsProvidersService, sessionsProvidersService);

	const delegate = store.add(insta.createInstance(AgentHostPermissionPickerDelegate));
	return { delegate, provider, activeSessionObs };
}

function makeActiveSession(): IActiveSession {
	return { providerId: PROVIDER_ID, sessionId: SESSION_ID } as IActiveSession;
}

suite('AgentHostPermissionPickerDelegate', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('returns Default when there is no active session', () => {
		const { delegate } = setup(store, undefined);

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('returns Default when the active session has no config seeded yet', () => {
		const { delegate } = setup(store, makeActiveSession());

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('reflects the active session\'s autoApprove value and updates on provider change', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'autoApprove');

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.AutoApprove);

		provider.config = makeWellKnownConfig('autopilot');
		provider.fireChange();
		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Autopilot);

		provider.config = makeWellKnownConfig('default');
		provider.fireChange();
		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('falls back to Default when the stored value is unrecognized', () => {
		const { delegate } = setup(store, makeActiveSession(), 'something-else');

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('setPermissionLevel writes through to the active session\'s provider', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');

		delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
		delegate.setPermissionLevel(ChatPermissionLevel.Autopilot);

		assert.deepStrictEqual(provider.setCalls, [
			[SESSION_ID, 'autoApprove', 'autoApprove'],
			[SESSION_ID, 'autoApprove', 'autopilot'],
		]);
	});

	test('setPermissionLevel is a no-op when there is no active session', () => {
		const { delegate, provider } = setup(store, undefined);

		delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);

		assert.deepStrictEqual(provider.setCalls, []);
	});

	test('isApplicable reacts to active session and config changes', () => {
		const { delegate, provider, activeSessionObs } = setup(store, undefined);

		// No active session → false
		assert.strictEqual(delegate.isApplicable.get(), false);

		// Active session, no config seeded → false
		activeSessionObs.set(makeActiveSession(), undefined);
		assert.strictEqual(delegate.isApplicable.get(), false);

		// Active session with well-known schema → true
		provider.config = makeWellKnownConfig('default');
		provider.fireChange();
		assert.strictEqual(delegate.isApplicable.get(), true);

		// Active session cleared → false (covers the 'back to new chat view' regression)
		activeSessionObs.set(undefined, undefined);
		assert.strictEqual(delegate.isApplicable.get(), false);
	});
});

suite('isWellKnownAutoApproveSchema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function schema(overrides: Partial<ISessionConfigPropertySchema> = {}): ISessionConfigPropertySchema {
		return {
			title: 'Auto Approve',
			description: 'desc',
			type: 'string',
			enum: ['default', 'autoApprove', 'autopilot'],
			...overrides,
		} as ISessionConfigPropertySchema;
	}

	test('matches the canonical three-value enum', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema()), true);
	});

	test('matches a subset that still contains "default"', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['default', 'autoApprove'] })), true);
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['default'] })), true);
	});

	test('rejects schemas missing the required "default" value', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['autoApprove', 'autopilot'] })), false);
	});

	test('rejects schemas with unknown enum values', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['default', 'custom'] })), false);
	});

	test('rejects non-string types and missing/empty enums', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ type: 'number' as 'string' })), false);
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: undefined })), false);
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: [] })), false);
	});
});
