/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ResolveSessionConfigResult, SessionConfigSchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { applyAgentHostCompletionAction, isPolicyBlockedCompletionAction } from '../../browser/agentHostCompletionAction.js';
import { autoApprovePolicyValue, getAgentHostApprovalDefault, isAutoApprovePolicyRestricted, normalizeAgentHostApprovalConfig, resolveInitialAgentHostApprovalConfig } from '../../common/agentHostConfigPolicy.js';
import { ChatConfiguration } from '../../common/constants.js';
import { resetShownWarnings } from '../../common/chatPermissionWarnings.js';

/** Test configuration service whose `inspect` reports a fixed `policyValue` for the global auto-approve setting. */
class PolicyTestConfigurationService extends TestConfigurationService {
	constructor(private readonly _globalAutoApprovePolicyValue: boolean | undefined) {
		super();
	}
	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const base = super.inspect<T>(key, overrides);
		if (key === ChatConfiguration.GlobalAutoApprove) {
			return { ...base, policyValue: this._globalAutoApprovePolicyValue as T };
		}
		return base;
	}
}

suite('applyAgentHostCompletionAction', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => resetShownWarnings());

	for (const native of [false, true]) {
		for (const level of ['default', 'assisted', 'autoApprove']) {
			test(`completion filtering and application use the advertised approval binding (native=${native}, level=${level})`, async () => {
				const property = native ? 'approvalMode' : 'autoApprove';
				const value = native ? level === 'default' ? 'manual' : level === 'autoApprove' ? 'allow-all' : level : level;
				const modes = native ? ['manual', 'assisted', 'allow-all'] : ['default', 'assisted', 'autoApprove'];
				const resolved: ResolveSessionConfigResult = {
					schema: {
						type: 'object', properties: {
							[property]: { type: 'string', title: 'Approvals', enum: modes },
							availableApprovalModes: { type: 'array', title: 'Available', readOnly: true },
						}
					},
					values: { availableApprovalModes: modes },
				};
				const action = { applyConfig: { autoApprove: level } };
				const configuration = new PolicyTestConfigurationService(false);
				const applied: Record<string, string>[] = [];
				const apply = (config: Readonly<Record<string, string>>) => { applied.push({ ...config }); };
				const result = await applyAgentHostCompletionAction(action, new TestDialogService(), store.add(new InMemoryStorageService()), apply, resolved);
				const offered = isPolicyBlockedCompletionAction(action, configuration, resolved);
				resolved.values.availableApprovalModes = modes.filter(mode => mode !== value);
				await assert.rejects(applyAgentHostCompletionAction(action, new TestDialogService(), store.add(new InMemoryStorageService()), apply, resolved), /not available/);
				assert.deepStrictEqual({ result, offered, blocked: isPolicyBlockedCompletionAction(action, configuration, resolved), applied }, {
					result: true, offered: false, blocked: true, applied: [{ [property]: value }],
				});
			});
		}
	}

	test('native approval actions retain their binding and require elevated confirmation', async () => {
		const resolved: ResolveSessionConfigResult = {
			schema: { type: 'object', properties: { approvalMode: { type: 'string', title: 'Approvals', enum: ['manual', 'assisted', 'allow-all'] } } },
			values: {},
		};
		const applied: Record<string, string>[] = [];
		const cancelled = await applyAgentHostCompletionAction({ applyConfig: { approvalMode: 'allow-all' } }, new TestDialogService(undefined, { result: false }),
			store.add(new InMemoryStorageService()), config => { applied.push({ ...config }); }, resolved);
		await applyAgentHostCompletionAction({ applyConfig: { autoApprove: 'autoApprove', approvalMode: 'manual' } }, new TestDialogService(),
			store.add(new InMemoryStorageService()), config => { applied.push({ ...config }); }, resolved);
		assert.deepStrictEqual({ cancelled, applied, blocked: isPolicyBlockedCompletionAction({ applyConfig: { approvalMode: 'allow-all' } }, new PolicyTestConfigurationService(false), resolved) }, {
			cancelled: false, applied: [{ approvalMode: 'manual' }], blocked: true,
		});
	});

	test('configuration write errors are not reported as successful completion actions', async () => {
		await assert.rejects(applyAgentHostCompletionAction({ applyConfig: { mode: 'plan' } }, new TestDialogService(),
			store.add(new InMemoryStorageService()), async () => { throw new Error('Write rejected'); }), /Write rejected/);
	});

	test('only advertised host-owned approval reports replace the client legacy guard', () => {
		const config = new PolicyTestConfigurationService(false);
		const schemas: (SessionConfigSchema | undefined)[] = [
			undefined,
			{ type: 'object', properties: {} },
			{ type: 'object', properties: { autoApprove: { type: 'string', title: 'Approvals' } } },
			{ type: 'object', properties: { availableApprovalModes: { type: 'array', title: 'Available', readOnly: true } } },
			...[false, true].map(readOnly => ({
				type: 'object' as const,
				properties: { autoApprove: { type: 'string' as const, title: 'Approvals', enum: ['default', 'assisted', 'autoApprove'] }, availableApprovalModes: { type: 'array' as const, title: 'Available', readOnly } },
			})),
			...[false, true].map(readOnly => ({
				type: 'object' as const,
				properties: { approvalMode: { type: 'string' as const, title: 'Approvals', enum: ['manual', 'assisted', 'allow-all'] }, availableApprovalModes: { type: 'array' as const, title: 'Available', readOnly } },
			})),
		];
		assert.deepStrictEqual(schemas.map(schema => isAutoApprovePolicyRestricted(config, schema)), [true, true, true, true, true, false, true, false]);
	});

	test('malformed approval bindings cannot replace the legacy guard', () => {
		const config = new PolicyTestConfigurationService(false);
		const malformed: SessionConfigSchema['properties'][string][] = [
			{ type: 'boolean', title: 'Approvals' },
			{ type: 'string', title: 'Approvals' },
			{ type: 'string', title: 'Approvals', enum: ['assisted'] },
			{ type: 'string', title: 'Approvals', enum: ['manual', 'custom'] },
		];
		assert.deepStrictEqual(['autoApprove', 'approvalMode'].flatMap(key => malformed.map(property =>
			isAutoApprovePolicyRestricted(config, {
				type: 'object', properties: {
					[key]: property,
					availableApprovalModes: { type: 'array', title: 'Available', readOnly: true },
				},
			}))), Array(8).fill(true));
	});

	test('explicit approval defaults honor policy then memory before user configuration', () => {
		const results = [undefined, { approvals: 'manual' }].map(policyValue => {
			const config = new class extends TestConfigurationService {
				override inspect<T>(key: string): IConfigurationValue<T> {
					return { ...super.inspect<T>(key), policyValue: policyValue as T, memoryValue: { approvals: 'assisted' } as T, userValue: { approvals: 'allowAll' } as T };
				}
			}();
			return getAgentHostApprovalDefault(config);
		});
		assert.deepStrictEqual(results, ['assisted', 'default']);
	});

	test('schema Manual is not an explicit preference, but configured Manual is', async () => {
		const config = new class extends TestConfigurationService {
			override inspect<T>(key: string): IConfigurationValue<T> {
				const value = super.inspect<T>(key);
				return key === ChatConfiguration.DefaultConfiguration ? { ...value, value: value.value ?? { approvals: 'manual' } as T } : value;
			}
		}();
		const initial = getAgentHostApprovalDefault(config);
		await config.setUserConfiguration(ChatConfiguration.DefaultConfiguration, { approvals: 'manual' });
		assert.deepStrictEqual({ initial, explicit: getAgentHostApprovalDefault(config) }, { initial: undefined, explicit: 'default' });
	});

	for (const native of [false, true]) {
		for (const hostPolicy of [false, true]) {
			test(`initial approval preference is clamped only after discovery (native=${native}, hostPolicy=${hostPolicy})`, async () => {
				const property = native ? 'approvalMode' : 'autoApprove';
				const manual = native ? 'manual' : 'default';
				const allowAll = native ? 'allow-all' : 'autoApprove';
				const schema: SessionConfigSchema = {
					type: 'object', properties: {
						[property]: { type: 'string', title: 'Approvals', enum: [manual, 'assisted', allowAll], default: manual },
						...(hostPolicy ? { availableApprovalModes: { type: 'array', title: 'Available', readOnly: true } } : {}),
					}
				};
				const resolved = { schema, values: { [property]: manual, availableApprovalModes: [manual, 'assisted', allowAll] } };
				const configuration = new PolicyTestConfigurationService(false);
				const input = { autoApprove: 'autoApprove', isolation: 'folder' };
				let discoveries = 0;
				const result = await resolveInitialAgentHostApprovalConfig(configuration, {
					resolveSessionConfig: async () => { discoveries++; return resolved; },
				}, 'conforming-host', undefined, input);
				assert.deepStrictEqual({ result, discoveries, input }, {
					result: { [property]: hostPolicy ? allowAll : manual, isolation: 'folder' },
					discoveries: 1,
					input: { autoApprove: 'autoApprove', isolation: 'folder' },
				});
			});

			test(`legacy policy discovers approval defaults without a seed (native=${native}, hostPolicy=${hostPolicy})`, async () => {
				const property = native ? 'approvalMode' : 'autoApprove';
				const manual = native ? 'manual' : 'default';
				const resolved: ResolveSessionConfigResult = {
					schema: {
						type: 'object', properties: {
							[property]: { type: 'string', title: 'Approvals', enum: [manual, 'assisted'], default: 'assisted' },
							...(hostPolicy ? { availableApprovalModes: { type: 'array', title: 'Available', readOnly: true } } : {}),
						},
					},
					values: { [property]: 'assisted', availableApprovalModes: [manual, 'assisted'] },
				};
				let discoveries = 0;
				const configuration = new PolicyTestConfigurationService(false);
				const result = await resolveInitialAgentHostApprovalConfig(configuration, {
					resolveSessionConfig: async () => { discoveries++; return resolved; },
				}, 'conforming-host', undefined, {});
				const explicitManual = await resolveInitialAgentHostApprovalConfig(configuration, {
					resolveSessionConfig: async () => { discoveries++; return resolved; },
				}, 'conforming-host', undefined, { autoApprove: 'default' });
				assert.deepStrictEqual({ result, explicitManual, discoveries }, {
					result: hostPolicy ? {} : { [property]: manual },
					explicitManual: { [property]: manual },
					discoveries: 2,
				});
			});
		}
	}

	test('initial approval discovery does not add calls without a conflicting legacy restriction', async () => {
		const input = { autoApprove: 'autoApprove' };
		const connection = { resolveSessionConfig: async () => { throw new Error('No discovery expected'); } };
		assert.deepStrictEqual([
			await resolveInitialAgentHostApprovalConfig(new PolicyTestConfigurationService(undefined), connection, 'copilotcli', undefined, input),
			await resolveInitialAgentHostApprovalConfig(new PolicyTestConfigurationService(undefined), connection, 'copilotcli', undefined, { autoApprove: 'default' }),
		], [input, { autoApprove: 'default' }]);
	});

	test('native approval normalization applies the legacy clamp before checking availability', () => {
		const resolved = {
			schema: { type: 'object' as const, properties: { approvalMode: { type: 'string' as const, title: 'Approvals', enum: ['manual'] } } },
			values: { approvalMode: 'manual' },
		};
		assert.deepStrictEqual(normalizeAgentHostApprovalConfig(new PolicyTestConfigurationService(false), resolved, { autoApprove: 'autoApprove' }), { approvalMode: 'manual' });
	});

	test('an explicit standard approval selection takes precedence over its VS Code alias', () => {
		const resolved = {
			schema: {
				type: 'object' as const, properties: {
					approvalMode: { type: 'string' as const, title: 'Approvals', enum: ['manual', 'allow-all'] },
					availableApprovalModes: { type: 'array' as const, title: 'Available', readOnly: true },
				}
			},
			values: { approvalMode: 'allow-all', availableApprovalModes: ['manual', 'allow-all'] },
		};
		assert.deepStrictEqual(normalizeAgentHostApprovalConfig(new PolicyTestConfigurationService(false), resolved, { autoApprove: 'autoApprove', approvalMode: 'manual' }), { approvalMode: 'manual' });
	});

	for (const autoApprove of [undefined, 'autoApprove']) {
		test(`initial approval discovery failure cannot silently use a host default or elevated seed (${autoApprove})`, async () => {
			const failure = new Error('Discovery unavailable');
			await assert.rejects(resolveInitialAgentHostApprovalConfig(new PolicyTestConfigurationService(false), {
				resolveSessionConfig: async () => { throw failure; },
			}, 'copilotcli', undefined, autoApprove === undefined ? {} : { autoApprove }), error => error === failure);
		});
	}

	test('a host-disallowed preference does not overwrite its managed default', () => {
		const resolved = {
			schema: {
				type: 'object' as const, properties: {
					autoApprove: { type: 'string' as const, title: 'Approvals', enum: ['default', 'assisted', 'autoApprove'] },
					availableApprovalModes: { type: 'array' as const, title: 'Available', readOnly: true },
				}
			},
			values: { autoApprove: 'assisted', availableApprovalModes: ['default', 'assisted'] },
		};
		assert.deepStrictEqual(normalizeAgentHostApprovalConfig(new PolicyTestConfigurationService(false), resolved, { autoApprove: 'autoApprove' }), {});
	});

	test('auto-approve policy ignores preview policy and honors the bypass restriction', () => {
		assert.deepStrictEqual([
			autoApprovePolicyValue({ chat_preview_features_enabled: false }),
			autoApprovePolicyValue({ managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' } }),
			autoApprovePolicyValue({ managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'enable' } }),
		], [
			undefined,
			false,
			undefined,
		]);
	});

	test('applies a non-elevated (mode) change without a dialog', async () => {
		const dialog = new TestDialogService(); // default confirms if prompted
		const storage = store.add(new InMemoryStorageService());
		let applied: Record<string, string> | undefined;
		const result = await applyAgentHostCompletionAction(
			{ applyConfig: { mode: 'autopilot' } },
			dialog,
			storage,
			config => { applied = { ...config }; },
		);
		assert.strictEqual(result, true);
		assert.deepStrictEqual(applied, { mode: 'autopilot' });
	});

	test('applies an elevated autoApprove change when the confirmation is accepted', async () => {
		const dialog = new TestDialogService(); // first (confirm) button returns true
		const storage = store.add(new InMemoryStorageService());
		let applied: Record<string, string> | undefined;
		const result = await applyAgentHostCompletionAction(
			{ applyConfig: { autoApprove: 'autoApprove' } },
			dialog,
			storage,
			config => { applied = { ...config }; },
		);
		assert.strictEqual(result, true);
		assert.deepStrictEqual(applied, { autoApprove: 'autoApprove' });
	});

	test('does not apply an elevated change when the confirmation is cancelled', async () => {
		const dialog = new TestDialogService(undefined, { result: false });
		const storage = store.add(new InMemoryStorageService());
		let applied = false;
		const result = await applyAgentHostCompletionAction(
			{ applyConfig: { autoApprove: 'autoApprove' } },
			dialog,
			storage,
			() => { applied = true; },
		);
		assert.strictEqual(result, false);
		assert.strictEqual(applied, false);
	});

	suite('isPolicyBlockedCompletionAction', () => {
		test('elevated autoApprove is blocked only when policy restricts auto-approval', () => {
			const restricted = new PolicyTestConfigurationService(false);
			const unrestricted = new PolicyTestConfigurationService(undefined);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'autoApprove' } }, restricted), true);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'assisted' } }, restricted), true);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'autoApprove' } }, unrestricted), false);
		});

		test('non-elevated and mode-axis actions are never policy-blocked', () => {
			const restricted = new PolicyTestConfigurationService(false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'default' } }, restricted), false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { mode: 'autopilot' } }, restricted), false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: {} }, restricted), false);
		});
	});
});
