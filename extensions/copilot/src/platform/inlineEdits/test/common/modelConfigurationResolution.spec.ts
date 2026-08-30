/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { ConfigKey, ExperimentBasedConfig, ExperimentBasedConfigType } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { autorun, constObservable } from '../../../../util/vs/base/common/observable';
import { observeModelConfigValue, resolveModelConfigValue } from '../../common/modelConfigurationResolution';

class StubExperimentationService extends NullExperimentationService {
	constructor(private readonly treatments: Record<string, boolean | number | string> = {}) {
		super();
	}

	override getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
		return this.treatments[name] as T | undefined;
	}
}

/** Every knob a prompting strategy may bake in, paired with the setting it defers to. */
const BAKED_KEYS = [
	ConfigKey.TeamInternal.InlineEditsCacheDelay,
	ConfigKey.TeamInternal.InlineEditsRebasedCacheDelay,
	ConfigKey.TeamInternal.InlineEditsDebounce,
	ConfigKey.TeamInternal.InlineEditsExtraDebounceEndOfLine,
	ConfigKey.TeamInternal.InlineEditsUnification,
	ConfigKey.TeamInternal.InlineEditsNesMimicGhostTextBehavior,
	ConfigKey.TeamInternal.InlineEditsXtabProviderPatchModelPredictionKind,
	ConfigKey.TeamInternal.InlineEditsXtabProviderPatchFastYieldLineWithCursor,
	ConfigKey.TeamInternal.InlineEditsXtabSplitPatchOnDiff,
] satisfies ExperimentBasedConfig<ExperimentBasedConfigType>[];

describe('resolveModelConfigValue', () => {
	const key = ConfigKey.TeamInternal.InlineEditsCacheDelay;
	const treatmentName = `copilotchat.config.${key.id}`;

	function resolve({ treatments, userValue, modelValue }: {
		treatments?: Record<string, boolean | number | string>;
		userValue?: number;
		modelValue?: number;
	}) {
		const configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		if (userValue !== undefined) {
			void configurationService.setConfig(key, userValue);
		}
		return resolveModelConfigValue(configurationService, new StubExperimentationService(treatments), key, modelValue);
	}

	it('uses the model configuration when the setting is not explicitly driven', () => {
		expect(resolve({ modelValue: 42 })).toBe(42);
	});

	it('falls back to the setting default when neither side provides a value', () => {
		expect(resolve({})).toBe(key.defaultValue);
	});

	it('lets an experiment override a baked model value', () => {
		expect(resolve({ modelValue: 42, treatments: { [treatmentName]: 7 } })).toBe(7);
	});

	it('lets the user override a baked model value', () => {
		expect(resolve({ modelValue: 42, userValue: 7 })).toBe(7);
	});

	it('prefers the user value over the experiment value', () => {
		expect(resolve({ modelValue: 42, userValue: 7, treatments: { [treatmentName]: 3 } })).toBe(7);
	});

	it('treats a falsy baked value as provided', () => {
		expect(resolve({ modelValue: 0 })).toBe(0);
	});

	it('lets a falsy experiment value override a baked model value', () => {
		expect(resolve({ modelValue: 42, treatments: { [treatmentName]: 0 } })).toBe(0);
	});

	it('only defers to keys that are not contributed in package.json', () => {
		// A contributed setting tagged `onExp` receives its treatment through `inspect().defaultValue`,
		// which would rank the baked model value above the experiment again.
		expect(BAKED_KEYS.filter(key => key.isPublic)).toEqual([]);
	});
});

describe('observeModelConfigValue', () => {
	const key = ConfigKey.TeamInternal.InlineEditsUnification;

	it('re-resolves when an experiment assigns the setting after the observable was built', () => {
		const store = new DisposableStore();
		const treatments: Record<string, boolean | number | string> = {};
		// `DefaultsOnlyConfigurationService` invalidates selectively, the way the real service does;
		// `InMemoryConfigurationService` inherits the permissive "everything changed" fallback.
		const configurationService = store.add(new DefaultsOnlyConfigurationService());
		const resolved = observeModelConfigValue(undefined, configurationService, new StubExperimentationService(treatments), key, constObservable<boolean | undefined>(true));

		const observed: boolean[] = [];
		store.add(autorun(reader => { observed.push(resolved.read(reader)); }));

		// Treatments arrive after the graph is built, under the older `copilotchat.config.` alias.
		const treatmentName = `copilotchat.config.${key.id}`;
		treatments[treatmentName] = false;
		configurationService.updateExperimentBasedConfiguration([treatmentName]);

		expect(observed).toEqual([true, false]);
		store.dispose();
	});
});
