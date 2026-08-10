/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ModelConfiguration } from '../../common/dataTypes/xtabPromptOptions';
import { getInlineEditsConfigWithDefault, getInlineEditsUnificationDefaults, InlineEditsUnification } from '../../common/inlineEditsUnification';

describe('inline edits unification', () => {
	test('resolves the completions NES profile', () => {
		const config: ModelConfiguration = {
			modelName: 'test-model',
			promptingStrategy: undefined,
			includeTagsInCurrentFile: false,
			lintOptions: undefined,
			unification: InlineEditsUnification.CompletionsNes,
		};

		expect(getInlineEditsUnificationDefaults(config)).toEqual({
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

		expect(getInlineEditsConfigWithDefault(
			configurationService,
			ConfigKey.TeamInternal.InlineEditsDebounce,
			new NullExperimentationService(),
			0,
		)).toBe(25);
	});

	test('prefers an experiment treatment over the profile default', () => {
		const key = ConfigKey.TeamInternal.InlineEditsDebounce;
		const experimentationService = new class extends NullExperimentationService {
			override getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
				return name === `copilotchat.config.${key.id}` ? 50 as T : undefined;
			}
		}();

		expect(getInlineEditsConfigWithDefault(
			new DefaultsOnlyConfigurationService(),
			key,
			experimentationService,
			0,
		)).toBe(50);
	});
});
