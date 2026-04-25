/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import type { IChatEndpoint } from '../../../networking/common/networking';
import { IExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { modelSupportsPDFDocuments, modelSupportsToolSearch } from '../../common/chatModelCapabilities';

function fakeModel(family: string) {
	return { family } as unknown as IChatEndpoint;
}

describe('modelSupportsPDFDocuments', () => {
	test('returns true for claude family', () => {
		expect(modelSupportsPDFDocuments(fakeModel('claude-3.5-sonnet'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('claude-3-opus'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('claude-4-sonnet'))).toBe(true);
	});

	test('returns true for Anthropic family', () => {
		expect(modelSupportsPDFDocuments(fakeModel('Anthropic'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('Anthropic-custom'))).toBe(true);
	});

	test('returns false for non-Anthropic families', () => {
		expect(modelSupportsPDFDocuments(fakeModel('gpt-4'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.1'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('gemini-2.0-flash'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('o4-mini'))).toBe(false);
	});
});

describe('modelSupportsToolSearch', () => {
	test('supports Claude Sonnet/Opus 4.5 and up', () => {
		expect(modelSupportsToolSearch('claude-sonnet-4-5')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4.5')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4-5-20250929')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4-6')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4.6')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4-5')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4.5')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4-5-20251101')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4-6')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4.6')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4.7')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4-7@1.0.0')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4-6@1.0.0')).toBe(true);
	});

	test('rejects pre-4.5 models, including date-suffixed ones', () => {
		// Regression guard: the datestamp must not be read as the minor version.
		expect(modelSupportsToolSearch('claude-sonnet-4-20250514')).toBe(false);
		expect(modelSupportsToolSearch('claude-sonnet-4')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4-1')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4.1')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4-1-20250805')).toBe(false);
	});

	test('rejects non-Sonnet/Opus Claude families', () => {
		expect(modelSupportsToolSearch('claude-haiku-4-5')).toBe(false);
		expect(modelSupportsToolSearch('claude-3-5-sonnet-20241022')).toBe(false);
		expect(modelSupportsToolSearch('claude-3-opus')).toBe(false);
	});

	test('supports OpenAI gpt-5.4 models when the setting is enabled', () => {
		const configurationService = {
			getExperimentBasedConfig: (key: unknown) => key === ConfigKey.ResponsesApiToolSearchEnabled,
		} as unknown as IConfigurationService;
		const experimentationService = {} as IExperimentationService;

		expect(modelSupportsToolSearch('gpt-5.4', configurationService, experimentationService)).toBe(true);
		expect(modelSupportsToolSearch('gpt-5.4-preview', configurationService, experimentationService)).toBe(true);
		expect(modelSupportsToolSearch('gpt-5.4')).toBe(false);
	});

	test('rejects other non-Claude models', () => {
		expect(modelSupportsToolSearch('gpt-5')).toBe(false);
		expect(modelSupportsToolSearch('gemini-2.5-pro')).toBe(false);
		expect(modelSupportsToolSearch('o4-mini')).toBe(false);
	});
});
