/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test, vi } from 'vitest';

const { mockConfigStore } = vi.hoisted(() => ({
	mockConfigStore: { user: {} as Record<string, unknown>, defaults: {} as Record<string, unknown> },
}));

vi.mock('vscode', () => {
	function makeConfig(prefix: string) {
		const fullKey = (k: string) => prefix ? `${prefix}.${k}` : k;
		return {
			get<T>(k: string): T | undefined {
				const fk = fullKey(k);
				if (fk in mockConfigStore.user) {
					return mockConfigStore.user[fk] as T;
				}
				if (fk in mockConfigStore.defaults) {
					return mockConfigStore.defaults[fk] as T;
				}
				return undefined;
			},
			inspect<T>(k: string) {
				const fk = fullKey(k);
				return {
					key: fk,
					defaultValue: mockConfigStore.defaults[fk] as T | undefined,
					globalValue: (fk in mockConfigStore.user ? mockConfigStore.user[fk] : undefined) as T | undefined,
				};
			},
		};
	}
	return {
		workspace: {
			getConfiguration: (prefix: string) => makeConfig(prefix),
			onDidChangeConfiguration: () => ({ dispose() { } }),
		},
	};
});

import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ConfigKey } from '../../common/configurationService';
import { ConfigurationServiceImpl } from '../configurationServiceImpl';

const fakeTokenStore: ICopilotTokenStore = {
	copilotToken: undefined,
	onDidStoreUpdate: () => ({ dispose() { } }),
} as any;

class StubExperimentationService extends NullExperimentationService {
	constructor(private readonly treatments: Record<string, boolean | number | string>) {
		super();
	}

	override getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
		return this.treatments[name] as T | undefined;
	}
}

describe('ConfigurationServiceImpl - migrated chat.advanced setting fallback', () => {
	test('reads the user-set OLD key when only the OLD key is configured', () => {
		const oldKey = `github.copilot.${ConfigKey.Advanced.InlineEditsXtabProviderModelConfiguration.oldId}`;
		const newKey = ConfigKey.Advanced.InlineEditsXtabProviderModelConfiguration.fullyQualifiedId;

		const userValue = {
			modelName: 'dd_5minichat_edits_xtab_300_small',
			promptingStrategy: 'xtab275',
			includeTagsInCurrentFile: false,
		};

		mockConfigStore.user = { [oldKey]: userValue };
		// The new key is registered with `type: ["object", "null"]` and `default: null`,
		// so an unconfigured user reads `null` for the new key, allowing the
		// `?? config.get(oldKey)` fallback to take over.
		mockConfigStore.defaults = { [newKey]: null };

		const svc = new ConfigurationServiceImpl(fakeTokenStore);
		const value = svc.getConfig(ConfigKey.Advanced.InlineEditsXtabProviderModelConfiguration);

		expect(value).toEqual(userValue);
	});
});

describe('ConfigurationServiceImpl - getExperimentBasedConfigIfSet', () => {
	const key = ConfigKey.TeamInternal.InlineEditsCacheDelay;
	const expName = `copilotchat.config.${key.id}`;

	function read(user: Record<string, unknown>, treatments: Record<string, boolean | number | string>) {
		mockConfigStore.user = user;
		mockConfigStore.defaults = {};
		const service = new ConfigurationServiceImpl(fakeTokenStore);
		const expService = new StubExperimentationService(treatments);
		return {
			ifSet: service.getExperimentBasedConfigIfSet(key, expService),
			resolved: service.getExperimentBasedConfig(key, expService),
		};
	}

	test('reports unset when neither the user nor an experiment provides a value', () => {
		expect(read({}, {})).toEqual({ ifSet: undefined, resolved: key.defaultValue });
	});

	test('reports the experiment value when only an experiment provides one', () => {
		expect(read({}, { [expName]: 42 })).toEqual({ ifSet: 42, resolved: 42 });
	});

	test('prefers the user value over the experiment value', () => {
		expect(read({ [key.fullyQualifiedId]: 7 }, { [expName]: 42 })).toEqual({ ifSet: 7, resolved: 7 });
	});

	test('reports falsy configured values as set', () => {
		expect(read({ [key.fullyQualifiedId]: 0 }, {})).toEqual({ ifSet: 0, resolved: 0 });
		expect(read({}, { [expName]: 0 })).toEqual({ ifSet: 0, resolved: 0 });
	});

	test('reports a falsy boolean treatment as set', () => {
		const boolKey = ConfigKey.TeamInternal.InlineEditsUnification;
		mockConfigStore.user = {};
		mockConfigStore.defaults = {};
		const service = new ConfigurationServiceImpl(fakeTokenStore);
		const expService = new StubExperimentationService({ [`copilotchat.config.${boolKey.id}`]: false });
		expect(service.getExperimentBasedConfigIfSet(boolKey, expService)).toBe(false);
	});
});

describe('ConfigurationServiceImpl - externally configurable advanced settings', () => {
	test('reports treatments arriving under any of a setting\'s names as affecting it', () => {
		mockConfigStore.user = {};
		mockConfigStore.defaults = {};
		const key = ConfigKey.TeamInternal.InlineEditsUnification;
		const service = new ConfigurationServiceImpl(fakeTokenStore);

		const affected: boolean[] = [];
		service.onDidChangeConfiguration(e => affected.push(e.affectsConfiguration(key.fullyQualifiedId)));

		// A treatment can be published under the `config.` name or the older `copilotchat.config.` one;
		// both assign the setting, so both have to invalidate its observers.
		service.updateExperimentBasedConfiguration([`config.${key.fullyQualifiedId}`]);
		service.updateExperimentBasedConfiguration([`copilotchat.config.${key.id}`]);
		service.updateExperimentBasedConfiguration(['config.github.copilot.chat.somethingElse']);

		expect(affected).toEqual([true, true, false]);
	});

	test('reads advanced inline edit settings for external users', () => {
		mockConfigStore.user = {
			[ConfigKey.TeamInternal.InlineEditsUnification.fullyQualifiedId]: true,
			[ConfigKey.TeamInternal.InlineEditsExcludedProviders.fullyQualifiedId]: 'completions,github.copilot',
			[ConfigKey.TeamInternal.InlineEditsXtabProviderPatchModelPredictionKind.fullyQualifiedId]: 'currentLineCompleted',
			[ConfigKey.TeamInternal.InlineEditsXtabSplitPatchOnDiff.fullyQualifiedId]: true,
			[ConfigKey.TeamInternal.InlineEditsXtabProviderPatchFastYieldLineWithCursor.fullyQualifiedId]: false,
			[ConfigKey.TeamInternal.InlineEditsNesMimicGhostTextBehavior.fullyQualifiedId]: true,
			[ConfigKey.TeamInternal.InlineEditsRebasedCacheDelay.fullyQualifiedId]: 100,
			[ConfigKey.TeamInternal.InlineEditsExtraDebounceEndOfLine.fullyQualifiedId]: 0,
			[ConfigKey.TeamInternal.InlineEditsDebounce.fullyQualifiedId]: 0,
			[ConfigKey.TeamInternal.InlineEditsCacheDelay.fullyQualifiedId]: 0,
			[ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesAbove.fullyQualifiedId]: 0,
			[ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesBelow.fullyQualifiedId]: 7,
		};
		mockConfigStore.defaults = {};

		const service = new ConfigurationServiceImpl(fakeTokenStore);
		const experimentationService = new NullExperimentationService();

		expect({
			unification: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsUnification, experimentationService),
			excludedProviders: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsExcludedProviders, experimentationService),
			patchModelPredictionKind: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderPatchModelPredictionKind, experimentationService),
			splitOnDiff: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabSplitPatchOnDiff, experimentationService),
			patchFastYieldLineWithCursor: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderPatchFastYieldLineWithCursor, experimentationService),
			nesMimicGhostTextBehavior: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsNesMimicGhostTextBehavior, experimentationService),
			rebasedCacheDelay: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsRebasedCacheDelay, experimentationService),
			extraDebounceEndOfLine: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsExtraDebounceEndOfLine, experimentationService),
			debounce: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsDebounce, experimentationService),
			cacheDelay: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsCacheDelay, experimentationService),
			nLinesAbove: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesAbove, experimentationService),
			nLinesBelow: service.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesBelow, experimentationService),
		}).toEqual({
			unification: true,
			excludedProviders: 'completions,github.copilot',
			patchModelPredictionKind: 'currentLineCompleted',
			splitOnDiff: true,
			patchFastYieldLineWithCursor: false,
			nesMimicGhostTextBehavior: true,
			rebasedCacheDelay: 100,
			extraDebounceEndOfLine: 0,
			debounce: 0,
			cacheDelay: 0,
			nLinesAbove: 0,
			nLinesBelow: 7,
		});
	});
});
