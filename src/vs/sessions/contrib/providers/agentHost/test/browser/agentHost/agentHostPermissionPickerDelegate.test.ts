/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { type IConfigurationOverrides, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ResolveSessionConfigResult, SessionConfigPropertySchema } from '../../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../../../../workbench/contrib/chat/common/constants.js';
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownClaudePermissionModeSchema, isWellKnownModeSchema, isWellKnownModeValue } from '../../../browser/agentHostPermissionPickerDelegate.js';
import { getPermissionLevelMeta } from '../../../../copilotChatSessions/browser/permissionPicker.js';
import { IAgentHostSessionsProvider } from '../../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession } from '../../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../../services/sessions/browser/sessionsService.js';

const PROVIDER_ID = 'local-agent-host';
const SESSION_ID = 'local-agent-host:s1';

function makeWellKnownConfig(value: string | undefined, levels: readonly string[] = ['default', 'assisted', 'autoApprove']): ResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				autoApprove: {
					title: 'Auto Approve',
					description: '',
					type: 'string',
					enum: [...levels],
					sessionMutable: true,
				},
			},
		},
		values: value === undefined ? {} : { autoApprove: value },
	} as ResolveSessionConfigResult;
}

class FakeProvider implements Pick<IAgentHostSessionsProvider, 'id' | 'onDidChangeSessionConfig' | 'getSessionConfig' | 'setSessionConfigValue' | 'isSessionConfigResolving'> {
	readonly id: string = PROVIDER_ID;
	private readonly _onDidChange = new Emitter<string>();
	readonly onDidChangeSessionConfig: Event<string> = this._onDidChange.event;

	config: ResolveSessionConfigResult | undefined;
	readonly setCalls: Array<[string, string, string]> = [];

	getSessionConfig(_sessionId: string): ResolveSessionConfigResult | undefined {
		return this.config;
	}
	isSessionConfigResolving(_sessionId: string) {
		return constObservable(false);
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
	readonly setAssistedPermissionsEnabled: (enabled: boolean) => void;
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
	let assistedPermissionsEnabled = true;
	const configurationService = new class extends mock<IConfigurationService>() {
		override getValue<T>(): T;
		override getValue<T>(section: string): T;
		override getValue<T>(overrides: IConfigurationOverrides): T;
		override getValue<T>(section: string, overrides: IConfigurationOverrides): T;
		override getValue<T>(section?: string | IConfigurationOverrides): T {
			return (section === ChatConfiguration.AssistedPermissionsEnabled ? assistedPermissionsEnabled : undefined) as T;
		}
	}();
	const sessionsManagementService = new (class extends mock<ISessionsService>() {
		override readonly activeSession = activeSessionObs;
	})();

	const insta = store.add(new TestInstantiationService());
	insta.set(ISessionsService, sessionsManagementService);
	insta.set(ISessionsProvidersService, sessionsProvidersService);
	insta.set(IConfigurationService, configurationService);

	const delegate = store.add(insta.createInstance(AgentHostPermissionPickerDelegate, activeSessionObs));
	return { delegate, provider, activeSessionObs, setAssistedPermissionsEnabled: enabled => assistedPermissionsEnabled = enabled };
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

		provider.config = makeWellKnownConfig('default');
		provider.fireChange();
		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('maps a legacy autoApprove=autopilot value to Default (Autopilot moved onto the mode axis)', () => {
		const { delegate } = setup(store, makeActiveSession(), 'autopilot');

		// `autopilot` is no longer a valid approval level — the picker does not
		// offer it, so the chip must surface Default rather than a level it
		// cannot render.
		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('falls back to Default when the stored value is unrecognized', () => {
		const { delegate } = setup(store, makeActiveSession(), 'something-else');

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('setPermissionLevel writes through to the active session\'s provider', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');

		delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
		delegate.setPermissionLevel(ChatPermissionLevel.Assisted);
		delegate.setPermissionLevel(ChatPermissionLevel.Default);

		assert.deepStrictEqual(provider.setCalls, [
			[SESSION_ID, 'autoApprove', 'autoApprove'],
			[SESSION_ID, 'autoApprove', 'assisted'],
			[SESSION_ID, 'autoApprove', 'default'],
		]);
	});

	test('offers Default approvals, Assisted permissions, and Allow all in order', () => {
		const { delegate } = setup(store, makeActiveSession(), 'assisted');

		assert.deepStrictEqual({
			current: delegate.currentPermissionLevel.get(),
			metadata: delegate.availableLevels.map(level => {
				const baseMeta = getPermissionLevelMeta(level);
				const { label, detail, hover } = delegate.getPermissionLevelMeta(level, baseMeta);
				return { label, detail, hover };
			}),
			available: delegate.availableLevels,
		}, {
			current: ChatPermissionLevel.Assisted,
			metadata: [
				{ label: 'Default approvals', detail: 'Asks when approval settings don\'t apply', hover: undefined },
				{ label: 'Assisted permissions', detail: 'Evaluates risk before running tools', hover: 'An LLM judge evaluates each tool call. Tools it doesn\'t approve require your approval.' },
				{ label: 'Allow all', detail: 'Runs tool calls without asking', hover: undefined },
			],
			available: [
				ChatPermissionLevel.Default,
				ChatPermissionLevel.Assisted,
				ChatPermissionLevel.AutoApprove,
			],
		});
	});

	test('offers only levels advertised by the active schema', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');
		provider.config = makeWellKnownConfig('default', ['default', 'autoApprove']);
		provider.fireChange();

		assert.deepStrictEqual(delegate.availableLevels, [
			ChatPermissionLevel.Default,
			ChatPermissionLevel.AutoApprove,
		]);
	});

	test('hides and rejects Assisted permissions when the setting is disabled', () => {
		const { delegate, provider, setAssistedPermissionsEnabled } = setup(store, makeActiveSession(), 'default');
		setAssistedPermissionsEnabled(false);

		delegate.setPermissionLevel(ChatPermissionLevel.Assisted);

		assert.deepStrictEqual({
			available: delegate.availableLevels,
			setCalls: provider.setCalls,
		}, {
			available: [
				ChatPermissionLevel.Default,
				ChatPermissionLevel.AutoApprove,
			],
			setCalls: [],
		});
	});

	test('does not write a level omitted by the active schema', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');
		provider.config = makeWellKnownConfig('default', ['default', 'autoApprove']);
		provider.fireChange();

		delegate.setPermissionLevel(ChatPermissionLevel.Assisted);

		assert.deepStrictEqual(provider.setCalls, []);
	});

	test('setPermissionLevel is a no-op when there is no active session', () => {
		const { delegate, provider } = setup(store, undefined);

		delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);

		assert.deepStrictEqual(provider.setCalls, []);
	});

	test('provides agent-host-specific hover copy for permission levels', () => {
		const { delegate } = setup(store, makeActiveSession(), 'autoApprove');

		assert.strictEqual(
			delegate.getPermissionLevelHover(ChatPermissionLevel.AutoApprove, getPermissionLevelMeta(ChatPermissionLevel.AutoApprove)),
			'Copilot runs all tools without asking for approval.'
		);
	});

	test('provides agent-host-specific hover copy for Approve When Safe', () => {
		const { delegate } = setup(store, makeActiveSession(), 'assisted');

		assert.strictEqual(
			delegate.getPermissionLevelHover(ChatPermissionLevel.Assisted, getPermissionLevelMeta(ChatPermissionLevel.Assisted)),
			'An LLM judge evaluates each tool call. Tools it doesn\'t approve require your approval.'
		);
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

	function schema(overrides: Partial<SessionConfigPropertySchema> = {}): SessionConfigPropertySchema {
		return {
			title: 'Auto Approve',
			description: 'desc',
			type: 'string',
			enum: ['default', 'assisted', 'autoApprove'],
			...overrides,
		} as SessionConfigPropertySchema;
	}

	test('matches the canonical three-value enum', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema()), true);
	});

	test('still accepts a legacy enum that contains "autopilot" for backward compatibility', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['default', 'autoApprove', 'autopilot'] })), true);
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

suite('isWellKnownModeSchema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function schema(overrides: Partial<SessionConfigPropertySchema> = {}): SessionConfigPropertySchema {
		return {
			title: 'Agent Mode',
			description: 'desc',
			type: 'string',
			enum: ['interactive', 'plan'],
			...overrides,
		} as SessionConfigPropertySchema;
	}

	test('matches the canonical two-value enum', () => {
		assert.strictEqual(isWellKnownModeSchema(schema()), true);
	});

	test('matches a subset that still contains "interactive"', () => {
		assert.strictEqual(isWellKnownModeSchema(schema({ enum: ['interactive'] })), true);
	});

	test('rejects schemas missing the required "interactive" value', () => {
		assert.strictEqual(isWellKnownModeSchema(schema({ enum: ['plan'] })), false);
	});

	test('rejects non-string types and missing/empty enums', () => {
		assert.strictEqual(isWellKnownModeSchema(schema({ type: 'number' as 'string' })), false);
		assert.strictEqual(isWellKnownModeSchema(schema({ enum: undefined })), false);
		assert.strictEqual(isWellKnownModeSchema(schema({ enum: [] })), false);
	});

	test('accepts only values still present in the current schema', () => {
		assert.deepStrictEqual({
			interactive: isWellKnownModeValue(schema(), 'interactive'),
			plan: isWellKnownModeValue(schema(), 'plan'),
			removed: isWellKnownModeValue(schema({ enum: ['interactive'] }), 'plan'),
			unknownSchema: isWellKnownModeValue(schema({ enum: ['plan'] }), 'plan'),
		}, {
			interactive: true,
			plan: true,
			removed: false,
			unknownSchema: false,
		});
	});
});

suite('isWellKnownClaudePermissionModeSchema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function schema(overrides: Partial<SessionConfigPropertySchema> = {}): SessionConfigPropertySchema {
		return {
			title: 'Approvals',
			description: 'desc',
			type: 'string',
			enum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
			...overrides,
		} as SessionConfigPropertySchema;
	}

	test('matches the canonical permission-mode enum', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema()), true);
	});

	test('matches a subset that still contains "default"', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ['default', 'acceptEdits'] })), true);
	});

	test('rejects schemas that include unsupported SDK-only values', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions', 'dontAsk'] })), false);
	});

	test('rejects schemas missing "default" or containing custom values', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ['acceptEdits', 'plan'] })), false);
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ['default', 'custom'] })), false);
	});

	test('rejects non-string types and missing enums', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ type: 'number' as 'string' })), false);
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: undefined })), false);
	});
});
