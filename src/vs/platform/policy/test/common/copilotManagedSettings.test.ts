/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { ManagedSettingsData } from '../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collectManagedSettingsDefinitions, COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY, COPILOT_MODEL_KEY, COPILOT_OTEL_CAPTURE_IDENTITY_KEY, COPILOT_SANDBOX_ENABLED_KEY, COPILOT_TOP_LEVEL_MODEL_KEY, hasManagedSettingsDefinitions, managedModelValue, managedSettingsDisabledValue, managedSettingValue, normalizeManagedSettings, projectManagedSettings, pickManagedSettings, resolveForceRemoteSettingsRefresh } from '../../common/copilotManagedSettings.js';
import { PolicyDefinition } from '../../common/policy.js';

suite('Copilot managed settings projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const definitions: IStringDictionary<PolicyDefinition> = {
		PolicyA: {
			type: 'boolean',
			managedSettings: { 'permissions.disableBypassPermissionsMode': { type: 'string' } },
		},
		PolicyB: {
			type: 'number',
			managedSettings: { 'limits.maxFoo': { type: 'number' }, 'flags.enableBar': { type: 'boolean' } },
		},
		PolicyC: {
			type: 'string',
		},
	};

	test('collectManagedSettingsDefinitions aggregates declarations across all policies', () => {
		assert.deepStrictEqual(collectManagedSettingsDefinitions(definitions), {
			'permissions.disableBypassPermissionsMode': { type: 'string' },
			'limits.maxFoo': { type: 'number' },
			'flags.enableBar': { type: 'boolean' },
		});
	});

	test('collectManagedSettingsDefinitions returns empty when nothing is declared', () => {
		assert.deepStrictEqual(collectManagedSettingsDefinitions({ P: { type: 'string' } }), {});
	});

	test('identity capture preserves explicit false, drops invalid types, and leaves omission unset', () => {
		const key = COPILOT_OTEL_CAPTURE_IDENTITY_KEY;
		const declarations = collectManagedSettingsDefinitions({
			CopilotOtelCaptureIdentity: { type: 'boolean', managedSettings: { [key]: { type: 'boolean' } } },
		});
		const value = managedSettingValue(key);
		assert.deepStrictEqual({
			denied: projectManagedSettings({ [key]: false }, declarations),
			allowed: projectManagedSettings({ [key]: true }, declarations),
			invalid: projectManagedSettings({ [key]: 'false' }, declarations),
			absent: value({ managedSettings: { 'telemetry.lockCaptureContent': true } }),
			explicitFalse: value({ managedSettings: { [key]: false, 'telemetry.captureContent': true } }),
		}, {
			denied: { [key]: false }, allowed: { [key]: true }, invalid: {},
			absent: undefined, explicitFalse: false,
		});
	});

	test('hasManagedSettingsDefinitions detects whether any policy declares a managed key', () => {
		assert.deepStrictEqual(
			{
				withKeys: hasManagedSettingsDefinitions(definitions),
				none: hasManagedSettingsDefinitions({ P: { type: 'string' } }),
				empty: hasManagedSettingsDefinitions({}),
			},
			{ withKeys: true, none: false, empty: false },
		);
	});

	test('managedSettingValue locks to the managed value when set, else undefined', () => {
		const value = managedSettingValue('permissions.disableBypassPermissionsMode');
		assert.deepStrictEqual(
			{
				set: value({ managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' } } as IPolicyData),
				otherKey: value({ managedSettings: { 'other.key': 'x' } } as IPolicyData),
				noBag: value({} as IPolicyData),
			},
			{ set: 'disable', otherKey: undefined, noBag: undefined },
		);
	});

	test('managedSettingValue returns the same memoized callback per key (stable reference identity)', () => {
		assert.strictEqual(
			managedSettingValue('permissions.disableBypassPermissionsMode'),
			managedSettingValue('permissions.disableBypassPermissionsMode'),
		);
		assert.notStrictEqual(
			managedSettingValue('permissions.disableBypassPermissionsMode'),
			managedSettingValue('some.other.key'),
		);
	});

	test('managedModelValue prefers the top-level key, falls back to the legacy nested key', () => {
		const value = managedModelValue();
		assert.deepStrictEqual(
			{
				bothPresent: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: 'opus', [COPILOT_MODEL_KEY]: 'gemini' } } as IPolicyData),
				topLevelOnly: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: 'opus' } } as IPolicyData),
				legacyOnly: value({ managedSettings: { [COPILOT_MODEL_KEY]: 'gemini' } } as IPolicyData),
				neither: value({ managedSettings: { 'other.key': 'x' } } as IPolicyData),
				noBag: value({} as IPolicyData),
			},
			{ bothPresent: 'opus', topLevelOnly: 'opus', legacyOnly: 'gemini', neither: undefined, noBag: undefined },
		);
	});

	test('managedModelValue trims values and treats a blank top-level value as unset (falls through to legacy)', () => {
		const value = managedModelValue();
		assert.deepStrictEqual(
			{
				trimsTopLevel: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: '  opus  ' } } as IPolicyData),
				trimsLegacy: value({ managedSettings: { [COPILOT_MODEL_KEY]: '  gemini  ' } } as IPolicyData),
				blankTopLevelFallsBack: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: '   ', [COPILOT_MODEL_KEY]: 'gemini' } } as IPolicyData),
				bothBlank: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: '   ', [COPILOT_MODEL_KEY]: '  ' } } as IPolicyData),
				nonString: value({ managedSettings: { [COPILOT_TOP_LEVEL_MODEL_KEY]: 42 } } as IPolicyData),
			},
			{ trimsTopLevel: 'opus', trimsLegacy: 'gemini', blankTopLevelFallsBack: 'gemini', bothBlank: undefined, nonString: undefined },
		);
	});

	test('managedModelValue returns the same memoized callback (stable reference identity)', () => {
		assert.strictEqual(managedModelValue(), managedModelValue());
	});

	test('managedSettingsDisabledValue forces false only while managed settings are active', () => {
		assert.deepStrictEqual({
			active: managedSettingsDisabledValue({ managedSettingsActive: true }),
			inactive: managedSettingsDisabledValue({ managedSettingsActive: false }),
			unset: managedSettingsDisabledValue({}),
			previewFeaturesDisabled: managedSettingsDisabledValue({ chat_preview_features_enabled: false }),
		}, {
			active: false,
			inactive: undefined,
			unset: undefined,
			previewFeaturesDisabled: undefined,
		});
	});

	test('forceRemoteSettingsRefresh resolves across all channels and reports the winning source', () => {
		const key = COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY;
		assert.deepStrictEqual({
			serverTrue: resolveForceRemoteSettingsRefresh(undefined, { [key]: true }, undefined),
			nativeTrue: resolveForceRemoteSettingsRefresh({ [key]: true }, { [key]: false }, undefined),
			nativeFalse: resolveForceRemoteSettingsRefresh({ [key]: false }, { [key]: true }, undefined),
			malformedNative: resolveForceRemoteSettingsRefresh({ [key]: 'true' }, { [key]: true }, undefined),
			fileTrue: resolveForceRemoteSettingsRefresh(undefined, undefined, { [key]: true }),
			serverBeatsFile: resolveForceRemoteSettingsRefresh(undefined, { [key]: false }, { [key]: true }),
			unset: resolveForceRemoteSettingsRefresh(undefined, undefined, undefined),
		}, {
			serverTrue: { effective: true, source: 'server' },
			nativeTrue: { effective: true, source: 'nativeMdm' },
			nativeFalse: { effective: false },
			// A malformed value is treated as absent so it cannot mask a lower-precedence channel.
			malformedNative: { effective: true, source: 'server' },
			// The file channel participates; a native/server-only resolver ignored it.
			fileTrue: { effective: true, source: 'file' },
			serverBeatsFile: { effective: false },
			unset: { effective: false },
		});
	});

	test('projectManagedSettings keeps declared+typed keys, drops undeclared and type-mismatched', () => {
		const projected = projectManagedSettings({
			'permissions.disableBypassPermissionsMode': 'disable', // declared string -> kept
			'limits.maxFoo': 5,                                    // declared number -> kept
			'flags.enableBar': 'true',                             // declared boolean, got string -> dropped
			'unknown.key': 'x',                                    // undeclared -> dropped
		}, collectManagedSettingsDefinitions(definitions));

		assert.deepStrictEqual(projected, {
			'permissions.disableBypassPermissionsMode': 'disable',
			'limits.maxFoo': 5,
		});
	});

	test('projectManagedSettings validates without coercing (string stays a string)', () => {
		assert.deepStrictEqual(
			projectManagedSettings(
				{ 'permissions.disableBypassPermissionsMode': 'false' },
				{ 'permissions.disableBypassPermissionsMode': { type: 'string' } },
			),
			{ 'permissions.disableBypassPermissionsMode': 'false' },
		);
	});

	test('projectManagedSettings warns once per type mismatch', () => {
		const warnings: string[] = [];
		projectManagedSettings(
			{ 'flags.enableBar': 'true' },
			{ 'flags.enableBar': { type: 'boolean' } },
			msg => warnings.push(msg),
		);
		assert.strictEqual(warnings.length, 1);
	});
});

suite('Copilot managed settings precedence (pickManagedSettings)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const higher of [
		{},
		{ capture: {} },
		{ endpoint: 'https://higher.example' },
		{ capture: { identity: false } },
		{ capture: { identity: true } },
		{ futureControl: {} },
		{ futureControl: ['unknown'] },
		{ futureControl: true },
		{ resourceAttributes: {} },
		{ resourceAttributes: { 'host.name': 'higher-host' }, headers: { authorization: 'higher' } },
	]) {
		for (const lowerIdentity of [false, true]) {
			for (const native of [false, true]) {
				const selected = normalizeManagedSettings({ telemetry: higher });
				// Native delivery observes declared flat keys, not normalized empty/unknown object blocks.
				if (native && Object.keys(selected).some(key => ![
					'telemetry.endpoint', COPILOT_OTEL_CAPTURE_IDENTITY_KEY, 'telemetry.resourceAttributes', 'telemetry.headers',
				].includes(key))) {
					continue;
				}
				test(`telemetry selects one whole ${native ? 'native' : 'server'} block: ${JSON.stringify(higher)}, lower identity ${lowerIdentity}`, () => {
					const lower = normalizeManagedSettings({
						telemetry: {
							enabled: true, capture: { identity: lowerIdentity }, captureContent: true,
							lockCaptureContent: true, endpoint: 'https://lower.example', protocol: 'grpc',
							serviceName: 'lower', resourceAttributes: { 'host.name': 'lower-host', extra: 'lower' },
							headers: { authorization: 'lower' },
						}
					});
					const pick = native
						? pickManagedSettings(selected, lower, lower)
						: pickManagedSettings(undefined, selected, lower);
					const identity = COPILOT_OTEL_CAPTURE_IDENTITY_KEY;
					const projected = projectManagedSettings(pick.values, { [identity]: { type: 'boolean' } });
					assert.deepStrictEqual({
						values: pick.values,
						activeSources: pick.activeSources,
						projected,
					}, {
						values: selected,
						activeSources: [native ? 'nativeMdm' : 'server'],
						projected: typeof selected[identity] === 'boolean' ? { [identity]: selected[identity] } : {},
					});
				});
			}
		}
	}

	test('absent telemetry blocks fall through without changing unrelated per-key or sandbox resolution', () => {
		const file = normalizeManagedSettings({ telemetry: { capture: { identity: true } } });
		const pick = pickManagedSettings(
			{ model: 'native', [COPILOT_SANDBOX_ENABLED_KEY]: false },
			{ model: 'server', serverOnly: true },
			{ ...file, fileOnly: true, [COPILOT_SANDBOX_ENABLED_KEY]: true },
		);
		assert.deepStrictEqual(pick.values, {
			model: 'native', serverOnly: true, fileOnly: true,
			[COPILOT_SANDBOX_ENABLED_KEY]: true, [COPILOT_OTEL_CAPTURE_IDENTITY_KEY]: true,
		});
	});

	test('flat native telemetry selects the block and keeps contested-key provenance', () => {
		const key = COPILOT_OTEL_CAPTURE_IDENTITY_KEY;
		const pick = pickManagedSettings({ [key]: false }, { [key]: true, 'telemetry.enabled': true }, undefined);
		assert.deepStrictEqual(pick, {
			values: { [key]: false },
			resolutions: new Map([[key, {
				value: false, source: 'nativeMdm',
				contributions: [{ channel: 'nativeMdm', value: false }, { channel: 'server', value: true }],
			}]]),
			suppressedTelemetry: new Map([['telemetry.enabled', [{ channel: 'server', value: true }]]]),
			activeSources: ['nativeMdm'],
		});
	});

	test('retains excluded telemetry provenance without applying lower-only leaves or activating their sources', () => {
		const key = COPILOT_OTEL_CAPTURE_IDENTITY_KEY;
		const pick = pickManagedSettings(
			{ 'telemetry.capture.prompts': false },
			{ [key]: false, 'telemetry.endpoint': 'server-endpoint' },
			{ [key]: true, 'telemetry.endpoint': 'file-endpoint' },
		);
		assert.deepStrictEqual({
			values: pick.values,
			resolvedKeys: [...pick.resolutions.keys()],
			suppressed: [...pick.suppressedTelemetry],
			activeSources: pick.activeSources,
		}, {
			values: { 'telemetry.capture.prompts': false },
			resolvedKeys: ['telemetry.capture.prompts'],
			suppressed: [
				[key, [{ channel: 'server', value: false }, { channel: 'file', value: true }]],
				['telemetry.endpoint', [{ channel: 'server', value: 'server-endpoint' }, { channel: 'file', value: 'file-endpoint' }]],
			],
			activeSources: ['nativeMdm'],
		});
	});

	test('an empty server telemetry block preserves excluded file provenance separately from policy values', () => {
		const key = COPILOT_OTEL_CAPTURE_IDENTITY_KEY;
		const pick = pickManagedSettings(undefined, normalizeManagedSettings({ telemetry: {} }), { [key]: true });
		assert.deepStrictEqual({
			values: pick.values,
			projected: projectManagedSettings(pick.values, { [key]: { type: 'boolean' } }),
			marker: pick.resolutions.get('telemetry'),
			suppressed: [...pick.suppressedTelemetry],
		}, {
			values: { telemetry: '{}' },
			projected: {},
			marker: { value: '{}', source: 'server', contributions: [{ channel: 'server', value: '{}' }] },
			suppressed: [[key, [{ channel: 'file', value: true }]]],
		});
	});

	test('diagnostic provenance does not change effective policy or unrelated precedence across telemetry lifecycle states', () => {
		const identity = COPILOT_OTEL_CAPTURE_IDENTITY_KEY;
		const enabled = 'telemetry.enabled';
		const sandbox = COPILOT_SANDBOX_ENABLED_KEY;
		const serverTelemetry = { [identity]: true, [enabled]: true };
		const unrelated = { shared: 'native', serverOnly: 'server', fileOnly: 'file', [sandbox]: true };
		const states: { name: string; telemetry: ManagedSettingsData; expected: ManagedSettingsData; suppressed: string[] }[] = [
			{ name: 'absent', telemetry: {}, expected: serverTelemetry, suppressed: [] },
			{ name: 'managed false', telemetry: { [identity]: false }, expected: { [identity]: false }, suppressed: [enabled] },
			{ name: 'managed true', telemetry: { [identity]: true }, expected: { [identity]: true }, suppressed: [enabled] },
			{ name: 'identity omitted', telemetry: { 'telemetry.capture.prompts': false }, expected: { 'telemetry.capture.prompts': false }, suppressed: [identity, enabled] },
			{ name: 'withdrawn', telemetry: {}, expected: serverTelemetry, suppressed: [] },
		];
		for (const state of states) {
			const pick = pickManagedSettings(
				{ shared: 'native', [sandbox]: false, ...state.telemetry },
				{ shared: 'server', serverOnly: 'server', ...serverTelemetry },
				{ shared: 'file', fileOnly: 'file', [sandbox]: true, [identity]: false, [enabled]: true },
			);
			assert.deepStrictEqual({
				values: pick.values,
				resolutionValues: Object.fromEntries([...pick.resolutions].map(([key, resolution]) => [key, resolution.value])),
				suppressed: [...pick.suppressedTelemetry.keys()].sort(),
				activeSources: pick.activeSources,
				sharedSource: pick.resolutions.get('shared')?.source,
				sandboxSource: pick.resolutions.get(sandbox)?.source,
			}, {
				values: { ...unrelated, ...state.expected },
				resolutionValues: { ...unrelated, ...state.expected },
				suppressed: state.suppressed,
				activeSources: ['nativeMdm', 'server', 'file'],
				sharedSource: 'nativeMdm',
				sandboxSource: 'file',
			}, state.name);
		}
	});

	test('removing a higher telemetry block reveals the lower block, replacing it with empty does not', () => {
		const lower = normalizeManagedSettings({ telemetry: { capture: { identity: true } } });
		assert.deepStrictEqual({
			denied: pickManagedSettings(undefined, normalizeManagedSettings({ telemetry: { capture: { identity: false } } }), lower).values,
			empty: pickManagedSettings(undefined, normalizeManagedSettings({ telemetry: {} }), lower).values,
			withdrawn: pickManagedSettings(undefined, normalizeManagedSettings({}), lower).values,
		}, {
			denied: { [COPILOT_OTEL_CAPTURE_IDENTITY_KEY]: false },
			empty: { telemetry: '{}' },
			withdrawn: lower,
		});
	});

	test('managed sandbox enablement is force-on-wins across every channel combination', () => {
		const key = COPILOT_SANDBOX_ENABLED_KEY;
		const values = [undefined, false, true];
		for (const native of values) {
			for (const server of values) {
				for (const file of values) {
					const pick = pickManagedSettings(
						native === undefined ? undefined : { [key]: native },
						server === undefined ? undefined : { [key]: server },
						file === undefined ? undefined : { [key]: file },
					);
					const enabled = [native, server, file].includes(true);
					assert.deepStrictEqual(pick.values[key], enabled ? true : native ?? server ?? file, JSON.stringify({ native, server, file }));
				}
			}
		}
	});

	test('sandbox force-on reports the restrictive source while retaining all contributions', () => {
		const key = COPILOT_SANDBOX_ENABLED_KEY;
		const pick = pickManagedSettings({ [key]: false }, { [key]: true }, { [key]: true });
		assert.deepStrictEqual(pick, {
			values: { [key]: true },
			resolutions: new Map([[key, {
				value: true,
				source: 'server',
				contributions: [
					{ channel: 'nativeMdm', value: false },
					{ channel: 'server', value: true },
					{ channel: 'file', value: true },
				],
			}]]),
			suppressedTelemetry: new Map(),
			activeSources: ['server'],
		});
	});

	test('malformed higher-precedence sandbox values cannot mask a managed force-on', () => {
		const key = COPILOT_SANDBOX_ENABLED_KEY;
		assert.deepStrictEqual({
			string: pickManagedSettings({ [key]: 'false' }, { [key]: true }, undefined).values[key],
			number: pickManagedSettings({ [key]: 0 }, { [key]: false }, { [key]: true }).values[key],
		}, {
			string: true,
			number: true,
		});
	});

	test('distinct keys each win from their highest-precedence channel; a lower channel fills a gap the higher ones leave', () => {
		// The headline per-key behavior: `shared` is contested by all three (native wins) while
		// `nativeOnly`/`serverOnly`/`fileOnly` are each supplied by a single channel and all survive.
		const pick = pickManagedSettings(
			{ 'shared': 'native', 'nativeOnly': 'n' },
			{ 'shared': 'server', 'serverOnly': 's' },
			{ 'shared': 'file', 'fileOnly': 'f' },
		);
		assert.deepStrictEqual(pick.values, { 'shared': 'native', 'nativeOnly': 'n', 'serverOnly': 's', 'fileOnly': 'f' });
		assert.deepStrictEqual(pick.activeSources, ['nativeMdm', 'server', 'file']);
		assert.deepStrictEqual(pick.resolutions.get('shared'), {
			value: 'native',
			source: 'nativeMdm',
			contributions: [
				{ channel: 'nativeMdm', value: 'native' },
				{ channel: 'server', value: 'server' },
				{ channel: 'file', value: 'file' },
			],
		});
	});

	test('with native absent, the mid-tier server wins a contested key over file', () => {
		const pick = pickManagedSettings(undefined, { 'k': 'server' }, { 'k': 'file' });
		assert.deepStrictEqual(pick.resolutions.get('k'), {
			value: 'server',
			source: 'server',
			contributions: [
				{ channel: 'server', value: 'server' },
				{ channel: 'file', value: 'file' },
			],
		});
		assert.deepStrictEqual(pick.activeSources, ['server']);
	});

	test('falsy-but-present values are real contributions and win over a lower channel', () => {
		// `false`, `0` and `''` must not be mistaken for "unset" — a higher channel that sets them
		// still locks the key against a lower channel's value.
		const pick = pickManagedSettings(
			{ 'flag': false, 'count': 0, 'name': '' },
			undefined,
			{ 'flag': true, 'count': 99, 'name': 'lower' },
		);
		assert.deepStrictEqual(pick.values, { 'flag': false, 'count': 0, 'name': '' });
		assert.deepStrictEqual(pick.activeSources, ['nativeMdm']);
	});

	test('an explicit `undefined` hole in a higher channel falls through to a lower channel', () => {
		// A key present-but-undefined is skipped, so a lower channel can supply it.
		const pick = pickManagedSettings(
			{ 'a': undefined as unknown as string, 'b': 'native' },
			{ 'a': 'server' },
			undefined,
		);
		assert.deepStrictEqual(pick.values, { 'a': 'server', 'b': 'native' });
		assert.strictEqual(pick.resolutions.get('a')!.source, 'server');
	});

	test('the merged bag is a fresh object, never an alias of an input channel bag', () => {
		// AccountPolicyService projects `pick.values` directly, relying on it not aliasing/mutating a
		// channel's bag.
		const native = { 'a': 'native' };
		const pick = pickManagedSettings(native, undefined, undefined);
		assert.notStrictEqual(pick.values, native);
		assert.deepStrictEqual(pick.values, { 'a': 'native' });
	});

	test('empty/absent channels contribute nothing and activeSources skips a non-contributing middle channel', () => {
		assert.deepStrictEqual(
			{
				partial: pickManagedSettings({}, { 'b': 'server' }, undefined),
				// native + file contribute, server does not — activeSources must skip the gap.
				gap: pickManagedSettings({ 'x': 'n' }, undefined, { 'y': 'f' }).activeSources,
				allUndefined: pickManagedSettings(undefined, undefined, undefined),
				allEmpty: pickManagedSettings({}, {}, {}),
			},
			{
				partial: { values: { 'b': 'server' }, resolutions: new Map([['b', { value: 'server', source: 'server', contributions: [{ channel: 'server', value: 'server' }] }]]), suppressedTelemetry: new Map(), activeSources: ['server'] },
				gap: ['nativeMdm', 'file'],
				allUndefined: { values: {}, resolutions: new Map(), suppressedTelemetry: new Map(), activeSources: [] },
				allEmpty: { values: {}, resolutions: new Map(), suppressedTelemetry: new Map(), activeSources: [] },
			},
		);
	});

	test('a malicious `__proto__` key does not pollute any prototype chain', () => {
		// Simulates a JSON-parsed bag carrying an own `__proto__` key with an object value (the
		// classic prototype-pollution vector). Merging it must neither pollute Object.prototype nor
		// corrupt the returned bag's own prototype.
		const malicious = JSON.parse('{ "__proto__": { "polluted": true } }') as Record<string, string>;
		const pick = pickManagedSettings(malicious, undefined, undefined);
		assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
		assert.strictEqual(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
		assert.strictEqual(Object.getPrototypeOf(pick.values), Object.prototype);
	});
});
