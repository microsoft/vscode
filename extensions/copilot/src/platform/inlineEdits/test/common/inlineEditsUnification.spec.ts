/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { InlineEditsUnification, ModelConfiguration } from '../../common/dataTypes/xtabPromptOptions';
import { resolveInlineEditsUnificationConfiguration } from '../../common/inlineEditsUnification';

describe('inline edits unification', () => {
	const defaultModelConfiguration: ModelConfiguration = {
		modelName: 'test-model',
		promptingStrategy: undefined,
		includeTagsInCurrentFile: false,
		lintOptions: undefined,
	};

	test('resolves the normal defaults', () => {
		expect(resolveInlineEditsUnificationConfiguration(
			defaultModelConfiguration,
			new DefaultsOnlyConfigurationService(),
			new NullExperimentationService(),
		)).toEqual({
			nLinesBelow: 5,
			nLinesAbove: 2,
			unification: false,
			rebasedCacheDelay: 0,
			extraDebounceEndOfLine: 2000,
			debounce: 100,
			cacheDelay: 200,
		});
	});

	test('resolves the completions NES profile', () => {
		const config: ModelConfiguration = {
			...defaultModelConfiguration,
			unification: InlineEditsUnification.CompletionsNes,
		};

		expect(resolveInlineEditsUnificationConfiguration(
			config,
			new DefaultsOnlyConfigurationService(),
			new NullExperimentationService(),
		)).toEqual({
			nLinesBelow: 7,
			nLinesAbove: 0,
			unification: true,
			rebasedCacheDelay: 0,
			extraDebounceEndOfLine: 0,
			debounce: 0,
			cacheDelay: 200,
		});
	});

	test('prefers a standalone setting over the profile default', () => {
		const configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounce, 25);

		expect(resolveInlineEditsUnificationConfiguration(
			{ ...defaultModelConfiguration, unification: InlineEditsUnification.CompletionsNes },
			configurationService,
			new NullExperimentationService(),
		).debounce).toBe(25);
	});

	test('prefers an experiment treatment over the profile default', () => {
		const key = ConfigKey.TeamInternal.InlineEditsDebounce;
		const experimentationService = new class extends NullExperimentationService {
			override getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
				return name === `copilotchat.config.${key.id}` ? 50 as T : undefined;
			}
		}();

		expect(resolveInlineEditsUnificationConfiguration(
			{ ...defaultModelConfiguration, unification: InlineEditsUnification.CompletionsNes },
			new DefaultsOnlyConfigurationService(),
			experimentationService,
		).debounce).toBe(50);
	});
});
