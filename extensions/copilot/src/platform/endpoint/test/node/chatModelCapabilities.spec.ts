/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import type { IChatEndpoint } from '../../../networking/common/networking';
import { getModelCapabilityOverride, modelSupportsContextEditing, modelSupportsPDFDocuments, modelSupportsToolSearch } from '../../common/chatModelCapabilities';

function fakeModel(family: string, model: string = family) {
	return { family, model } as unknown as IChatEndpoint;
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

	test('returns true for gpt-5 plus families', () => {
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.4'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.4-mini'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.5'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.5-mini'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-4'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.1'))).toBe(true);
	});

	test('returns false for other families', () => {
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

	test('supports OpenAI gpt-5.4 and gpt-5.5 models', () => {
		expect(modelSupportsToolSearch('gpt-5.4')).toBe(true);
		expect(modelSupportsToolSearch('gpt-5.5')).toBe(true);
	});

	test('rejects suffixed gpt-5.4/5.5 variants (exact match only)', () => {
		expect(modelSupportsToolSearch('gpt-5.4-mini')).toBe(false);
		expect(modelSupportsToolSearch('gpt-5.4-preview')).toBe(false);
		expect(modelSupportsToolSearch('gpt-5.5-preview')).toBe(false);
		expect(modelSupportsToolSearch('gpt5.5-preview')).toBe(false);
	});

	test('rejects other non-Claude models', () => {
		expect(modelSupportsToolSearch('gpt-5')).toBe(false);
		expect(modelSupportsToolSearch('gemini-2.5-pro')).toBe(false);
		expect(modelSupportsToolSearch('o4-mini')).toBe(false);
	});

	test('matches via endpoint.family when the model id is unknown', () => {
		// An unknown preview id whose family has been aliased to a supported production family.
		expect({
			'preview-id + family=claude-opus-4.7': modelSupportsToolSearch(fakeModel('claude-opus-4.7', 'preview-anthropic')),
			'preview-id + family=claude-sonnet-4.6': modelSupportsToolSearch(fakeModel('claude-sonnet-4.6', 'preview-sonnet-internal')),
			'preview-id + family=claude-opus-4 (pre-4.5)': modelSupportsToolSearch(fakeModel('claude-opus-4', 'preview-opus-old')),
			'known id + family=unknown': modelSupportsToolSearch(fakeModel('mystery-family', 'claude-opus-4.7')),
		}).toEqual({
			'preview-id + family=claude-opus-4.7': true,
			'preview-id + family=claude-sonnet-4.6': true,
			'preview-id + family=claude-opus-4 (pre-4.5)': false,
			'known id + family=unknown': true,
		});
	});
});

describe('modelSupportsContextEditing', () => {
	test('matches Claude id strings', () => {
		expect({
			'claude-opus-4.6': modelSupportsContextEditing('claude-opus-4.6'),
			'claude-sonnet-4.5': modelSupportsContextEditing('claude-sonnet-4.5'),
			'claude-haiku-4-5': modelSupportsContextEditing('claude-haiku-4-5'),
			'claude-opus-4.6-1m': modelSupportsContextEditing('claude-opus-4.6-1m'),
			'gpt-5': modelSupportsContextEditing('gpt-5'),
		}).toEqual({
			'claude-opus-4.6': true,
			'claude-sonnet-4.5': true,
			'claude-haiku-4-5': true,
			'claude-opus-4.6-1m': false, // 1M variant excluded
			'gpt-5': false,
		});
	});

	test('matches via endpoint.family when the model id is unknown', () => {
		expect({
			'preview-id + family=claude-opus-4.6': modelSupportsContextEditing(fakeModel('claude-opus-4.6', 'preview-anthropic')),
			'preview-id + family=claude-haiku-4-5': modelSupportsContextEditing(fakeModel('claude-haiku-4-5', 'preview-haiku-internal')),
			'preview-id + family=mystery': modelSupportsContextEditing(fakeModel('mystery-family', 'preview-anything')),
		}).toEqual({
			'preview-id + family=claude-opus-4.6': true,
			'preview-id + family=claude-haiku-4-5': true,
			'preview-id + family=mystery': false,
		});
	});
});

describe('getModelCapabilityOverride', () => {
	function makeConfig(map: Record<string, unknown>): IConfigurationService {
		const service = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		service.setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, map as never);
		return service;
	}

	test('returns the entry for a known model id', () => {
		const config = makeConfig({
			'preview-anthropic': { family: 'claude-opus-4.7' },
		});
		expect(getModelCapabilityOverride('preview-anthropic', config)).toEqual({
			family: 'claude-opus-4.7',
		});
	});

	test('returns undefined for unknown model ids and when nothing is configured', () => {
		const config = makeConfig({
			'preview-anthropic': { family: 'claude-opus-4.7' },
		});
		expect({
			unknown: getModelCapabilityOverride('something-else', config),
			emptyMap: getModelCapabilityOverride('preview-anthropic', makeConfig({})),
		}).toEqual({
			unknown: undefined,
			emptyMap: undefined,
		});
	});
});
