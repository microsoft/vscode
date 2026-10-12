/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { AgentHostSandboxKey, ISandboxConfigValue } from '../../common/sandboxConfigSchema.js';
import { readSessionSandboxPolicy } from '../../common/meta/agentSandboxPolicyMeta.js';
import { readSessionSandboxState, withSessionSandboxState } from '../../common/meta/agentSandboxStateMeta.js';
import { omitTransientSessionConfigValues, SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildChatUri, buildSubagentSessionUri, MessageKind, SessionStatus, ToolCallStatus } from '../../common/state/sessionState.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { getCopilotBrowserSandboxNetworkRestrictions, projectCopilotSandboxPolicy } from '../../node/copilot/copilotSandboxPolicy.js';
import { buildSandboxConfigForSdk } from '../../node/copilot/sandboxConfigForSdk.js';
import { getSessionSandboxConfig, getSessionSandboxOverrides } from '../../node/sessionSandbox.js';
import { SessionPermissionManager } from '../../node/sessionPermissions.js';
import { createSessionDataService } from '../common/sessionTestHelpers.js';

suite('Session sandbox configuration', () => {
	test('current working directory access defaults on and resolves deny-wins through serialized policy', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('working-directory-policy');
		const results = [];
		for (const local of [undefined, false, true]) {
			for (const managed of [undefined, false, true]) {
				configuration.updateRootConfig({
					sandbox: {
						enabled: 'on',
						...(local !== undefined ? { [AgentHostSandboxKey.AddCurrentWorkingDirectory]: local } : {}),
					}
				});
				configuration.setSessionSandboxPolicy(owner, projectCopilotSandboxPolicy({
					source: 'server', serverManaged: true, deviceManaged: false,
					failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
					settings: { sandbox: { enabled: true, ...(managed !== undefined ? { addCurrentWorkingDirectory: managed } : {}) } },
				}, owner, new NullLogService()));
				results.push({
					sdk: buildSandboxConfigForSdk('win32', getSessionSandboxConfig(configuration, owner))?.addCurrentWorkingDirectory,
					policy: readSessionSandboxPolicy(JSON.parse(JSON.stringify(manager.getSessionState(owner))))?.addCurrentWorkingDirectory,
				});
			}
		}
		assert.deepStrictEqual(results, [
			{ sdk: true, policy: undefined }, { sdk: false, policy: false }, { sdk: true, policy: true },
			{ sdk: false, policy: undefined }, { sdk: false, policy: false }, { sdk: false, policy: true },
			{ sdk: true, policy: undefined }, { sdk: false, policy: false }, { sdk: true, policy: true },
		]);
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupSession() {
		const manager = store.add(new AgentHostStateManager(new NullLogService()));
		const configuration = store.add(new AgentConfigurationService(manager, new NullLogService()));
		const create = (id: string, values: Record<string, unknown> = {}) => {
			const session = `copilot:/${id}`;
			manager.createSession({
				resource: session, provider: 'copilot', title: id, status: SessionStatus.Idle,
				createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z',
			});
			manager.setSessionConfig(session, { schema: platformSessionSchema.toProtocol(), values });
			return session;
		};
		return { manager, configuration, create };
	}

	test('advertises an optional mutable selection without materializing a default', () => {
		assert.deepStrictEqual({
			values: platformSessionSchema.validateOrDefault({}, {}),
			property: platformSessionSchema.toProtocol().properties.sandboxEnabled.enum,
			mutable: platformSessionSchema.toProtocol().properties.sandboxEnabled.sessionMutable,
		}, { values: {}, property: ['default', 'on', 'off'], mutable: true });
	});

	test('publishes session-scoped policy changes in serializable subscription state', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('managed');
		const other = create('unmanaged');
		manager.setSessionMeta(owner, { 'test.other': 'preserved' });
		const policies: ReturnType<typeof readSessionSandboxPolicy>[] = [];
		store.add(manager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				policies.push(readSessionSandboxPolicy(JSON.parse(JSON.stringify({ _meta: envelope.action._meta }))));
			}
		}));
		configuration.setSessionSandboxPolicy(owner, { enabled: true });
		const reconnectSnapshot = JSON.parse(JSON.stringify(manager.getSessionState(owner)));
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: true });
		configuration.setSessionSandboxPolicy(owner, { enabled: false });
		assert.deepStrictEqual({
			policies,
			reconnected: readSessionSandboxPolicy(reconnectSnapshot),
			metadata: reconnectSnapshot._meta,
			removed: readSessionSandboxPolicy(manager.getSessionState(owner)),
			unrelated: readSessionSandboxPolicy(manager.getSessionState(other)),
			preserved: manager.getSessionState(owner)?._meta?.['test.other'],
		}, {
			policies: [{ enabled: true }, { enabled: true, allowBypass: true }, { enabled: false }],
			reconnected: { enabled: true },
			metadata: { 'test.other': 'preserved', 'vscode.resolvedSandboxPolicy': { enabled: true } },
			removed: { enabled: false },
			unrelated: undefined,
			preserved: 'preserved',
		});
	});

	test('ignores missing or non-object sandbox policy metadata', () => {
		const values = [undefined, null, [], true, 'policy', 0];
		assert.deepStrictEqual(values.map(value => readSessionSandboxPolicy({ _meta: { 'vscode.resolvedSandboxPolicy': value } })), values.map(() => undefined));
	});

	test('resolved host lists survive session metadata serialization and clear when omitted', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('managed-hosts');
		const snapshot = {
			source: 'server' as const, serverManaged: true, deviceManaged: false,
			failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
		};
		configuration.setSessionSandboxPolicy(owner, projectCopilotSandboxPolicy({
			...snapshot,
			settings: {
				sandbox: {
					enabled: true, userPolicy: {
						network: {
							allowedHosts: ['example.com', 'api.example.com'],
							blockedHosts: ['malicious.com', 'phishing.com'],
						}, filesystem: {
							readwritePaths: ['/managed-write'],
							readonlyPaths: ['/managed-read'],
							deniedPaths: ['/managed-denied'],
						}
					}
				}
			},
		}, owner, new NullLogService()));
		const serialized = readSessionSandboxPolicy(JSON.parse(JSON.stringify(manager.getSessionState(owner))));
		configuration.setSessionSandboxPolicy(owner, projectCopilotSandboxPolicy({
			...snapshot, settings: { sandbox: { enabled: true } },
		}, owner, new NullLogService()));
		assert.deepStrictEqual({
			serialized,
			cleared: readSessionSandboxPolicy(manager.getSessionState(owner)),
		}, {
			serialized: {
				enabled: true,
				allowedHosts: ['example.com', 'api.example.com'],
				blockedHosts: ['malicious.com', 'phishing.com'],
				readwritePaths: ['/managed-write'],
				readonlyPaths: ['/managed-read'],
				deniedPaths: ['/managed-denied'],
			},
			cleared: { enabled: true },
		});
	});

	test('malformed resolved host lists are logged and rejected', () => {
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string): void { errors.push(message); }
		}();
		for (const key of ['allowedHosts', 'blockedHosts']) {
			assert.throws(() => projectCopilotSandboxPolicy({
				source: 'server', serverManaged: true, deviceManaged: false,
				failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
				settings: { sandbox: { userPolicy: { network: { [key]: ['example.com', 1] } } } },
			}, 'test-session', logService), /must be a string array/);
		}
		assert.deepStrictEqual(errors, [
			'[Copilot:test-session] Invalid resolved sandbox network policy: allowedHosts must be a string array',
			'[Copilot:test-session] Invalid resolved sandbox network policy: blockedHosts must be a string array',
		]);
	});

	test('malformed resolved filesystem lists are logged and rejected', () => {
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string): void { errors.push(message); }
		}();
		for (const key of ['readwritePaths', 'readonlyPaths', 'deniedPaths']) {
			assert.throws(() => projectCopilotSandboxPolicy({
				source: 'server', serverManaged: true, deviceManaged: false,
				failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
				settings: { sandbox: { userPolicy: { filesystem: { [key]: ['/valid', 1] } } } },
			}, 'test-session', logService), /must be a string array/);
		}
		assert.deepStrictEqual(errors, [
			'[Copilot:test-session] Invalid resolved sandbox filesystem policy: readwritePaths must be a string array',
			'[Copilot:test-session] Invalid resolved sandbox filesystem policy: readonlyPaths must be a string array',
			'[Copilot:test-session] Invalid resolved sandbox filesystem policy: deniedPaths must be a string array',
		]);
	});

	test('resolves managed filesystem paths for SDK updates across owners, peers and subagents', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('filesystem-rules');
		const peer = buildChatUri(owner, 'peer');
		manager.addChat(owner, peer);
		const sessions = [owner, peer, buildSubagentSessionUri(owner, 'child')];
		configuration.updateRootConfig({
			sandbox: {
				enabled: 'on',
				[AgentHostSandboxKey.UserConfiguredPaths]: {
					readwritePaths: ['/local-write'],
					readonlyPaths: ['/local-read'],
					deniedPaths: ['/local-denied', '/shared-denied'],
				},
			}
		});
		configuration.setSessionSandboxPolicy(owner, {
			enabled: true,
			readwritePaths: ['/managed-write'],
			readonlyPaths: [],
			deniedPaths: ['/shared-denied', '/managed-denied'],
		});
		const read = () => sessions.map(session => buildSandboxConfigForSdk('linux', getSessionSandboxConfig(configuration, session))?.userPolicy?.filesystem);
		const resolved = read();
		configuration.setSessionSandboxPolicy(owner, { enabled: true });
		assert.deepStrictEqual({
			resolved,
			removed: read(),
			stored: (configuration.getRootConfigValues()?.sandbox as ISandboxConfigValue | undefined)?.[AgentHostSandboxKey.UserConfiguredPaths],
		}, {
			resolved: sessions.map(() => ({
				readwritePaths: ['/managed-write'],
				deniedPaths: ['/local-denied', '/shared-denied', '/managed-denied'],
			})),
			removed: sessions.map(() => ({
				readwritePaths: ['/local-write'],
				readonlyPaths: ['/local-read'],
				deniedPaths: ['/local-denied', '/shared-denied'],
			})),
			stored: {
				readwritePaths: ['/local-write'],
				readonlyPaths: ['/local-read'],
				deniedPaths: ['/local-denied', '/shared-denied'],
			},
		});
	});

	test('resolves managed host lists for SDK updates and browser tools across owners, peers and subagents', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('host-rules');
		const peer = buildChatUri(owner, 'peer');
		manager.addChat(owner, peer);
		const sessions = [owner, peer, buildSubagentSessionUri(owner, 'child')];
		const local = {
			enabled: 'on', allowNetwork: true, allowLocalNetwork: true,
			allowedNetworkDomains: ['*.example.com'],
			deniedNetworkDomains: ['local.blocked', 'malicious.com'],
		};
		configuration.updateRootConfig({ sandbox: local });
		configuration.setSessionSandboxPolicy(owner, {
			enabled: true,
			allowedHosts: ['example.com', 'api.example.com'],
			blockedHosts: ['malicious.com', 'phishing.com'],
		});
		const read = () => sessions.map(session => ({
			sdk: buildSandboxConfigForSdk('linux', getSessionSandboxConfig(configuration, session))?.userPolicy?.network,
			browser: getCopilotBrowserSandboxNetworkRestrictions(configuration, session, 'list_browser_pages'),
		}));
		const resolved = read();
		configuration.setSessionSandboxPolicy(owner, { enabled: true });
		assert.deepStrictEqual({
			resolved,
			removed: read(),
			stored: configuration.getRootConfigValues()?.sandbox,
		}, {
			resolved: sessions.map(() => ({
				sdk: {
					allowOutbound: true, allowLocalNetwork: true,
					allowedHosts: ['example.com', 'api.example.com'],
					blockedHosts: ['local.blocked', 'malicious.com', 'phishing.com'],
				},
				browser: {
					sandboxEnabled: true, allowNetwork: true,
					allowedDomains: ['example.com', 'api.example.com'],
					deniedDomains: ['local.blocked', 'malicious.com', 'phishing.com'],
				},
			})),
			removed: sessions.map(() => ({
				sdk: {
					allowOutbound: true, allowLocalNetwork: true,
					allowedHosts: ['*.example.com'],
					blockedHosts: ['local.blocked', 'malicious.com'],
				},
				browser: {
					sandboxEnabled: true, allowNetwork: true,
					allowedDomains: ['*.example.com'],
					deniedDomains: ['local.blocked', 'malicious.com'],
				},
			})),
			stored: local,
		});
	});

	test('publishes the error to its client before restoring the last successful sandbox value', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('rollback', { sandboxEnabled: 'on', mode: 'plan' });
		configuration.setSessionSandboxEnabled(owner, true);
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		const attempted = configuration.getSessionConfigValues(owner);
		configuration.updateSessionConfig(owner, { mode: 'interactive' });
		const updates: { type: ActionType; value: unknown; error: string | undefined }[] = [];
		store.add(manager.onDidEmitEnvelope(envelope => {
			updates.push({
				type: envelope.action.type,
				value: configuration.getSessionConfigValues(owner)?.sandboxEnabled,
				error: readSessionSandboxState(manager.getSessionState(owner))?.error?.message,
			});
		}));
		configuration.rejectSessionSandboxChange(owner, attempted, { clientId: 'client', clientSeq: 1 }, 'SDK rejected update');
		assert.deepStrictEqual({
			updates,
			values: configuration.getSessionConfigValues(owner),
			state: readSessionSandboxState(manager.getSessionState(owner)),
		}, {
			updates: [
				{ type: ActionType.SessionMetaChanged, value: 'off', error: 'SDK rejected update' },
				{ type: ActionType.SessionConfigChanged, value: 'on', error: 'SDK rejected update' },
			],
			values: { sandboxEnabled: 'on', mode: 'interactive' },
			state: { enabled: true, error: { clientId: 'client', clientSeq: 1, message: 'SDK rejected update' } },
		});
	});

	test('does not roll back a newer request, including another request for the same value', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('latest', { sandboxEnabled: 'on' });
		configuration.setSessionSandboxEnabled(owner, true);
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		const first = configuration.getSessionConfigValues(owner);
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'on' });
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		configuration.rejectSessionSandboxChange(owner, first, { clientId: 'client', clientSeq: 1 }, 'Old failure');
		assert.deepStrictEqual({
			value: configuration.getSessionConfigValues(owner)?.sandboxEnabled,
			state: readSessionSandboxState(manager.getSessionState(owner)),
		}, { value: 'off', state: { enabled: true } });
	});

	test('allows fail-closed requests without weakening the effective sandbox floor', () => {
		const { configuration, create } = setupSession();
		const owner = create('fail-closed');
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: false, failClosed: true });
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		assert.deepStrictEqual({
			selection: configuration.getSessionConfigValues(owner)?.sandboxEnabled,
			enabled: buildSandboxConfigForSdk('linux', getSessionSandboxConfig(configuration, owner))?.enabled,
		}, { selection: 'off', enabled: true });
	});

	test('validates sandbox results and preserves other metadata across serialization', () => {
		const state = { enabled: false, error: { clientId: 'client', clientSeq: 2, message: 'error' } };
		const meta = withSessionSandboxState({ other: true }, state);
		assert.deepStrictEqual({
			state: readSessionSandboxState(JSON.parse(JSON.stringify({ _meta: meta }))),
			other: meta.other,
			invalid: [null, [], { enabled: 'false' }, { enabled: true, error: {} }].map(value => readSessionSandboxState({ _meta: { 'vscode.sandboxState': value } })),
		}, { state, other: true, invalid: [undefined, undefined, undefined, undefined] });
	});

	test('returns only session toggle overrides', () => {
		const { configuration, create } = setupSession();
		const follower = create('follower');
		const enabled = create('enabled', { sandboxEnabled: 'on' });
		const disabled = create('disabled', { sandboxEnabled: 'off' });
		const managed = create('managed');
		configuration.updateRootConfig({ sandbox: { enabled: 'on', allowNetwork: true } });
		configuration.setSessionSandboxPolicy(managed, { enabled: true, allowBypass: false });
		assert.deepStrictEqual([follower, enabled, disabled, managed].map(session => getSessionSandboxOverrides(configuration, session)), [
			{},
			{ enabled: 'on' },
			{ enabled: 'off' },
			{ enabled: 'on', allowUnsandboxedCommands: false },
		]);
	});

	test('browser client tool network restrictions use session selection and managed outbound policy', () => {
		const { configuration, create } = setupSession();
		const enabled = create('network-enabled', { sandboxEnabled: 'on' });
		const disabled = create('network-disabled', { sandboxEnabled: 'off' });
		const managed = create('network-managed');
		const bypassed = create('network-bypassed', { sandboxEnabled: 'off' });
		const failClosed = create('network-fail-closed');
		configuration.updateRootConfig({ sandbox: { enabled: 'off', allowNetwork: true, allowedNetworkDomains: ['example.com'], deniedNetworkDomains: ['private.example.com'] } });
		configuration.setSessionSandboxPolicy(managed, { enabled: true, allowOutbound: false });
		configuration.setSessionSandboxPolicy(bypassed, { enabled: true, allowBypass: true });
		configuration.setSessionSandboxEnabled(bypassed, false);
		configuration.updateSessionConfig(bypassed, { sandboxEnabled: 'off' });
		configuration.setSessionSandboxPolicy(failClosed, { enabled: true, allowBypass: false, failClosed: true });
		assert.deepStrictEqual([enabled, disabled, managed, bypassed, failClosed].map(session => getCopilotBrowserSandboxNetworkRestrictions(configuration, session, 'openBrowserPage')), [
			{ sandboxEnabled: true, allowNetwork: true, allowedDomains: ['example.com'], deniedDomains: ['private.example.com'] },
			{ sandboxEnabled: false, allowNetwork: true, allowedDomains: ['example.com'], deniedDomains: ['private.example.com'] },
			{ sandboxEnabled: true, allowNetwork: false, allowedDomains: ['example.com'], deniedDomains: ['private.example.com'] },
			{ sandboxEnabled: false, allowNetwork: true, allowedDomains: ['example.com'], deniedDomains: ['private.example.com'] },
			{ sandboxEnabled: true, allowNetwork: true, allowedDomains: ['example.com'], deniedDomains: ['private.example.com'] },
		]);
	});

	test('Copilot network metadata is limited to integrated-browser client tools', () => {
		const { configuration, create } = setupSession();
		const session = create('browser-only', { sandboxEnabled: 'on' });
		const names = ['openBrowserPage', 'readPage', 'screenshotPage', 'navigatePage', 'clickElement', 'typeInPage',
			'hoverElement', 'dragElement', 'handleDialog', 'runPlaywrightCode', 'list_browser_pages', 'fetchWebPage', 'run_in_terminal', 'read_file'];
		assert.deepStrictEqual(names.map(name => [name, getCopilotBrowserSandboxNetworkRestrictions(configuration, session, name) !== undefined]), [
			['openBrowserPage', true], ['readPage', true], ['screenshotPage', true], ['navigatePage', true],
			['clickElement', true], ['typeInPage', true], ['hoverElement', true], ['dragElement', true],
			['handleDialog', true], ['runPlaywrightCode', true], ['list_browser_pages', true],
			['fetchWebPage', false], ['run_in_terminal', false], ['read_file', false],
		]);
	});

	test('forwarded sandbox defaults remain overridable without a runtime managed requirement', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('legacy-default', { sandboxEnabled: 'off' });
		const followingDefault = create('following-default');
		configuration.updateRootConfig({ sandbox: { enabled: 'on', allowUnsandboxedCommands: true } });
		configuration.setSessionSandboxPolicy(owner, { enabled: false });
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		assert.deepStrictEqual({
			effective: getSessionSandboxConfig(configuration, owner)?.enabled,
			followingDefault: getSessionSandboxConfig(configuration, followingDefault)?.enabled,
			selection: configuration.getSessionConfigValues(owner)?.sandboxEnabled,
			policy: readSessionSandboxPolicy(manager.getSessionState(owner)),
		}, {
			effective: 'off',
			followingDefault: 'on',
			selection: 'off',
			policy: { enabled: false },
		});
	});

	test('editing ordinary host settings cannot clear a runtime managed sandbox requirement', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('managed-host-settings');
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: false });
		for (const sandbox of [{ enabled: 'off', required: false }, { enabled: 'off' }, {}]) {
			configuration.updateRootConfig({ sandbox });
			configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
			assert.strictEqual(buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, owner))?.enabled, true);
			assert.deepStrictEqual(readSessionSandboxPolicy(manager.getSessionState(owner)), { enabled: true, allowBypass: false });
		}
	});

	test('ordinary root settings cannot manufacture a policy requirement', () => {
		const { configuration, create } = setupSession();
		const owner = create('unmanaged-root-marker', { sandboxEnabled: 'off' });
		configuration.updateRootConfig({ sandbox: { enabled: 'on', required: true } });
		assert.strictEqual(configuration.getSessionSandboxPolicy(owner), undefined);
		assert.strictEqual(buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, owner)), undefined);
	});

	test('changing forwarded defaults does not change the runtime sandbox policy', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('legacy-live', { sandboxEnabled: 'off' });
		configuration.setSessionSandboxEnabled(owner, false);
		const runtimePolicy = { enabled: false, allowBypass: false, allowOutbound: false };
		configuration.setSessionSandboxPolicy(owner, runtimePolicy);
		for (const enabled of ['on', 'off']) {
			configuration.updateRootConfig({ sandbox: { enabled, allowUnsandboxedCommands: true } });
			assert.deepStrictEqual({
				published: readSessionSandboxPolicy(manager.getSessionState(owner)),
				resolved: configuration.getSessionSandboxPolicy(owner),
				applied: configuration.getSessionSandboxEnabled(owner),
			}, { published: runtimePolicy, resolved: runtimePolicy, applied: false });
		}
	});

	test('new sessions enforce a runtime requirement when it arrives, not from forwarded defaults', () => {
		const { manager, configuration, create } = setupSession();
		configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		const owner = create('managed-new', { sandboxEnabled: 'off' });
		assert.strictEqual(buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, owner)), undefined);
		assert.strictEqual(readSessionSandboxPolicy(manager.getSessionState(owner)), undefined);
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: false });
		assert.strictEqual(buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, owner))?.enabled, true);
		assert.deepStrictEqual(readSessionSandboxPolicy(manager.getSessionState(owner)), { enabled: true, allowBypass: false });
		configuration.setSessionSandboxPolicy(owner, { enabled: false });
		assert.deepStrictEqual(readSessionSandboxPolicy(manager.getSessionState(owner)), { enabled: false });
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		assert.strictEqual(buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, owner)), undefined);
	});

	test('forwarded sandbox defaults do not publish managed policy metadata', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('legacy-only');
		const unsupported = create('unsupported');
		manager.setSessionConfig(unsupported, { schema: { type: 'object', properties: {} }, values: {} });
		for (const enabled of ['on', 'off']) {
			configuration.updateRootConfig({ sandbox: { enabled } });
			assert.deepStrictEqual([owner, unsupported].map(session => readSessionSandboxPolicy(manager.getSessionState(session))), [undefined, undefined]);
		}
	});

	test('runtime policy owns approved bypass without widening local bypass settings', () => {
		for (const runtimeAllows of [undefined, false, true]) {
			for (const localAllows of [false, true]) {
				const { manager, configuration, create } = setupSession();
				const owner = create(`managed-bypass-${runtimeAllows}-${localAllows}`);
				configuration.updateRootConfig({ sandbox: { enabled: 'on', allowUnsandboxedCommands: localAllows } });
				configuration.setSessionSandboxPolicy(owner, { enabled: true, ...(runtimeAllows !== undefined ? { allowBypass: runtimeAllows } : {}) });
				configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
				const directSelection = configuration.getSessionConfigValues(owner)?.sandboxEnabled;
				// Applied false represents an opt-out already accepted by the SDK, not a user selection.
				configuration.setSessionSandboxEnabled(owner, false);
				configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
				assert.deepStrictEqual({
					directSelection,
					approvedSelection: configuration.getSessionConfigValues(owner)?.sandboxEnabled,
					allowUnsandboxedCommands: getSessionSandboxConfig(configuration, owner).allowUnsandboxedCommands,
					policy: readSessionSandboxPolicy(manager.getSessionState(owner)),
				}, {
					directSelection: 'on',
					approvedSelection: runtimeAllows === true ? 'off' : 'on',
					allowUnsandboxedCommands: runtimeAllows === true && localAllows,
					policy: { enabled: true, ...(runtimeAllows !== undefined ? { allowBypass: runtimeAllows } : {}) },
				});
			}
		}
	});

	test('forwarded defaults preserve the unresolved-runtime-policy retry path', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('managed-fail-closed');
		const runtimePolicy = { enabled: true, allowBypass: false, failClosed: true };
		configuration.setSessionSandboxPolicy(owner, runtimePolicy);
		configuration.updateRootConfig({ sandbox: { enabled: 'on', allowUnsandboxedCommands: true } });
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		assert.deepStrictEqual({
			policy: readSessionSandboxPolicy(manager.getSessionState(owner)),
			selection: configuration.getSessionConfigValues(owner)?.sandboxEnabled,
		}, { policy: runtimePolicy, selection: 'off' });
		configuration.updateRootConfig({ sandbox: { enabled: 'off' } });
		assert.deepStrictEqual(configuration.getSessionSandboxPolicy(owner), runtimePolicy);
	});

	test('resolved outbound restrictions survive serialization and clear when omitted', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('network');
		const snapshot = {
			source: 'server' as const, serverManaged: true, deviceManaged: false,
			failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
		};
		const apply = (allowOutbound: boolean | undefined) => {
			const policy = projectCopilotSandboxPolicy({
				...snapshot,
				settings: { sandbox: { enabled: true, allowBypass: true, userPolicy: { network: allowOutbound === undefined ? {} : { allowOutbound } } } },
			}, owner, new NullLogService());
			configuration.setSessionSandboxPolicy(owner, policy);
			return readSessionSandboxPolicy(JSON.parse(JSON.stringify(manager.getSessionState(owner))));
		};
		assert.deepStrictEqual([apply(false), apply(true), apply(undefined)], [
			{ enabled: true, allowBypass: true, allowOutbound: false },
			{ enabled: true, allowBypass: true, allowOutbound: true },
			{ enabled: true, allowBypass: true },
		]);
	});

	test('outbound denial wins for owners, peers and subagents without changing local settings', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('outbound');
		const peer = buildChatUri(owner, 'peer');
		manager.addChat(owner, peer);
		const sessions = [owner, peer, buildSubagentSessionUri(owner, 'child')];
		for (const local of [undefined, false, true]) {
			const sandbox = { enabled: 'on', ...(local !== undefined ? { allowNetwork: local } : {}) };
			configuration.updateRootConfig({ sandbox });
			for (const managed of [undefined, false, true, false, undefined]) {
				configuration.setSessionSandboxPolicy(owner, { enabled: true, allowOutbound: managed });
				assert.deepStrictEqual({
					values: sessions.map(session => (['linux', 'darwin', 'win32'] as const).map(platform =>
						buildSandboxConfigForSdk(platform, getSessionSandboxConfig(configuration, session))?.userPolicy?.network?.allowOutbound)),
					stored: configuration.getRootConfigValues()?.sandbox,
				}, {
					values: sessions.map(() => (['linux', 'darwin', 'win32'] as const).map(() => managed === false ? false : local)),
					stored: sandbox,
				});
			}
		}
	});

	for (const [key, field] of [
		[AgentHostSandboxKey.AuthenticateGit, 'git'],
		[AgentHostSandboxKey.AuthenticateGh, 'gh'],
	] as const) {
		test(`resolved ${key} policy survives serialization and clears when omitted or malformed`, () => {
			const { manager, configuration, create } = setupSession();
			const owner = create('credentials');
			const apply = (value: boolean | string | undefined) => {
				configuration.setSessionSandboxPolicy(owner, projectCopilotSandboxPolicy({
					source: 'server', serverManaged: true, deviceManaged: false,
					failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
					settings: { sandbox: { enabled: true, allowBypass: false, auth: value === undefined ? {} : { [field]: value } } },
				}, owner, new NullLogService()));
				return readSessionSandboxPolicy(JSON.parse(JSON.stringify(manager.getSessionState(owner))));
			};
			assert.deepStrictEqual([true, false, undefined, 'true'].map(apply), [
				{ enabled: true, allowBypass: false, [key]: true },
				{ enabled: true, allowBypass: false, [key]: false },
				{ enabled: true, allowBypass: false },
				{ enabled: true, allowBypass: false },
			]);
		});

		test(`managed ${key} denial wins without widening local choices for owners, peers and subagents`, () => {
			const { manager, configuration, create } = setupSession();
			const owner = create('credentials');
			const peer = buildChatUri(owner, 'peer');
			manager.addChat(owner, peer);
			for (const local of [undefined, false, true]) {
				const sandbox = { enabled: 'on', ...(local !== undefined ? { [key]: local } : {}) };
				configuration.updateRootConfig({ sandbox });
				for (const managed of [undefined, false, true, false, undefined]) {
					configuration.setSessionSandboxPolicy(owner, { enabled: false, [key]: managed });
					const sessions = [owner, peer, buildSubagentSessionUri(owner, 'child')];
					assert.deepStrictEqual({
						values: sessions.map(session => (['linux', 'darwin', 'win32'] as const).map(platform =>
							buildSandboxConfigForSdk(platform, getSessionSandboxConfig(configuration, session))?.auth?.[field])),
						stored: configuration.getRootConfigValues()?.sandbox,
					}, {
						values: sessions.map(() => (['linux', 'darwin', 'win32'] as const).map(() => managed === false ? false : local ?? true)),
						stored: sandbox,
					});
				}
			}
		});
	}

	for (const [key, managedValue] of [
		[AgentHostSandboxKey.SandboxMcpServers, true],
		[AgentHostSandboxKey.SandboxLspServers, true],
		[AgentHostSandboxKey.AllowDevToolAccess, false],
		[AgentHostSandboxKey.AllowLocalNetwork, false],
	] as const) {
		test(`resolved ${key} policy survives serialization and clears when omitted or malformed`, () => {
			const { manager, configuration, create } = setupSession();
			const owner = create('servers');
			const apply = (value: boolean | string | undefined) => {
				configuration.setSessionSandboxPolicy(owner, projectCopilotSandboxPolicy({
					source: 'server', serverManaged: true, deviceManaged: false,
					failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
					settings: { sandbox: { enabled: true, allowBypass: false, ...(value !== undefined ? key === AgentHostSandboxKey.AllowLocalNetwork ? { userPolicy: { network: { [key]: value } } } : { [key]: value } : {}) } },
				}, owner, new NullLogService()));
				return readSessionSandboxPolicy(JSON.parse(JSON.stringify(manager.getSessionState(owner))));
			};
			assert.deepStrictEqual([true, false, undefined, 'true'].map(apply), [
				{ enabled: true, allowBypass: false, [key]: true },
				{ enabled: true, allowBypass: false, [key]: false },
				{ enabled: true, allowBypass: false },
				{ enabled: true, allowBypass: false },
			]);
		});

		test(`managed ${key} overrides root choices for owners, peers and subagents`, () => {
			const { manager, configuration, create } = setupSession();
			const owner = create('servers');
			const peer = buildChatUri(owner, 'peer');
			manager.addChat(owner, peer);
			for (const local of [false, true]) {
				const sandbox = { enabled: 'on', [key]: local };
				configuration.updateRootConfig({ sandbox });
				for (const managed of [undefined, false, true, false, undefined]) {
					configuration.setSessionSandboxPolicy(owner, { enabled: false, [key]: managed });
					const sessions = [owner, peer, buildSubagentSessionUri(owner, 'child')];
					assert.deepStrictEqual({
						values: sessions.map(session => {
							const effective = getSessionSandboxConfig(configuration, session);
							return (['linux', 'darwin', 'win32'] as const).map(platform => {
								const sdk = buildSandboxConfigForSdk(platform, effective);
								return key === AgentHostSandboxKey.AllowLocalNetwork ? sdk?.userPolicy?.network?.allowLocalNetwork : sdk?.[key];
							});
						}),
						stored: configuration.getRootConfigValues()?.sandbox,
					}, {
						values: sessions.map(() => (['linux', 'darwin', 'win32'] as const).map(() => managed === managedValue ? managedValue : local)),
						stored: sandbox,
					});
				}
			}
		});
	}

	for (const localAccess of [false, true]) {
		test(`resolves effective toggles for owner and peers without changing local ${localAccess} or filesystem settings`, () => {
			const { manager, configuration, create } = setupSession();
			const owner = create('network');
			const peer = buildChatUri(owner, 'peer');
			manager.addChat(owner, peer);
			const sandbox = {
				enabled: 'on',
				allowNetwork: localAccess, allowUnsandboxedCommands: localAccess,
				'fileSystem.linux': { allowRead: ['/reference'], denyRead: ['/private'] },
				[AgentHostSandboxKey.UserConfiguredPaths]: { readonlyPaths: ['/reference'], deniedPaths: ['/private'] },
			};
			configuration.updateRootConfig({ sandbox });
			const read = () => [owner, peer, buildSubagentSessionUri(buildSubagentSessionUri(owner, 'child'), 'nested')].map(session => {
				const effective = getSessionSandboxConfig(configuration, session, 'linux');
				return {
					network: effective.allowNetwork,
					bypass: effective.allowUnsandboxedCommands,
					filesystem: effective['fileSystem.linux'],
					sdk: buildSandboxConfigForSdk('linux', effective),
				};
			});
			const initial = read();
			configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: false, allowOutbound: false });
			const denied = read();
			configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: true, allowOutbound: true });
			const allowed = read();
			configuration.setSessionSandboxPolicy(owner, { enabled: false });
			assert.deepStrictEqual({ denied, allowed, removed: read(), stored: configuration.getRootConfigValues()?.sandbox }, {
				denied: initial.map(value => ({
					...value, network: false, bypass: false,
					sdk: {
						enabled: true, addCurrentWorkingDirectory: true, allowBypass: false,
						auth: { git: true, gh: true },
						userPolicy: {
							filesystem: { readonlyPaths: ['/reference'], deniedPaths: ['/private'] },
							network: { allowOutbound: false },
						},
					},
				})),
				allowed: initial,
				removed: initial,
				stored: sandbox,
			});
		});
	}

	test('global updates affect followers, not explicit session overrides', () => {
		const { configuration, create } = setupSession();
		const follower = create('follower');
		const enabled = create('on', { sandboxEnabled: 'on' });
		const disabled = create('off', { sandboxEnabled: 'off' });
		const read = () => [follower, enabled, disabled].map(session => getSessionSandboxConfig(configuration, session)?.enabled);
		configuration.updateRootConfig({ sandbox: { enabled: 'off' } });
		const before = read();
		configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		assert.deepStrictEqual({ before, after: read() }, { before: ['off', 'on', 'off'], after: ['on', 'on', 'off'] });
	});

	test('peer chats and nested subagents use the same owner override', () => {
		const { configuration, create } = setupSession();
		const owner = create('owner', { sandboxEnabled: 'off' });
		const other = create('other');
		configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		assert.deepStrictEqual([
			owner,
			buildChatUri(owner, 'peer'),
			buildSubagentSessionUri(owner, 'child'),
			buildSubagentSessionUri(buildSubagentSessionUri(owner, 'child'), 'nested'),
			other,
		].map(session => getSessionSandboxConfig(configuration, session)?.enabled), ['off', 'off', 'off', 'off', 'on']);
	});

	test('sandbox policy lookup resolves peer chats and nested subagents to the owner', () => {
		const { configuration, create } = setupSession();
		const owner = create('owner');
		const other = create('other');
		const child = buildSubagentSessionUri(owner, 'child');
		const nested = buildSubagentSessionUri(child, 'nested');
		const policy = { enabled: true, allowBypass: false };
		configuration.setSessionSandboxPolicy(owner, policy);
		assert.deepStrictEqual([
			owner,
			buildChatUri(owner, 'peer'),
			child,
			nested,
			buildChatUri(nested, 'peer'),
			other,
		].map(session => configuration.getSessionSandboxPolicy(session)), [policy, policy, policy, policy, policy, undefined]);
	});

	test('the runtime requirement also prevents opt-out in peer chats and nested subagents', () => {
		const { configuration, create } = setupSession();
		const owner = create('managed-owner', { sandboxEnabled: 'off' });
		const child = buildSubagentSessionUri(owner, 'child');
		const nested = buildSubagentSessionUri(child, 'nested');
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: false });
		for (const resource of [owner, buildChatUri(owner, 'peer'), child, nested, buildChatUri(nested, 'peer')]) {
			assert.strictEqual(buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, resource))?.enabled, true);
		}
	});

	test('restored selections retain their values unless they conflict with current managed policy', () => {
		const first = setupSession();
		const second = setupSession();
		const restored = ['on', 'off', 'default', undefined].map(selection => {
			const owner = first.create(`persisted-${selection}`, selection ? { sandboxEnabled: selection } : {});
			const serialized = JSON.stringify(omitTransientSessionConfigValues(first.configuration.getSessionConfigValues(owner)!));
			return second.create(`persisted-${selection}`, JSON.parse(serialized));
		});
		const fresh = second.create('fresh');
		const read = () => [...restored, fresh].map(session => getSessionSandboxConfig(second.configuration, session)?.enabled);
		const selections = restored.map(session => second.configuration.getSessionConfigValues(session)?.sandboxEnabled);
		second.configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		const defaultOn = read();
		second.configuration.updateRootConfig({ sandbox: { enabled: 'off' } });
		const defaultOff = read();
		for (const session of restored) {
			second.configuration.setSessionSandboxPolicy(session, { enabled: true, allowBypass: false });
		}
		assert.deepStrictEqual({ selections, defaultOn, defaultOff, managed: read() }, {
			selections: ['on', 'off', 'default', undefined],
			defaultOn: ['on', 'off', 'on', 'on', 'on'],
			defaultOff: ['on', 'off', 'off', 'off', 'off'],
			managed: ['on', 'on', 'on', 'on', 'off'],
		});
	});

	test('reconciles saved off against policy resolved before restoration and notifies the SDK with on', () => {
		const { configuration, create } = setupSession();
		configuration.updateRootConfig({ sandbox: { enabled: 'off', allowNetwork: true } });
		const legacyValues = { sandboxEnabled: 'off', mode: 'plan' };
		const owner = 'copilot:/legacy-restored';
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: false, allowOutbound: false });
		create('legacy-restored');
		const applied: boolean[] = [];
		store.add(configuration.onDidSessionConfigChange(event => {
			if (event.session === owner) {
				applied.push(buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, owner))?.enabled ?? false);
			}
		}));
		configuration.restoreSessionConfig(owner, { schema: platformSessionSchema.toProtocol(), values: legacyValues });
		const sdk = buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, owner));
		assert.deepStrictEqual({
			legacyValues,
			restored: configuration.getSessionConfigValues(owner),
			applied,
			enabled: sdk?.enabled,
			allowBypass: sdk?.allowBypass,
			network: sdk?.userPolicy?.network,
		}, {
			legacyValues: { sandboxEnabled: 'off', mode: 'plan' },
			restored: { sandboxEnabled: 'on', mode: 'plan' },
			applied: [true],
			enabled: true,
			allowBypass: false,
			network: { allowOutbound: false },
		});
	});

	test('restoration notifies the SDK even without a managed policy change', () => {
		const { configuration, create } = setupSession();
		configuration.updateRootConfig({ sandbox: { enabled: 'off' } });
		const owner = create('restored');
		const applied: boolean[] = [];
		store.add(configuration.onDidSessionConfigChange(event => {
			if (event.session === owner) {
				applied.push(buildSandboxConfigForSdk(process.platform, getSessionSandboxConfig(configuration, owner))?.enabled ?? false);
			}
		}));
		for (const sandboxEnabled of ['on', 'off', 'default']) {
			configuration.restoreSessionConfig(owner, { schema: platformSessionSchema.toProtocol(), values: { sandboxEnabled } });
		}
		assert.deepStrictEqual(applied, [true, false, false]);
	});

	test('managed floor permanently discards off and rejects subsequent attempts', () => {
		const { configuration, create } = setupSession();
		const owner = create('managed', { sandboxEnabled: 'off' });
		configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: false });
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		const governed = getSessionSandboxConfig(configuration, owner);
		configuration.setSessionSandboxPolicy(owner, { enabled: false, allowBypass: false });
		assert.deepStrictEqual({
			governed: governed?.enabled,
			bypass: governed?.allowUnsandboxedCommands,
			stored: configuration.getSessionConfigValues(owner)?.sandboxEnabled,
			removed: getSessionSandboxConfig(configuration, owner)?.enabled,
		}, { governed: 'on', bypass: false, stored: 'on', removed: 'on' });
	});

	test('projects the same session override for SDK and host terminal settings without losing restrictions', () => {
		const { configuration, create } = setupSession();
		const owner = create('sdk', { [SessionConfigKey.SandboxEnabled]: 'on' });
		configuration.updateRootConfig({
			sandbox: {
				enabled: 'off', allowNetwork: false,
				[AgentHostSandboxKey.LinuxFileSystem]: { denyRead: ['/private'] },
				[AgentHostSandboxKey.UserConfiguredPaths]: { deniedPaths: ['/private'] },
			}
		});
		const effective = getSessionSandboxConfig(configuration, owner);
		const sdk = buildSandboxConfigForSdk('linux', effective);
		assert.deepStrictEqual({
			host: effective?.enabled,
			sdk: sdk?.enabled, denied: sdk?.userPolicy?.filesystem?.deniedPaths,
			network: sdk?.userPolicy?.network?.allowOutbound,
		}, { host: 'on', sdk: true, denied: ['/private'], network: false });
	});

	test('normalizes Windows filesystem settings on the host without mutating stored configuration', () => {
		const { configuration, create } = setupSession();
		const owner = create('windows', { sandboxEnabled: 'on' });
		const fileSystem = {
			denyRead: ['C:/src3/', 'C:\\already\\native', '//server/share/private'],
			denyWrite: ['C:/read\\only'],
			allowRead: ['./relative/path', 'C:/directory with spaces/'],
			allowWrite: ['C:/work/../output'],
		};
		const sandbox = { [AgentHostSandboxKey.WindowsFileSystem]: fileSystem };
		configuration.updateRootConfig({ sandbox });
		const stored = JSON.stringify(configuration.getRootConfigValues());
		const first = getSessionSandboxConfig(configuration, owner, 'win32');
		const storedAfterRead = JSON.stringify(configuration.getRootConfigValues());
		configuration.updateRootConfig({ sandbox: first });
		const second = getSessionSandboxConfig(configuration, owner, 'win32');
		assert.deepStrictEqual({
			fileSystem: first[AgentHostSandboxKey.WindowsFileSystem],
			idempotent: second,
			storedAfterRead,
		}, {
			fileSystem: {
				denyRead: ['C:\\src3\\', 'C:\\already\\native', '\\\\server\\share\\private'],
				denyWrite: ['C:\\read\\only'],
				allowRead: ['.\\relative\\path', 'C:\\directory with spaces\\'],
				allowWrite: ['C:\\work\\..\\output'],
			},
			idempotent: first,
			storedAfterRead: stored,
		});
	});

	for (const platform of ['win32', 'linux', 'darwin'] as const) {
		test(`normalizes Copilot paths for the ${platform} host after a client configuration action`, () => {
			const { manager, configuration, create } = setupSession();
			const owner = create(platform, { sandboxEnabled: 'on' });
			const sandbox = {
				[AgentHostSandboxKey.WindowsFileSystem]: { denyRead: ['C:/private/'], allowRead: ['C:\\private\\'] },
				[AgentHostSandboxKey.LinuxFileSystem]: { denyRead: ['/home/user/back\\slash', '~/private', './src/**/*.ts'] },
				[AgentHostSandboxKey.MacFileSystem]: { denyRead: ['/Users/user/back\\slash', '~/private', './src/**/*.ts'] },
				[AgentHostSandboxKey.UserConfiguredPaths]: {
					deniedPaths: ['C:/private/'],
					readonlyPaths: ['C:\\private\\', './read'],
					readwritePaths: ['./write'],
				},
			};
			manager.dispatchServerAction('ahp-root://', {
				type: ActionType.RootConfigChanged,
				config: JSON.parse(JSON.stringify({ sandbox })),
			});
			const effective = getSessionSandboxConfig(configuration, owner, platform);
			const sdk = buildSandboxConfigForSdk(platform, effective);
			assert.deepStrictEqual({
				filesystem: sdk?.userPolicy?.filesystem,
				stored: configuration.getRootConfigValues()?.sandbox,
				windows: effective[AgentHostSandboxKey.WindowsFileSystem],
			}, {
				filesystem: platform === 'win32' ? {
					deniedPaths: ['C:\\private\\'], readonlyPaths: ['.\\read'], readwritePaths: ['.\\write'],
				} : {
					deniedPaths: ['C:/private/'], readonlyPaths: ['C:\\private\\', './read'], readwritePaths: ['./write'],
				},
				stored: sandbox,
				windows: platform === 'win32' ? { denyRead: ['C:\\private\\'], allowRead: ['C:\\private\\'] } : sandbox[AgentHostSandboxKey.WindowsFileSystem],
			});
		});
	}

	test('projects resolved org policy and undetermined-policy restrictions, not device discovery', () => {
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const snapshot = {
			source: 'server' as const, serverManaged: true, deviceManaged: false,
			failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
		};
		const policies = [
			projectCopilotSandboxPolicy({ ...snapshot, settings: { sandbox: { enabled: true, allowBypass: false } } }, 'test-session', logService),
			projectCopilotSandboxPolicy({ ...snapshot, settings: { sandbox: { enabled: true, allowBypass: true } } }, 'test-session', logService),
			projectCopilotSandboxPolicy({ ...snapshot, sandboxEnabledByUndeterminedPolicy: true }, 'test-session', logService),
			projectCopilotSandboxPolicy({ ...snapshot, failClosed: true }, 'test-session', logService),
			projectCopilotSandboxPolicy({ ...snapshot, failClosed: true, sandboxEnabledByUndeterminedPolicy: true }, 'test-session', logService),
			projectCopilotSandboxPolicy(snapshot, 'test-session', logService),
		];
		assert.deepStrictEqual({ policies, warnings }, {
			policies: [
				{ enabled: true, allowBypass: false }, { enabled: true, allowBypass: true },
				{ enabled: true, allowBypass: false, failClosed: true }, { enabled: true, allowBypass: false, failClosed: true },
				{ enabled: true, allowBypass: false, failClosed: true }, { enabled: false, allowBypass: undefined },
			],
			warnings: [
				'[Copilot:test-session] Sandbox policy fail-closed: source=server, failClosed=false, sandboxEnabledByUndeterminedPolicy=true; forcing enabled=true, allowBypass=false',
				'[Copilot:test-session] Sandbox policy fail-closed: source=server, failClosed=true, sandboxEnabledByUndeterminedPolicy=false; forcing enabled=true, allowBypass=false',
				'[Copilot:test-session] Sandbox policy fail-closed: source=server, failClosed=true, sandboxEnabledByUndeterminedPolicy=true; forcing enabled=true, allowBypass=false',
			],
		});
	});

	test('allow-session on a peer sandbox escape leaves configuration to the provider', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('approval');
		const other = create('other');
		const root = configuration.getRootConfigValues();
		const peer = buildChatUri(owner, 'peer');
		manager.addChat(owner, peer);
		const permissions = store.add(new SessionPermissionManager(manager, {}, configuration, new NullLogService(), createSessionDataService()));
		manager.dispatchServerAction(peer, {
			type: ActionType.ChatTurnStarted, turnId: 'turn', startedAt: '2026-01-01T00:00:00Z',
			message: { text: 'run', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(peer, { type: ActionType.ChatToolCallStart, turnId: 'turn', toolCallId: 'tool', toolName: 'bash', displayName: 'Bash' });
		const ready = permissions.createToolReadyAction({
			kind: 'pending_confirmation', chat: URI.parse(peer), requestSandboxBypass: true,
			state: { status: ToolCallStatus.PendingConfirmation, toolCallId: 'tool', toolName: 'bash', displayName: 'Bash', invocationMessage: 'run', confirmationTitle: 'Outside sandbox?' },
		}, owner, 'turn');
		manager.dispatchServerAction(peer, ready);
		const pending = manager.getChatState(peer);
		permissions.handleToolCallConfirmed(peer, 'tool', 'skip');
		const cancelled = {
			config: { ...configuration.getSessionConfigValues(owner) },
			toolUnchanged: manager.getChatState(peer) === pending,
		};
		permissions.handleToolCallConfirmed(peer, 'tool', 'allow-once');
		const once = { ...configuration.getSessionConfigValues(owner) };
		permissions.handleToolCallConfirmed(peer, 'tool', 'allow-session');
		assert.deepStrictEqual({
			cancelled, once, owner: configuration.getSessionConfigValues(owner),
			other: configuration.getSessionConfigValues(other), root: configuration.getRootConfigValues(),
		}, { cancelled: { config: {}, toolUnchanged: true }, once: {}, owner: {}, other: {}, root });
	});

	test('managed enablement rejects direct Off but permits confirmed opt-out and re-enablement', () => {
		const { configuration, create } = setupSession();
		const owner = create('bypass', { sandboxEnabled: 'off' });
		configuration.setSessionSandboxEnabled(owner, false);
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: true });
		const beforeApproval = { selection: configuration.getSessionConfigValues(owner)?.sandboxEnabled, enabled: getSessionSandboxOverrides(configuration, owner).enabled };
		configuration.setSessionSandboxEnabled(owner, false);
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		const afterApproval = getSessionSandboxOverrides(configuration, owner).enabled;
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'on' });
		const reenabled = getSessionSandboxOverrides(configuration, owner).enabled;
		configuration.setSessionSandboxEnabled(owner, true);
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		assert.deepStrictEqual({ beforeApproval, afterApproval, reenabled, afterDirectDisable: configuration.getSessionConfigValues(owner)?.sandboxEnabled }, {
			beforeApproval: { selection: 'on', enabled: 'on' }, afterApproval: 'off', reenabled: 'on', afterDirectDisable: 'on',
		});
	});

	test('session sandbox opt-out is offered only for supported runtime bypass prompts', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('bypass-options');
		const permissions = store.add(new SessionPermissionManager(manager, {}, configuration, new NullLogService(), createSessionDataService()));
		const cases = [
			{ canAllowSessionSandboxBypass: false, requestSandboxPermissive: false },
			{ canAllowSessionSandboxBypass: true, requestSandboxPermissive: false },
			{ canAllowSessionSandboxBypass: true, requestSandboxPermissive: true },
		];
		const options = cases.map(({ canAllowSessionSandboxBypass, requestSandboxPermissive }) => permissions.createToolReadyAction({
			kind: 'pending_confirmation', chat: URI.parse(buildChatUri(owner, 'peer')), requestSandboxBypass: true, requestSandboxPermissive, canAllowSessionSandboxBypass,
			state: { status: ToolCallStatus.PendingConfirmation, toolCallId: 'tool', toolName: 'bash', displayName: 'Bash', invocationMessage: 'run', confirmationTitle: 'Outside sandbox?' },
		}, owner, 'turn').options?.map(option => option.id));
		assert.deepStrictEqual(options, [['allow-once', 'skip'], ['allow-session', 'allow-once', 'skip'], ['allow-once', 'skip']]);
	});

	test('managed sandbox confirmations keep only the one-time and deny actions', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('managed-approval');
		const permissions = store.add(new SessionPermissionManager(manager, {}, configuration, new NullLogService(), createSessionDataService()));
		const ready = permissions.createToolReadyAction({
			kind: 'pending_confirmation', chat: URI.parse(buildChatUri(owner, 'peer')), requestSandboxBypass: true, managedApprovalRequired: true,
			state: { status: ToolCallStatus.PendingConfirmation, toolCallId: 'tool', toolName: 'bash', displayName: 'Bash', invocationMessage: 'run', confirmationTitle: 'Outside sandbox?' },
		}, owner, 'turn');
		assert.deepStrictEqual(ready.options?.map(option => option.id), ['allow-once', 'skip']);
	});
});
